import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {payoutAction} from '../lib/creator-payouts.js';
test('monthly payout reserves, verifies, records and corrects a payment exactly once',async()=>{
 const db=new DatabaseSync(':memory:'),originalFetch=globalThis.fetch;
 const partner='11111111-1111-4111-8111-111111111111',old='2025-01-01T12:00:00.000Z';
 const ids=Array.from({length:10},(_,i)=>'22222222-2222-4222-8222-'+String(i).padStart(12,'0'));
 try{
  db.exec('PRAGMA foreign_keys=ON;');
  for(const name of ['0001_orders.sql','0100_creator_program.sql','0101_creator_finance.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  db.prepare("INSERT INTO creator_partners(id,display_name,email,status,agreement_version,agreement_accepted_at,created_at) VALUES(?,'Partner','partner@example.com','active','v1',?,?)").run(partner,old,old);
  db.prepare("INSERT INTO creator_codes(code,partner_id,active,starts_at) VALUES('PARTNER10',?,1,?)").run(partner,old);
  for(let i=0;i<ids.length;i++){
   const id=ids[i],payment='tr_test'+i;
   db.prepare("INSERT INTO orders(id,token_hash,payload_hash,payload_json,amount_cents,created_at,payment_id,payment_status,paid_at,consent_version) VALUES(?,?,?,?,1350,?,?,'paid',?,'v1')").run(id,'token','hash',JSON.stringify({email:'buyer@example.com'}),old,payment,old);
   db.prepare("INSERT INTO creator_order_attribution VALUES(?,?,'PARTNER10',1500,1000,1350,200,?)").run(id,partner,old);
   db.prepare("INSERT INTO creator_commissions(order_id,payment_id,status,amount_cents,paid_verified_at,delivered_at,eligible_at,approved_at,updated_at) VALUES(?,?,'approved',200,?,?,?,?,?)").run(id,payment,old,old,old,old,old);
  }
  const adapter={prepare(sql){return{bind(...a){return{first(){return db.prepare(sql).get(...a);},all(){return {results:db.prepare(sql).all(...a)};},run(){return {meta:{changes:Number(db.prepare(sql).run(...a).changes)}};}};}};},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
  let refundFirst=false;
  globalThis.fetch=async url=>{
   const m=url.match(/\/payments\/(tr_test(\d+))/);assert.ok(m);const i=Number(m[2]);const refunded=refundFirst&&i===0;
   return Response.json(url.includes('/refunds?')?{count:refunded?1:0,_embedded:{refunds:refunded?[{status:'refunded'}]:[]},_links:{next:null}}:url.includes('/chargebacks?')?{count:0,_embedded:{chargebacks:[]},_links:{next:null}}:{id:m[1],mode:'test',status:'paid',metadata:{orderId:ids[i]},amount:{currency:'EUR',value:'13.50'}});
  };
  const env={ORDERS_DB:adapter,CREATOR_FINANCE_ENABLED:'true',CREATOR_PAYOUT_ENABLED:'true',MOLLIE_API_KEY:'test_fake123'};
  const action=(name,body)=>payoutAction(env,{id:'admin'},'creator-admin/'+name,body);
  const created=await action('payout-create',{partnerId:partner,confirmed:true});assert.equal(created.netCents,2000);
  assert.equal((await action('payout-check',{payoutId:created.id})).netCents,2000);
  await assert.rejects(action('payout-create',{partnerId:partner,confirmed:true}));
  await action('payout-paid',{payoutId:created.id,confirmed:true,invoiceReference:'INV-DEMO',bankReference:'BANK-DEMO',bankAmountCents:2000});
  assert.equal(db.prepare("SELECT count(*) AS n FROM creator_commissions WHERE status='paid'").get().n,10);
  await assert.rejects(action('payout-paid',{payoutId:created.id,confirmed:true,invoiceReference:'INV-DEMO',bankReference:'BANK-DEMO',bankAmountCents:2000}));
  refundFirst=true;
  await action('correct-paid',{orderId:ids[0],confirmed:true});await action('correct-paid',{orderId:ids[0],confirmed:true});
  assert.equal(db.prepare('SELECT count(*) AS n,SUM(amount_cents) AS amount FROM creator_adjustments').get().n,1);
  assert.equal(db.prepare('SELECT SUM(amount_cents) AS amount FROM creator_adjustments').get().amount,-200);
  assert.equal(db.prepare('SELECT status FROM creator_commissions WHERE order_id=?').get(ids[0]).status,'reversed');
 }finally{globalThis.fetch=originalFetch;db.close();}
});
