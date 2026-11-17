// e-Boekhouden's official REST contract: https://api.e-boekhouden.nl/openapi/v1.json
// An invoice POST is not idempotent. Never retry it after an uncertain response.
const BASE='https://api.e-boekhouden.nl';
const TEMPLATE_NAME='Idea2Music';
const LEDGER_CODE='8050';
const integer=value=>Number.isSafeInteger(Number(value)) && Number(value)>0 ? Number(value) : null;
const countryCode=value=>({nederland:'NL',netherlands:'NL',belgië:'BE',belgie:'BE',belgium:'BE'})[String(value).trim().toLowerCase()]||String(value).trim().toUpperCase();
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
export function invoiceSenderEmail(env) {
 // Resend uses a display-name header; e-Boekhouden requires a bare address.
 const from=String(env.MAIL_FROM||'').trim();
 const email=(from.match(/<([^<>]+)>$/)?.[1]||from).trim();
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error('ebookhouden_sender_invalid');
 return email;
}
function apiErrorCode(responseBody) {
 // Only persist documented machine-readable validation codes, never a raw
 // response body which might contain personal or financial information.
 const match=JSON.stringify(responseBody).match(/\b(?:FACT|FACT_ITEM|FACT_EMAIL)_[0-9]{3}\b/i);
 return match ? match[0].toLowerCase() : null;
}
export function invoicingConfigured(env) {
 if(env.EBOEKHOUDEN_INVOICING_ENABLED!=='true' || !env.EBOEKHOUDEN_API_TOKEN || !env.ORDERS_DB || !env.MOLLIE_API_KEY?.startsWith('live_')) return false;
 const mode=env.EBOEKHOUDEN_INVOICING_MODE||'pilot';
 if(mode==='pilot') return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.EBOEKHOUDEN_TEST_ORDER_ID||'');
 if(mode==='new-orders') return validCutoff(env.EBOEKHOUDEN_NEW_ORDERS_FROM)!==null;
 return false;
}
function validCutoff(value) {
 // A deliberate, precise UTC activation time is required. No backfill of paid
 // orders created before the explicit cutover, even if their webhook repeats.
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value||'')) return null;
 const parsed=Date.parse(value);
 return Number.isFinite(parsed) && new Date(parsed).toISOString()===value ? parsed : null;
}
export function invoiceAllowedForOrder(env,row) {
 if(!invoicingConfigured(env) || row.payment_status!=='paid') return false;
 const mode=env.EBOEKHOUDEN_INVOICING_MODE||'pilot';
 if(mode==='pilot') return row.id===env.EBOEKHOUDEN_TEST_ORDER_ID;
 const created=Date.parse(row.created_at), cutoff=validCutoff(env.EBOEKHOUDEN_NEW_ORDERS_FROM);
 return cutoff!==null && Number.isFinite(created) && created>=cutoff;
}
function entry(data) {
 return {
  type:data.company?'B':'P',
  // A stable per-order code prevents repeated relation creation for the same order.
  code:`I2M${data.orderId.replace(/-/g,'').slice(0,25)}`,
  name:data.company||data.name,
  contact:data.company?data.name:undefined,
  address:`${data.billingStreet} ${data.billingNumber}`,
  postalCode:data.billingPostalCode,
  city:data.billingCity,
  country:countryCode(data.billingCountry),
  emailAddress:data.email,
  emailAddressInvoice:data.email,
  phoneNumber:data.phone||undefined,
  vatNumber:data.vatNumber||undefined
 };
}
async function api(path,{token,method='GET',body}={}) {
 const response=await fetch(`${BASE}${path}`,{
  method,
  headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8500)
 });
 if(!response.ok) {
  const detail=await response.text().catch(()=> '');
  let code=null;
  try {code=apiErrorCode(JSON.parse(detail));} catch {code=apiErrorCode(detail);}
  const stage=path==='/v1/invoice'?'invoice':'lookup';
  throw new Error(`ebookhouden_${stage}_${code||`http_${response.status}`}`);
 }
 return response.json();
}
async function session(env) {
 const response=await fetch(`${BASE}/v1/session`,{
  method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify({accessToken:env.EBOEKHOUDEN_API_TOKEN,source:'Idea2Music'}),
  signal:AbortSignal.timeout(8500)
 });
 if(!response.ok) throw new Error(`ebookhouden_session_${response.status}`);
 const result=await response.json();
 if(!result.token) throw new Error('ebookhouden_no_session');
 return result.token;
}
export function invoicePayload(row,data,relationId,{templateId,ledgerId},fromEmail) {
 return {
  relationId,date:new Date(row.paid_at).toISOString().slice(0,10),
  termOfPayment:0,inExVat:'IN',templateId,
  // Payment references have a restricted length in e-Boekhouden (FACT_014).
  // The full unique order UUID remains in the invoice email and D1 outbox.
  reference:`I2M-${row.id.replace(/-/g,'').slice(0,20)}`,text:`Reeds betaald via Mollie (${row.payment_id}). Niet opnieuw betalen.`,
  items:[{quantity:1,code:'I2M-SONG',description:'Idea2Music – persoonlijk lied op maat (digitaal)',
   pricePerUnit:row.amount_cents/100,vatCode:'HOOG_VERK_21',ledgerId}],
  email:{fromEmail,fromName:'Idea2Music',subject:`Uw betaalde Idea2Music-factuur – I2M-${row.id}`,
   body:`Beste ${escapeHtml(data.name)},<p>Bedankt voor uw bestelling. In de bijlage vindt u de factuur; deze is reeds betaald via Mollie. U hoeft niets meer over te maken.</p><p>Met muzikale groet,<br>Idea2Music</p>`,attachUbl:false}
 };
}
export function selectAccountingIds(templates,ledgers) {
 const matchingTemplates=templates.items?.filter(item=>item.name===TEMPLATE_NAME && item.active!==false)||[];
 const matchingLedgers=ledgers.items?.filter(item=>String(item.code)===LEDGER_CODE)||[];
 if(matchingTemplates.length!==1 || !integer(matchingTemplates[0].id)) throw new Error('ebookhouden_template_not_unique');
 if(matchingLedgers.length!==1 || !integer(matchingLedgers[0].id)) throw new Error('ebookhouden_ledger_not_unique');
 return {templateId:matchingTemplates[0].id,ledgerId:matchingLedgers[0].id};
}
async function create(env,row) {
 const data={...JSON.parse(row.payload_json),orderId:row.id};
 // Older paid orders predate the required billing fields. Keep their immutable
 // checkout payload unchanged; load a single-order override from private D1.
 if(!data.billingStreet || !data.billingNumber || !data.billingPostalCode || !data.billingCity || !data.billingCountry) {
  const override=await env.ORDERS_DB.prepare('SELECT street,number,postal_code,city,country FROM invoice_test_billing WHERE order_id=?').bind(row.id).first();
  if(!override) throw new Error('ebookhouden_billing_missing');
  Object.assign(data,{billingStreet:override.street,billingNumber:override.number,billingPostalCode:override.postal_code,billingCity:override.city,billingCountry:override.country});
 }
 if(!data.name || !data.email) throw new Error('ebookhouden_customer_missing');
 // Foreign B2C/B2B VAT treatment is not universal. Keep checkout worldwide,
 // but require a reviewed invoice before applying a VAT code abroad.
 if(countryCode(data.billingCountry)!=='NL') throw new Error('ebookhouden_foreign_invoice_review');
 const token=await session(env), relation=entry(data);
 // Look up numeric IDs read-only using the exact template name and ledger code.
 // Do not risk invoicing with an unrelated NarrowVision account/template.
 const [templates,ledgers]=await Promise.all([
  api('/v1/invoicetemplate?limit=2000',{token}),api('/v1/ledger?limit=2000',{token})
 ]);
 const accounting=selectAccountingIds(templates,ledgers);
 const query=new URLSearchParams({code:relation.code});
 const existing=await api(`/v1/relation?${query}`,{token});
 let relationId=existing.items?.find(item=>item.code===relation.code)?.id;
 if(!relationId) {
  // A relation may have been created before a prior failed invoice attempt.
  const created=await api('/v1/relation',{token,method:'POST',body:relation});
  relationId=created.id;
 }
 if(!integer(relationId)) throw new Error('ebookhouden_relation_missing');
 // From this point the remote call can have succeeded even if the reply is lost.
 await env.ORDERS_DB.prepare("UPDATE invoice_outbox SET state='review',error_code='invoice_response_uncertain' WHERE order_id=? AND state='processing'").bind(row.id).run();
 const invoice=await api('/v1/invoice',{token,method:'POST',body:invoicePayload(row,data,relationId,accounting,invoiceSenderEmail(env))});
 if(!integer(invoice.id) || !invoice.invoiceNumber) throw new Error('ebookhouden_invoice_unconfirmed');
 await env.ORDERS_DB.prepare("UPDATE invoice_outbox SET state='sent',finished_at=?,invoice_id=?,invoice_number=?,error_code=NULL WHERE order_id=?")
  .bind(new Date().toISOString(),invoice.id,invoice.invoiceNumber,row.id).run();
}
export async function maybeInvoicePaid(env,row) {
 if(!invoiceAllowedForOrder(env,row)) return;
 await env.ORDERS_DB.prepare('INSERT OR IGNORE INTO invoice_outbox(order_id) VALUES(?)').bind(row.id).run();
 // Atomic one-shot claim. Neither webhook nor status polling can create a second invoice.
 const claim=await env.ORDERS_DB.prepare("UPDATE invoice_outbox SET state='processing',started_at=? WHERE order_id=? AND state='pending' RETURNING order_id")
  .bind(new Date().toISOString(),row.id).first();
 if(!claim) return;
 try { await create(env,row); }
 catch (error) {
  // No automatic retry: a relation or invoice may have been created remotely.
  await env.ORDERS_DB.prepare("UPDATE invoice_outbox SET state='review',finished_at=?,error_code=? WHERE order_id=? AND state!='sent'")
   .bind(new Date().toISOString(),/^ebookhouden_[a-z_0-9]+$/.test(error.message)?error.message:'ebookhouden_transport',row.id).run();
 }
}
