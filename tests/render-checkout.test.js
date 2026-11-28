import test from 'node:test';
import assert from 'node:assert/strict';
import {openOrdersDb} from '../scripts/render-db.mjs';
import {readFileSync} from 'node:fs';
import {onRequest} from '../functions/api/[[path]].js';
import {priceAt,PROMO_END,validateOrder} from '../lib/order-rules.js';
const originalFetch=globalThis.fetch;
const answers={name:'Robin Test',email:'customer@example.test',phone:'',billingStreet:'Voorbeeldstraat',billingNumber:'12A',billingPostalCode:'1234 AB',billingCity:'Rotterdam',billingCountry:'Nederland',company:'',vatNumber:'',recipient:'Sam',occasion:'Verjaardag',story:'Een persoonlijk verhaal met voldoende details voor een lied.',style:'Pop',mood:'Vrolijk',language:'Nederlands',pronunciation:'',terms:true,digitalConsent:true};
function setup(){
 const binding=openOrdersDb();
 const db={prepare:sql=>({get:(...args)=>binding.prepare(sql).bind(...args).first()}),exec:sql=>binding.prepare(sql).run(),close:()=>binding.close()};
 const env={CHECKOUT_ENABLED:'true',ORDERS_DB:binding,MOLLIE_API_KEY:'test_dummy',RESEND_API_KEY:'fake',MAIL_FROM:'Idea2Music <info@narrowvision.eu>',PUBLIC_SITE_URL:'https://www.idea2music.nl'};
 let created=0, emails=0, emailFailure=false;const payments=new Map();
 globalThis.fetch=async(url,options={})=>{
  if(String(url).startsWith('https://api.mollie.com/v2/payments')){
   if(options.method==='POST'){created++;const body=JSON.parse(options.body);const p={...body,id:'tr_payment1',mode:'test',status:'open',_links:{checkout:{href:'https://www.mollie.com/checkout/test'}}};payments.set(p.id,p);return Response.json(p);}
   return Response.json(payments.get(String(url).split('/').at(-1))||{status:'unknown'});
  }
  if(url==='https://api.resend.com/emails'){if(emailFailure){emailFailure=false;return new Response('',{status:503});}emails++;return Response.json({id:`email-${emails}`});}
  throw Error('Unexpected external request');
 };
 const identity={orderId:crypto.randomUUID(),token:'b'.repeat(64)};
 const call=async(path,{method='GET',body,origin='https://www.idea2music.nl',token=identity.token}={})=>{
  const headers={Origin:origin,Authorization:`Bearer ${token}`,'CF-Connecting-IP':'192.0.2.1'};
  let content;if(path==='webhook'){content=body;headers['Content-Type']='application/x-www-form-urlencoded';}else if(body){content=JSON.stringify(body);headers['Content-Type']='application/json';}
  return onRequest({request:new Request(`https://www.idea2music.nl/api/${path}${path==='status'?`?id=${identity.orderId}`:''}`,{method,headers,body:content}),env,params:{path:[path]}});
 };
 const start=()=>call('checkout',{method:'POST',body:{...identity,amountCents:priceAt(),answers}});
 return{db,env,call,start,identity,payments,get created(){return created;},get emails(){return emails;},failMail(){emailFailure=true;},close(){db.close();globalThis.fetch=originalFetch;}};
}
test('November offer ends at Dutch midnight, never inferred from client price',()=>{assert.equal(priceAt(PROMO_END-1),750);assert.equal(priceAt(PROMO_END),1500);});
test('questionnaire requires valid email, story and both explicit consents',()=>{const result=validateOrder({...answers,email:'wrong',story:'kort',digitalConsent:false,terms:false});assert.deepEqual(Object.keys(result.errors).sort(),['digitalConsent','email','story','terms']);});
test('billing address is required, while phone and business details are optional',()=>{
 const missing=validateOrder({...answers,billingStreet:'',billingNumber:'',billingPostalCode:'',billingCity:'',billingCountry:''});
 assert.deepEqual(Object.keys(missing.errors).sort(),['billingCity','billingCountry','billingNumber','billingPostalCode','billingStreet']);
 const valid=validateOrder(answers);
 assert.deepEqual(valid.errors,{});
 assert.equal(valid.values.phone,'');
 assert.equal(valid.values.company,'');
 assert.equal(valid.values.billingPostalCode,'1234 AB');
});
test('every billing field has a matching input and error message in the form',()=>{
 const page=readFileSync(new URL('../bestellen.html',import.meta.url),'utf8');
 for(const name of ['phone','billingStreet','billingNumber','billingPostalCode','billingCity','billingCountry','company','vatNumber']){
  assert.match(page,new RegExp(`name="${name}"`));
  assert.match(page,new RegExp(`id="${name}-error"`));
 }
 assert.match(page,/factuuradres, eventuele contact- en bedrijfsgegevens/);
});
test('three-step checkout retains essential questions and no longer asks what to avoid',()=>{
 const page=readFileSync(new URL('../bestellen.html',import.meta.url),'utf8');
 const client=readFileSync(new URL('../checkout.js',import.meta.url),'utf8');
 assert.match(page,/id="order-progress"/);
 for(const id of ['recipient','occasion','story','style','mood','language','pronunciation','name','email','billingStreet','billingNumber','billingPostalCode','billingCity','billingCountry']){
  assert.match(page,new RegExp('id="'+id+'"'));
 }
 assert.doesNotMatch(page,/id="avoid"|name="avoid"|Wat mag er juist niet in/);
 assert.match(client,/const stepDefinitions=/);
 assert.match(client,/showStep\(index\+1\)/);
 assert.match(client,/questions.hidden=true/);
 const validated=validateOrder({...answers,avoid:'Niet in het lied verwerken'});
 assert.deepEqual(validated.errors,{});
 assert.equal(Object.hasOwn(validated.values,'avoid'),false);
});
test('checkout is closed unless every activation dependency exists',async()=>{const x=setup();try{delete x.env.RESEND_API_KEY;assert.equal((await (await x.call('config')).json()).enabled,false);assert.equal((await x.start()).status,503);assert.equal(x.created,0);}finally{x.close();}});
test('rejects cross-origin checkout and client price manipulation',async()=>{const x=setup();try{assert.equal((await x.call('checkout',{method:'POST',origin:'https://evil.test',body:{...x.identity,answers,amountCents:750}})).status,403);assert.equal((await x.call('checkout',{method:'POST',body:{...x.identity,answers,amountCents:1}})).status,409);assert.equal(x.created,0);}finally{x.close();}});
test('same checkout is resumable and creates only one payment',async()=>{const x=setup();try{assert.equal((await x.start()).status,200);assert.equal((await x.start()).status,200);assert.equal(x.created,1);assert.equal(x.db.prepare('SELECT count(*) n FROM orders').get().n,1);assert.equal(x.emails,0);}finally{x.close();}});
test('unknown or incorrect bearer token exposes no order details',async()=>{const x=setup();try{await x.start();const r=await x.call('status',{token:'c'.repeat(64)});assert.equal(r.status,404);assert.ok(!(await r.text()).includes(answers.email));}finally{x.close();}});
test('redirect/status alone does not mark an open payment as paid',async()=>{const x=setup();try{await x.start();const r=await x.call('status');assert.equal((await r.json()).status,'open');assert.equal(x.emails,0);}finally{x.close();}});
test('forged paid webhook amount is rejected and does not trigger fulfilment',async()=>{const x=setup();try{await x.start();const p=x.payments.get('tr_payment1');p.status='paid';p.amount.value='0.01';const r=await x.call('webhook',{method:'POST',body:'id=tr_payment1'});assert.equal(r.status,409);assert.equal(x.emails,0);assert.equal(x.db.prepare('SELECT payment_status FROM orders').get().payment_status,'open');}finally{x.close();}});
test('paid callback sends customer and merchant once, retries do not duplicate',async()=>{const x=setup();try{await x.start();x.payments.get('tr_payment1').status='paid';assert.equal((await x.call('webhook',{method:'POST',body:'id=tr_payment1'})).status,200);assert.equal((await x.call('webhook',{method:'POST',body:'id=tr_payment1'})).status,200);assert.equal((await x.call('status')).status,200);assert.equal(x.emails,2);assert.equal(x.db.prepare('SELECT payment_status FROM orders').get().payment_status,'paid');}finally{x.close();}});
test('mail failure preserves paid order and retries outstanding mail',async()=>{const x=setup();try{await x.start();x.payments.get('tr_payment1').status='paid';x.failMail();assert.equal((await x.call('webhook',{method:'POST',body:'id=tr_payment1'})).status,503);assert.equal(x.db.prepare('SELECT payment_status FROM orders').get().payment_status,'paid');assert.equal((await x.call('webhook',{method:'POST',body:'id=tr_payment1'})).status,200);assert.equal(x.emails,2);}finally{x.close();}});
test('cancellation records request and confirms it exactly once to both parties',async()=>{const x=setup();try{await x.start();const body={orderId:`I2M-${x.identity.orderId}`,email:answers.email};assert.equal((await x.call('cancel',{method:'POST',body})).status,200);assert.equal((await x.call('cancel',{method:'POST',body})).status,200);assert.ok(x.db.prepare('SELECT cancellation_requested_at FROM orders').get().cancellation_requested_at);assert.equal(x.emails,2);assert.equal((await x.start()).status,409);}finally{x.close();}});
test('unknown cancellation request does not reveal identity or send mail',async()=>{const x=setup();try{await x.start();const r=await x.call('cancel',{method:'POST',body:{orderId:x.identity.orderId,email:'someoneelse@example.test'}});assert.deepEqual(await r.json(),{received:true});assert.equal(x.emails,0);}finally{x.close();}});

test('public readiness checks actual tables without revealing credentials',async()=>{const x=setup();try{const r=await x.call('config');const result=await r.json();assert.equal(result.enabled,true);assert.deepEqual(result.checks,{database:true,mollie:true,email:true,sender:true,site:true,switch:true});assert.ok(!JSON.stringify(result).includes('test_dummy'));x.db.exec('DROP TABLE mail_outbox');const missing=await(await x.call('config')).json();assert.equal(missing.enabled,false);assert.equal(missing.checks.database,false);}finally{x.close();}});
test('readiness diagnoses all dependencies while ordering stays switched off',async()=>{const x=setup();try{delete x.env.CHECKOUT_ENABLED;const data=await(await x.call('config')).json();assert.equal(data.enabled,false);assert.equal(data.checks.switch,false);assert.equal(data.checks.database,true);assert.equal((await x.start()).status,503);}finally{x.close();}});
