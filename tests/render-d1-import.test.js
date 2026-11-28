import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {openOrdersDb} from '../scripts/render-db.mjs';
import {d1Snapshot,stableD1Snapshot,applySnapshot} from '../scripts/render-d1-import.mjs';
const env={CF_D1_ACCOUNT_ID:'a'.repeat(32),CF_D1_DATABASE_ID:'11111111-1111-4111-8111-111111111111',CF_D1_READ_TOKEN:'dummy-not-a-real-token'};
const id='11111111-1111-4111-8111-111111111111';
function source(){
 const db=new DatabaseSync(':memory:');
 for(const name of ['0001_orders.sql','0002_invoice_outbox.sql','0003_invoice_test_billing.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 db.prepare('INSERT INTO orders(id,token_hash,payload_hash,payload_json,amount_cents,created_at,payment_status,consent_version) VALUES(?,?,?,?,?,?,?,?)').run(id,'token','hash','{"name":"Synthetic fixture"}',750,'2026-11-20T00:00:00.000Z','paid','v1');
 db.prepare('INSERT INTO invoice_outbox(order_id,state,invoice_number) VALUES(?,?,?)').run(id,'sent','FTEST');
 db.prepare('INSERT INTO mail_outbox(id,order_id,body_json,state) VALUES(?,?,?,?)').run('test-mail',id,'{}','sent');
 db.prepare('INSERT INTO invoice_test_billing VALUES(?,?,?,?,?,?)').run(id,'Teststraat','1','0000 AA','Test','Nederland');
 const query=async(url,options)=>{
  assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'));
  assert.equal(options.redirect,'error');
  const {sql,params}=JSON.parse(options.body);
  assert.match(sql,/^(SELECT|PRAGMA table_info)/);
  return Response.json({success:true,result:[{success:true,results:db.prepare(sql).all(...params)}]});
 };
 return {db,query};
}
test('D1 source read-only scan, atomic copy, all durable rows verified and duplicate invoice retained',async()=>{
 const s=source(),target=openOrdersDb();
 try{
  const snapshot=await stableD1Snapshot(env,s.query);
  const result=applySnapshot(target,snapshot);
  assert.deepEqual(result.counts,{orders:1,mail_outbox:1,invoice_outbox:1,invoice_test_billing:1});
  assert.equal(target.prepare('SELECT invoice_number FROM invoice_outbox').first().invoice_number,'FTEST');
  assert.equal(target.prepare('SELECT state FROM mail_outbox').first().state,'sent');
  assert.throws(()=>applySnapshot(target,snapshot),/already contains data/);
 }finally{s.db.close();target.close();}
});
test('changing source snapshot is rejected before copying',async()=>{
 const s=source();let scans=0;
 try{
  await assert.rejects(stableD1Snapshot(env,async(url,opts)=>{
   if(JSON.parse(opts.body).sql.includes('sqlite_schema')&&++scans===2)s.db.prepare('UPDATE orders SET amount_cents=1500').run();
   return s.query(url,opts);
  }),/Source changed/);
 }finally{s.db.close();}
});
test('invalid foreign key rolls back entire migration',async()=>{
 const s=source(),target=openOrdersDb();
 try{
  const snapshot=await d1Snapshot(env,s.query);
  snapshot.mail_outbox[0][1]='missing';
  assert.throws(()=>applySnapshot(target,snapshot));
  assert.equal(target.prepare('SELECT COUNT(*) AS n FROM orders').first().n,0);
 }finally{s.db.close();target.close();}
});
test('unexpected source table blocks import',async()=>{
 const s=source();try{s.db.exec('CREATE TABLE unknown_data(id TEXT)');await assert.rejects(d1Snapshot(env,s.query),/Unexpected source table/);}finally{s.db.close();}
});
