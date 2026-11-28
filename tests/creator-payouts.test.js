import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {applyCreator} from '../lib/creator-application.js';
import {payoutAction} from '../lib/creator-payouts.js';
const now=new Date().toISOString(), old='2026-01-01T12:00:00.000Z';
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;');
 for(const name of ['0001_orders.sql','0100_creator_program.sql','0101_creator_finance.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 for(const id of ['p1','p2']){db.prepare("INSERT INTO creator_partners(id,display_name,email,status,agreement_version,agreement_accepted_at,created_at) VALUES(?,?,?,'active','v1',?,?)").run(id,id,id+'@example.com',old,old);db.prepare('INSERT INTO creator_codes(code,partner_id,active,starts_at) VALUES(?,?,1,?)').run(id+'CODE',id,old);}
 function order(id,partner='p1'){
  db.prepare("INSERT INTO orders(id,token_hash,payload_hash,payload_json,amount_cents,created_at,payment_id,payment_status,paid_at,consent_version) VALUES(?,?,?,?,1350,?,?,'paid',?,'v1')").run(id,'token','hash','{}',old,'payment-'+id,old);
  db.prepare('INSERT INTO creator_order_attribution VALUES(?,?,?,1500,1000,1350,200,?)').run(id,partner,partner+'CODE',old);
  db.prepare("INSERT INTO creator_commissions(order_id,payment_id,status,amount_cents,paid_verified_at,delivered_at,eligible_at,approved_at,updated_at) VALUES(?,?,'approved',200,?,?,?,?,?)").run(id,'payment-'+id,old,old,old,old,now);
 }
 function reserve(id,partner='p1',net=2000){db.prepare('INSERT INTO creator_payouts(id,partner_id,period_start,period_end,net_cents,created_at) VALUES(?,?,?,?,?,?)').run(id,partner,'2026-01-01','2026-01-31',net,now);}
 function item(payout,order){db.prepare('INSERT INTO creator_payout_items VALUES(?,?,200)').run(payout,order);}
 return {db,order,reserve,item};
}
test('payout guards reject duplicate open batches, cross-partner items and wrong totals; void releases reservations',()=>{
 const {db,order,reserve,item}=fixture();try{
  for(let i=0;i<10;i++)order('o'+i);order('other','p2');reserve('batch');
  assert.throws(()=>reserve('duplicate'));
  assert.throws(()=>item('batch','other'));
  item('batch','o0');assert.throws(()=>item('batch','o0'));
  assert.throws(()=>db.exec("UPDATE creator_payouts SET status='approved' WHERE id='batch'"));
  for(let i=1;i<10;i++)item('batch','o'+i);
  db.exec("UPDATE creator_payouts SET status='approved' WHERE id='batch'");
  assert.equal(db.prepare("SELECT count(*) AS n FROM creator_commissions WHERE status='reserved'").get().n,10);
  db.exec("UPDATE creator_payouts SET status='void' WHERE id='batch'");
  assert.equal(db.prepare("SELECT count(*) AS n FROM creator_commissions WHERE status='reserved'").get().n,0);
  reserve('second');for(let i=0;i<10;i++)item('second','o'+i);
  db.exec("UPDATE creator_payouts SET status='approved' WHERE id='second'");
  assert.throws(()=>db.prepare("UPDATE creator_payouts SET status='paid',bank_reference='bank',invoice_reference='invoice',paid_at=? WHERE id='second'").run(now));
  db.prepare("INSERT INTO creator_payout_receipts VALUES('second',2000,?)").run(now);
  db.prepare("UPDATE creator_payouts SET status='paid',bank_reference='bank',invoice_reference='invoice',paid_at=? WHERE id='second'").run(now);
  assert.equal(db.prepare("SELECT count(*) AS n FROM creator_commissions WHERE status='paid'").get().n,10);
  assert.throws(()=>db.exec("UPDATE creator_payouts SET status='void' WHERE id='second'"));
 }finally{db.close();}
});
test('one reversal per commission and correct net calculation',()=>{
 const {db,order,reserve,item}=fixture();try{
  for(let i=0;i<11;i++)order('o'+i);order('refunded');
  db.exec("UPDATE creator_commissions SET status='paid' WHERE order_id='refunded'");
  db.prepare("INSERT INTO creator_adjustments VALUES('adj','refunded',-200,'refund','event',?)").run(now);
  assert.throws(()=>db.prepare("INSERT INTO creator_adjustments VALUES('adj2','refunded',-200,'chargeback','event2',?)").run(now));
  reserve('batch');for(let i=0;i<11;i++)item('batch','o'+i);
  assert.throws(()=>db.exec("UPDATE creator_payouts SET status='approved' WHERE id='batch'"));
  db.exec("INSERT INTO creator_payout_adjustments VALUES('batch','adj');UPDATE creator_payouts SET status='approved' WHERE id='batch';");
  assert.equal(db.prepare("SELECT status FROM creator_payouts WHERE id='batch'").get().status,'approved');
 }finally{db.close();}
});
test('application never activates a partner and handles duplicate email without exposing membership',async()=>{
 const {db}=fixture();try{
  const env={CREATOR_APPLICATION_ENABLED:'true',ORDERS_DB:{prepare(sql){return {bind(...args){return {run(){return db.prepare(sql).run(...args);}};}};}}};
  const b={name:'Creator Test',email:'new@example.com',privacyAcknowledged:true};
  const a=await applyCreator(env,b),duplicate=await applyCreator(env,b);
  assert.deepEqual(a,duplicate);assert.equal(a.status,200);
  assert.equal(db.prepare("SELECT status FROM creator_partners WHERE email='new@example.com'").get().status,'pending');
  assert.equal((await applyCreator(env,{...b,privacyAcknowledged:false})).status,422);
  assert.equal((await applyCreator({},b)).status,404);
 }finally{db.close();}
});
test('payout endpoints disabled by default',async()=>assert.rejects(payoutAction({}, {id:'admin'},'creator-admin/payout-create',{}),e=>e.status===404));
