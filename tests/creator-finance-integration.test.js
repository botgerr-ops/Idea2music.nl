import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {reviewCommission} from '../lib/creator-finance.js';
test('actual SQL review approves a delivered €13.50 order with €2 commission; refund rejects it',async()=>{
 const db=new DatabaseSync(':memory:'),originalFetch=globalThis.fetch;
 const id='11111111-1111-4111-8111-111111111111',old='2025-01-01T12:00:00.000Z';
 try{
 db.exec('PRAGMA foreign_keys=ON;');
 for(const name of ['0001_orders.sql','0100_creator_program.sql','0101_creator_finance.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 db.prepare("INSERT INTO creator_partners(id,display_name,email,status,agreement_version,agreement_accepted_at,created_at) VALUES('p','Partner','partner@example.com','active','v1',?,?)").run(old,old);
 db.prepare("INSERT INTO creator_codes(code,partner_id,active,starts_at) VALUES('PARTNER10','p',1,?)").run(old);
 db.prepare("INSERT INTO orders(id,token_hash,payload_hash,payload_json,amount_cents,created_at,payment_id,payment_status,paid_at,consent_version) VALUES(?,?,?,?,1350,?,'tr_test1','paid',?,'v1')").run(id,'token','hash',JSON.stringify({email:'buyer@example.com'}),old,old);
 db.prepare("INSERT INTO creator_order_attribution VALUES(?,'p','PARTNER10',1500,1000,1350,200,?)").run(id,old);
 db.prepare("INSERT INTO creator_commissions(order_id,payment_id,amount_cents,paid_verified_at,delivered_at,eligible_at,updated_at) VALUES(?,'tr_test1',200,?,?,?,?)").run(id,old,old,old,old);
 const adapter={prepare(sql){return{bind(...a){return{first(){return db.prepare(sql).get(...a);},run(){return {meta:{changes:Number(db.prepare(sql).run(...a).changes)}};}};}};},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
 let refunded=false;
 globalThis.fetch=async url=>Response.json(url.includes('/refunds?')?{count:refunded?1:0,_embedded:{refunds:refunded?[{status:'refunded'}]:[]},_links:{next:null}}:url.includes('/chargebacks?')?{count:0,_embedded:{chargebacks:[]},_links:{next:null}}:{id:'tr_test1',mode:'test',status:'paid',metadata:{orderId:id},amount:{currency:'EUR',value:'13.50'}});
 const env={ORDERS_DB:adapter,CREATOR_FINANCE_ENABLED:'true',MOLLIE_API_KEY:'test_fake123'};
 const actor={id:'admin'},body={orderId:id,confirmed:true};
 assert.equal((await reviewCommission(env,actor,body)).status,'approved');
 assert.equal(db.prepare('SELECT amount_cents FROM creator_commissions WHERE order_id=?').get(id).amount_cents,200);
 refunded=true;assert.equal((await reviewCommission(env,actor,body)).status,'rejected');
 assert.equal(db.prepare('SELECT rejection_reason FROM creator_commissions WHERE order_id=?').get(id).rejection_reason,'refund');
 }finally{globalThis.fetch=originalFetch;db.close();}
});
