import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {maybeInvoicePaid,invoicingConfigured,invoicePayload,selectAccountingIds} from '../lib/ebookhouden.js';

const originalFetch=globalThis.fetch;
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const migration of ['0001_orders.sql','0002_invoice_outbox.sql']) db.exec(readFileSync(new URL(`../migrations/${migration}`,import.meta.url),'utf8'));
 const binding={prepare(sql){let params=[];return{bind(...args){params=args;return this;},async first(){return db.prepare(sql).get(...params)||null;},async run(){return db.prepare(sql).run(...params);}};}};
 const env={ORDERS_DB:binding,EBOEKHOUDEN_INVOICING_ENABLED:'true',EBOEKHOUDEN_API_TOKEN:'never-log-me',MOLLIE_API_KEY:'live_dummy'};
 const orderId=crypto.randomUUID();
 const row={id:orderId,payment_status:'paid',amount_cents:750,paid_at:'2026-11-17T10:00:00Z',payment_id:'tr_test',payload_json:JSON.stringify({name:'Test Klant',email:'test@example.test',billingStreet:'Teststraat',billingNumber:'5',billingPostalCode:'1234 AB',billingCity:'Rotterdam',billingCountry:'Nederland'})};
 db.prepare('INSERT INTO orders(id,token_hash,payload_hash,payload_json,amount_cents,created_at,consent_version,payment_status) VALUES(?,?,?,?,?,?,?,?)').run(row.id,'x','x',row.payload_json,750,row.paid_at,'v1','paid');
 return {db,env,row,close(){db.close();globalThis.fetch=originalFetch;}};
}
test('invoicing is explicitly disabled unless every setting and live payment is available',()=>{
 const x=fixture();try{
  assert.equal(Boolean(invoicingConfigured(x.env)),true);
  for(const key of ['EBOEKHOUDEN_INVOICING_ENABLED','EBOEKHOUDEN_API_TOKEN']){
   const original=x.env[key];delete x.env[key];assert.equal(Boolean(invoicingConfigured(x.env)),false);x.env[key]=original;
  }
  x.env.MOLLIE_API_KEY='test_dummy';assert.equal(Boolean(invoicingConfigured(x.env)),false);
 }finally{x.close();}
});
test('invoice amounts include 21% VAT and refer to the paid Mollie order',()=>{
 const x=fixture();try{
  const data=JSON.parse(x.row.payload_json);
  const invoice=invoicePayload(x.row,data,99,{templateId:123,ledgerId:456});
  assert.equal(invoice.items[0].pricePerUnit,7.5);
  assert.equal(invoice.items[0].vatCode,'HOOG_VERK_21');
  assert.equal(invoice.inExVat,'IN');
  assert.equal(invoice.reference,`I2M-${x.row.id}`);
  assert.match(invoice.text,/Reeds betaald/);
 }finally{x.close();}
});
test('only exact Idea2Music template and ledger 8050 can be selected',()=>{
 const templates={items:[{id:1,name:'Factuur narrow',active:true},{id:123,name:'Idea2Music',active:true}]};
 const ledgers={items:[{id:3,code:'8000'},{id:456,code:'8050'}]};
 assert.deepEqual(selectAccountingIds(templates,ledgers),{templateId:123,ledgerId:456});
 assert.throws(()=>selectAccountingIds({items:[{id:1,name:'Idea2music'}]},ledgers),/template_not_unique/);
 assert.throws(()=>selectAccountingIds(templates,{items:[{id:3,code:'8000'}]}),/ledger_not_unique/);
 assert.throws(()=>selectAccountingIds({items:[...templates.items,{id:33,name:'Idea2Music'}]},ledgers),/template_not_unique/);
});
test('a duplicate webhook never sends a second e-Boekhouden invoice',async()=>{
 const x=fixture();let sent=0,relations=0;
 globalThis.fetch=async(url,options={})=>{
  if(String(url).endsWith('/v1/session')) return Response.json({token:'session'});
  if(String(url).includes('/v1/invoicetemplate?')) return Response.json({items:[{id:123,name:'Idea2Music',active:true}]});
  if(String(url).includes('/v1/ledger?')) return Response.json({items:[{id:456,code:'8050'}]});
  if(String(url).includes('/v1/relation?')) return Response.json({items:[]});
  if(String(url).endsWith('/v1/relation')) {relations++;const data=JSON.parse(options.body);assert.equal(data.country,'NL');return Response.json({id:10},{status:201});}
  if(String(url).endsWith('/v1/invoice')) {sent++;const payload=JSON.parse(options.body);assert.equal(payload.templateId,123);return Response.json({id:22,invoiceNumber:'I2M-001'},{status:201});}
  throw Error('Unexpected call');
 };
 try {
  await Promise.all([maybeInvoicePaid(x.env,x.row),maybeInvoicePaid(x.env,x.row)]);
  await maybeInvoicePaid(x.env,x.row);
  assert.equal(sent,1);assert.equal(relations,1);
  assert.equal(x.db.prepare('SELECT state FROM invoice_outbox').get().state,'sent');
 }finally{x.close();}
});
test('uncertain invoice response stays in review and is never automatically retried',async()=>{
 const x=fixture();let attempts=0;
 globalThis.fetch=async(url)=>{
  if(String(url).endsWith('/v1/session')) return Response.json({token:'session'});
  if(String(url).includes('/v1/invoicetemplate?')) return Response.json({items:[{id:123,name:'Idea2Music',active:true}]});
  if(String(url).includes('/v1/ledger?')) return Response.json({items:[{id:456,code:'8050'}]});
  if(String(url).includes('/v1/relation?')) return Response.json({items:[{id:10,code:`I2M${x.row.id.replace(/-/g,'').slice(0,25)}`}]});
  if(String(url).endsWith('/v1/invoice')){attempts++;throw Error('connection dropped after remote commit');}
  throw Error('Unexpected call');
 };
 try{
  await maybeInvoicePaid(x.env,x.row);
  await maybeInvoicePaid(x.env,x.row);
  assert.equal(attempts,1);
  assert.equal(x.db.prepare('SELECT state FROM invoice_outbox').get().state,'review');
 }finally{x.close();}
});
