import {CONSENT_VERSION, CONSENT, DELIVERY, fields, priceAt, euro, validateOrder} from '../../lib/order-rules.js';
import {maybeInvoicePaid} from '../../lib/ebookhouden.js';

const json = (data, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const fail = (status, message) => Object.assign(new Error(message), {status});
const sha = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const validId = value => typeof value==='string' && /^[0-9a-f-]{36}$/.test(value);
const validToken = value => typeof value==='string' && /^[0-9a-f]{64}$/.test(value);
function configured(env) {
 return env.CHECKOUT_ENABLED === 'true' && !!env.ORDERS_DB && /^(test|live)_[A-Za-z0-9]+$/.test(env.MOLLIE_API_KEY || '') && !!env.RESEND_API_KEY && !!env.MAIL_FROM && /^https:\/\//.test(env.PUBLIC_SITE_URL || '');
}
async function readiness(env) {
 const checks={
  database:false,
  mollie:/^(test|live)_[A-Za-z0-9]+$/.test(env.MOLLIE_API_KEY || ''),
  email:!!env.RESEND_API_KEY,
  sender:!!env.MAIL_FROM,
  site:/^https:\/\//.test(env.PUBLIC_SITE_URL || ''),
  switch:env.CHECKOUT_ENABLED==='true'
 };
 if(env.ORDERS_DB) {
  try {
   await Promise.all([
    env.ORDERS_DB.prepare('SELECT id,token_hash,payload_hash,payload_json,amount_cents,created_at,payment_id,checkout_url,payment_status,paid_at,cancellation_requested_at,consent_version FROM orders LIMIT 0').all(),
    env.ORDERS_DB.prepare('SELECT id,order_id,body_json,state,claimed_at,sent_at,provider_id FROM mail_outbox LIMIT 0').all(),
    env.ORDERS_DB.prepare('SELECT id,count,expires_at FROM rate_limits LIMIT 0').all()
   ]);
   checks.database=true;
  } catch { /* Only return readiness flags, never SQL or credentials. */ }
 }
 return checks;
}
function site(env) { return new URL(env.PUBLIC_SITE_URL).origin; }
async function limited(request,env,kind,max) {
 const minute=Math.floor(Date.now()/60000), ip=request.headers.get('CF-Connecting-IP') || 'local';
 const id=await sha(`${kind}:${ip}:${minute}`);
 const r=await env.ORDERS_DB.prepare('INSERT INTO rate_limits(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count').bind(id,minute+2).first();
 await env.ORDERS_DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(minute).run();
 if(r.count>max) throw fail(429,'Te veel pogingen. Wacht een minuut en probeer opnieuw.');
}
async function readBody(request) {
 if(Number(request.headers.get('Content-Length')) > 24000) throw fail(413,'Uw verhaal is te lang.');
 const reader=request.body?.getReader(); let text='',size=0; const decoder=new TextDecoder();
 if(!reader) throw fail(400,'Uw aanvraag is leeg.');
 while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>24000){await reader.cancel();throw fail(413,'Uw verhaal is te lang.');}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();
 try{return JSON.parse(text);}catch{throw fail(400,'Controleer uw gegevens en probeer opnieuw.');}
}
async function mollie(env,path,options={}) {
 const response=await fetch(`https://api.mollie.com/v2/${path}`,{...options,headers:{Authorization:`Bearer ${env.MOLLIE_API_KEY}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(9000)});
 if(!response.ok) throw fail(502,'Mollie is tijdelijk niet bereikbaar. Probeer opnieuw; uw bestelling wordt niet dubbel aangemaakt.');
 return response.json();
}
async function authorize(request,env,id,token) {
 if(!validId(id)||!validToken(token)) throw fail(404,'Bestelling niet gevonden. Open de link uit uw bevestiging.');
 const row=await env.ORDERS_DB.prepare('SELECT * FROM orders WHERE id=? AND token_hash=?').bind(id,await sha(token)).first();
 if(!row) throw fail(404,'Bestelling niet gevonden. Open de link uit uw bevestiging.');
 return row;
}
function access(request) { return (request.headers.get('Authorization')||'').replace(/^Bearer /,''); }
async function enqueue(env,row,kind,to,subject,text) {
 const body={from:env.MAIL_FROM,to:[to],reply_to:'info@narrowvision.eu',subject,text};
 await env.ORDERS_DB.prepare('INSERT OR IGNORE INTO mail_outbox(id,order_id,body_json) VALUES(?,?,?)').bind(`${row.id}-${kind}`,row.id,JSON.stringify(body)).run();
}
async function flush(env,orderId) {
 const {results}=await env.ORDERS_DB.prepare("SELECT * FROM mail_outbox WHERE order_id=? AND state!='sent'").bind(orderId).all();
 for(const entry of results) {
  const now=Date.now();
  // A short lease avoids two webhook/status calls sending the same notification concurrently.
  const claim=await env.ORDERS_DB.prepare("UPDATE mail_outbox SET state='sending',claimed_at=? WHERE id=? AND (state='pending' OR (state='sending' AND claimed_at<?)) RETURNING id").bind(now,entry.id,now-30000).first();
  if(!claim) throw fail(503,'Bevestiging wordt verwerkt. Probeer zo opnieuw.');
  try {
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':entry.id},body:entry.body_json,signal:AbortSignal.timeout(8000)});
   if(!response.ok) throw fail(503,'Bevestiging wordt opnieuw aangeboden.');
   const sent=await response.json();
   await env.ORDERS_DB.prepare("UPDATE mail_outbox SET state='sent',sent_at=?,provider_id=? WHERE id=?").bind(new Date().toISOString(),sent.id,entry.id).run();
  } catch(error) {
   await env.ORDERS_DB.prepare("UPDATE mail_outbox SET state='pending' WHERE id=?").bind(entry.id).run();
   throw error;
  }
 }
}
async function notifyPaid(env,row) {
 const data=JSON.parse(row.payload_json), amount=euro(row.amount_cents), test=env.MOLLIE_API_KEY.startsWith('test_');
 const ref=`I2M-${row.id}`;
 const summary=Object.entries(fields).map(([key,spec])=>`${spec.label}: ${data[key] || 'Niet opgegeven'}`).join('\n\n');
 const company='Idea2Music, handelsnaam van NarrowVision\nRhijnauwensingel 482, 3077 VM Rotterdam\nKVK 42203449 · Btw-id NL005580746B56\ninfo@narrowvision.eu';
 const terms='Uw bestelling betreft één persoonlijk, met AI gemaakt lied met songtekst, digitaal geleverd per e-mail. '+DELIVERY+' U kunt vóór levering kosteloos annulering aanvragen via de website of info@narrowvision.eu. Uw wettelijke bedenktijd bedraagt 14 dagen; voor digitale inhoud kan deze met uw instemming vervallen bij starten van downloaden of afspelen. Uw rechten bij een gebrekkig product blijven bestaan. Neem bij onjuiste uitspraak of een ander probleem contact op; wij zoeken een passende oplossing.';
 await enqueue(env,row,'merchant-paid','info@narrowvision.eu',`${test?'[TEST] ':''}Betaalde opdracht ${ref}`,`Bedrag: ${amount} inclusief btw\nMollie: ${row.payment_id}\n${row.cancellation_requested_at?'LET OP: annulering aangevraagd; niet produceren.\n':''}\n${summary}\n\nToestemming (${row.consent_version}): ${CONSENT}`);
 await enqueue(env,row,'customer-paid',data.email,`${test?'[TEST] ':''}Uw bestelling bij Idea2Music — ${ref}`,`Beste ${data.name},\n\n${test?'Dit is een testbestelling. Er is geen echte betaling uitgevoerd.\n\n':''}Wij hebben uw betaling van ${amount} inclusief btw ontvangen.\nBestelnummer: ${ref}\n\n${DELIVERY}\n\nUw ingevulde gegevens:\n${summary}\n\nBestelafspraken:\n${terms}\n\nU heeft vooraf ingestemd met:\n${CONSENT}\nToestemmingsversie: ${row.consent_version}\n\nAnnuleren: ga naar ${site(env)}/annuleren.html en vul het bestelnummer en het e-mailadres van uw bestelling in. U kunt ook antwoorden op deze e-mail. U ontvangt een bevestiging van uw verzoek. Een eventuele terugbetaling wordt afzonderlijk verwerkt.\n\n${company}`);
 await flush(env,row.id);
}
async function syncPayment(env,row,payment) {
 if(payment.metadata?.orderId!==row.id || payment.amount?.currency!=='EUR' || payment.amount?.value!==(row.amount_cents/100).toFixed(2) || payment.mode!==(env.MOLLIE_API_KEY.startsWith('test_')?'test':'live') || (row.payment_id && row.payment_id!==payment.id)) throw fail(409,'De betaling kon niet aan deze bestelling worden gekoppeld. Neem contact op.');
 const status=payment.status;
 if(!['open','pending','authorized','paid','failed','canceled','expired'].includes(status)) throw fail(502,'Onbekende betaalstatus.');
 await env.ORDERS_DB.prepare("UPDATE orders SET payment_id=COALESCE(payment_id,?),payment_status=CASE WHEN payment_status='paid' THEN 'paid' ELSE ? END,paid_at=COALESCE(paid_at,?) WHERE id=?").bind(payment.id,status,status==='paid'?(payment.paidAt||new Date().toISOString()):null,row.id).run();
 const updated=await env.ORDERS_DB.prepare('SELECT * FROM orders WHERE id=?').bind(row.id).first();
 if(updated.payment_status==='paid') {
  await notifyPaid(env,updated);
  // Invoice failures must not affect the already verified Mollie payment.
  // The integration remains off unless explicitly configured and enabled.
  try { await maybeInvoicePaid(env,updated); } catch { /* monitored via invoice_outbox */ }
 }
 return updated;
}
async function checkout(request,env) {
 await limited(request,env,'checkout',6);
 const body=await readBody(request), {values,errors}=validateOrder(body.answers);
 if(Object.keys(errors).length) return json({message:'Controleer de aangegeven velden.',errors},422);
 if(!validId(body.orderId)||!validToken(body.token)) throw fail(400,'Herlaad de pagina en probeer opnieuw.');
 const tokenHash=await sha(body.token), payload=JSON.stringify(values), payloadHash=await sha(payload);
 let row=await env.ORDERS_DB.prepare('SELECT * FROM orders WHERE id=?').bind(body.orderId).first();
 if(row && (row.token_hash!==tokenHash||row.payload_hash!==payloadHash)) throw fail(409,'De gegevens zijn gewijzigd. Start een nieuwe bestelling.');
 if(!row) {
  const quotedPrice=priceAt();
  if(body.amountCents!==quotedPrice) throw fail(409,'De actieprijs is gewijzigd. Herlaad de pagina om de actuele prijs te zien.');
  await env.ORDERS_DB.prepare('INSERT OR IGNORE INTO orders(id,token_hash,payload_hash,payload_json,amount_cents,created_at,consent_version) VALUES(?,?,?,?,?,?,?)').bind(body.orderId,tokenHash,payloadHash,payload,quotedPrice,new Date().toISOString(),CONSENT_VERSION).run();
  row=await authorize(request,env,body.orderId,body.token);
  if(row.payload_hash!==payloadHash) throw fail(409,'De gegevens zijn gewijzigd. Start een nieuwe bestelling.');
 }
 if(row.cancellation_requested_at) throw fail(409,'Voor deze bestelling is annulering aangevraagd. Neem contact op.');
 if(row.payment_status==='paid') return json({paid:true,orderId:row.id});
 if(Date.now()-Date.parse(row.created_at)>30*60000) throw fail(409,'Deze betaalpoging is verlopen. Start een nieuwe bestelling.');
 if(!row.payment_id) {
  const payment=await mollie(env,'payments',{method:'POST',headers:{'Idempotency-Key':row.id},body:JSON.stringify({amount:{currency:'EUR',value:(row.amount_cents/100).toFixed(2)},description:`Idea2Music I2M-${row.id}`,redirectUrl:`${site(env)}/bestelling.html#${row.id}:${body.token}`,webhookUrl:`${site(env)}/api/webhook`,metadata:{orderId:row.id}})});
  const target=new URL(payment._links?.checkout?.href);
  if(target.protocol!=='https:'||!['www.mollie.com','mollie.com'].includes(target.hostname)) throw fail(502,'De betaallink is niet beschikbaar.');
  await env.ORDERS_DB.prepare('UPDATE orders SET payment_id=?,checkout_url=? WHERE id=? AND payment_id IS NULL').bind(payment.id,target.href,row.id).run();
  row=await env.ORDERS_DB.prepare('SELECT * FROM orders WHERE id=?').bind(row.id).first();
 }
 return json({checkoutUrl:row.checkout_url,orderId:row.id});
}
async function cancel(request,env) {
 await limited(request,env,'cancel',5);
 const body=await readBody(request), id=String(body.orderId||'').replace(/^I2M-/,''), email=String(body.email||'').trim().toLowerCase();
 if(!validId(id)||!email) throw fail(400,'Vul uw volledige bestelnummer en e-mailadres in.');
 const row=await env.ORDERS_DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
 // A generic response prevents revealing whether an order or email exists.
 if(!row||JSON.parse(row.payload_json).email.toLowerCase()!==email) return json({received:true});
 const when=new Date().toISOString();
 await env.ORDERS_DB.prepare('UPDATE orders SET cancellation_requested_at=COALESCE(cancellation_requested_at,?) WHERE id=?').bind(when,id).run();
 await enqueue(env,row,'merchant-cancel','info@narrowvision.eu',`Annuleringsverzoek I2M-${id}`,`Er is annulering aangevraagd voor I2M-${id}. Stop de productie en controleer levering/betaling en wettelijke rechten. Verwerk een eventuele terugbetaling in Mollie.\nKlant: ${email}\nOntvangen: ${when}`);
 await enqueue(env,row,'customer-cancel',email,`Ontvangst annuleringsverzoek I2M-${id}`,`Uw annuleringsverzoek voor I2M-${id} is ontvangen. Dit bericht bevestigt uw verzoek; een eventuele terugbetaling wordt afzonderlijk verwerkt. Wij nemen contact met u op.\n\nIdea2Music · info@narrowvision.eu`);
 await flush(env,id);
 return json({received:true});
}
export async function onRequest({request,env,params}) {
 try {
  const path=Array.isArray(params.path)?params.path.join('/'):params.path;
  if(path==='config'&&request.method==='GET') { const checks=await readiness(env); return json({enabled:Object.values(checks).every(Boolean),test:env.MOLLIE_API_KEY?.startsWith('test_') || false,amountCents:priceAt(),checks}); }
  if(!configured(env)) throw fail(503,'Online bestellen is nog niet beschikbaar. Neem contact op via info@narrowvision.eu.');
  if(request.method==='POST'&&path!=='webhook'&&request.headers.get('Origin')!==site(env)) throw fail(403,'Open het formulier via de website.');
  if(path==='checkout'&&request.method==='POST') return await checkout(request,env);
  if(path==='cancel'&&request.method==='POST') return await cancel(request,env);
  if(path==='status'&&request.method==='GET') {
   await limited(request,env,'status',45);
   let row=await authorize(request,env,new URL(request.url).searchParams.get('id'),access(request));
   if(row.payment_id) row=await syncPayment(env,row,await mollie(env,`payments/${row.payment_id}`));
   return json({orderId:row.id,status:row.payment_status,amountCents:row.amount_cents,testMode:env.MOLLIE_API_KEY.startsWith('test_'),cancellationRequested:!!row.cancellation_requested_at});
  }
  if(path==='webhook'&&request.method==='POST') {
   const text=await request.text();if(text.length>300)throw fail(400,'Ongeldig bericht.');
   const id=new URLSearchParams(text).get('id');
   if(!/^tr_[A-Za-z0-9]+$/.test(id||''))throw fail(400,'Ongeldig bericht.');
   const payment=await mollie(env,`payments/${id}`);
   const row=await env.ORDERS_DB.prepare('SELECT * FROM orders WHERE id=?').bind(payment.metadata?.orderId||'').first();
   if(row) await syncPayment(env,row,payment);
   return json({received:true});
  }
  throw fail(404,'Niet gevonden.');
 } catch(error) {
  // No provider responses, customer data or credentials in logs or public errors.
  return json({message:error.status?error.message:'Dit lukt nu niet. Probeer opnieuw of mail info@narrowvision.eu.'},error.status||503);
 }
}
