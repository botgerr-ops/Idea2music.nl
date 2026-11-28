import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {creatorPortal} from '../lib/creator-portal.js';
const envBase={CREATOR_PORTAL_ENABLED:'true',CREATOR_ACCESS_ISSUER:'https://team.cloudflareaccess.com',CREATOR_ACCESS_AUD:'admin',CREATOR_PORTAL_ACCESS_AUD:'partner'};
const req=new Request('https://preview.example/api/creator-portal/overview?partnerId=other');
const path='creator-portal/overview';
const now='2026-12-01T12:00:00.000Z';
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;');
 for(const f of ['0001_orders.sql','0100_creator_program.sql'])db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 for(const [id,email,code] of [['p1','one@example.com','ONE10'],['p2','two@example.com','TWO10']]){
  db.prepare("INSERT INTO creator_partners(id,display_name,email,status,agreement_version,agreement_accepted_at,created_at) VALUES(?,?,?,'active','v1',?,?)").run(id,id,email,now,now);
  db.prepare('INSERT INTO creator_codes(code,partner_id,active,starts_at) VALUES(?,?,1,?)').run(code,id,now);
  db.prepare("INSERT INTO orders(id,token_hash,payload_hash,payload_json,amount_cents,created_at,payment_id,payment_status,paid_at,consent_version) VALUES(?,?,?,?,1350,?,?,'paid',?,'v1')").run('order-'+id,'secret-token','hash','{"story":"PRIVATE STORY"}',now,'payment-'+id,now);
  db.prepare('INSERT INTO creator_order_attribution VALUES(?,?,?,1500,1000,1350,200,?)').run('order-'+id,id,code,now);
  db.prepare('INSERT INTO creator_commissions(order_id,payment_id,amount_cents,paid_verified_at,updated_at) VALUES(?,?,200,?,?)').run('order-'+id,'payment-'+id,now,now);
  db.prepare("INSERT INTO creator_payouts(id,partner_id,period_start,period_end,status,net_cents,created_at) VALUES(?,?,?,?, 'approved',2000,?)").run('pay-'+id,id,'2026-12-01','2026-12-31',now);
 }
 const adapter={prepare(sql){return{bind(...args){return{all(){return {results:db.prepare(sql).all(...args)};}};}};},async batch(stmts){return stmts.map(s=>s.all());}};
 return {db,env:{...envBase,ORDERS_DB:adapter}};
}
test('partner overview scopes every result to authenticated email, not URL identity',async()=>{
 const {db,env}=fixture();
 try{
  const r=await creatorPortal(req,env,path,async(_r,_iss,aud)=>{assert.equal(aud,'partner');return {id:'verified',email:'one@example.com'};});
  assert.equal(r.status,200);assert.match(r.headers.get('Cache-Control'),/no-store/);
  const d=await r.json();
  assert.equal(d.partner.display_name,'p1');assert.equal(d.codes.length,1);assert.equal(d.codes[0].code,'ONE10');
  assert.equal(d.history.length,1);assert.equal(d.totals.paid_orders,1);assert.equal(d.totals.pending_cents,200);assert.equal(d.payouts.length,1);
  const raw=JSON.stringify(d);for(const secret of ['TWO10','p2','order-p1','payment-p1','PRIVATE STORY','secret-token','one@example.com','two@example.com'])assert.ok(!raw.includes(secret),secret);
 }finally{db.close();}
});
test('unregistered or suspended partner cannot read financial data',async()=>{
 const {db,env}=fixture();
 try{
  for(const email of ['missing@example.com','two@example.com']){
   db.exec("UPDATE creator_partners SET status='suspended' WHERE id='p2'");
   const r=await creatorPortal(req,env,path,async()=>({id:'verified',email}));assert.equal(r.status,403);
  }
 }finally{db.close();}
});
test('portal is disabled by default, denies unauthenticated requests, and rejects admin audience reuse',async()=>{
 assert.equal((await creatorPortal(req,{},path)).status,404);
 assert.equal((await creatorPortal(req,{...envBase,CREATOR_PORTAL_ACCESS_AUD:'admin'},path)).status,503);
 assert.equal((await creatorPortal(req,envBase,path,async()=>null)).status,403);
 assert.equal((await creatorPortal(new Request(req.url,{method:'POST'}),envBase,path)).status,404);
});
