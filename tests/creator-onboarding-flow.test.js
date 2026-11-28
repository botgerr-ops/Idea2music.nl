import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {applyCreator} from '../lib/creator-application.js';
import {creatorAdmin} from '../lib/creator-admin.js';
import {creatorPortal} from '../lib/creator-portal.js';
import {getCreatorQuote,insertAttributedOrder,existingAttribution,recordPendingCommission} from '../lib/creator-checkout.js';
import {PROMO_END} from '../lib/order-rules.js';

test('onboarding to code, order and pending commission using signed admin and partner identities',async()=>{
 const db=new DatabaseSync(':memory:'),originalFetch=globalThis.fetch;
 const issuer='https://example-team.cloudflareaccess.com',origin='https://preview.example';
 const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',key.publicKey),kid:'test-key',alg:'RS256'};
 const b64=x=>Buffer.from(x).toString('base64url');
 async function token(email,aud){
  const seconds=Math.floor(Date.now()/1000);
  const input=b64(JSON.stringify({alg:'RS256',kid:'test-key'}))+'.'+b64(JSON.stringify({iss:issuer,aud:[aud],sub:'test-'+email,email,iat:seconds,exp:seconds+600}));
  return input+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key.privateKey,new TextEncoder().encode(input)));
 }
 const adminToken=await token('admin@example.com','admin-aud'),partnerToken=await token('creator@example.com','partner-aud');
 try{
  db.exec('PRAGMA foreign_keys=ON;');
  for(const name of ['0001_orders.sql','0100_creator_program.sql','0101_creator_finance.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const adapter={prepare(sql){const bound=(...a)=>({first(){return db.prepare(sql).get(...a);},all(){return {results:db.prepare(sql).all(...a)};},run(){return {meta:{changes:Number(db.prepare(sql).run(...a).changes)}};}});return {...bound(),bind:bound};},async batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
  // Portal reads and admin writes use the same adapter; D1 batch reads must return result rows.
  adapter.batch=async stmts=>{db.exec('BEGIN');try{const r=stmts.map(s=>s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
  const originalPrepare=adapter.prepare;
  adapter.prepare=sql=>{const p=originalPrepare(sql);const wrap=s=>({...s,run:/^\s*SELECT\b/i.test(sql)?s.all:s.run});return {...wrap(p),bind:(...args)=>wrap(p.bind(...args))};};
  globalThis.fetch=async url=>{assert.equal(url,issuer+'/cdn-cgi/access/certs');return Response.json({keys:[jwk]});};
  const env={ORDERS_DB:adapter,PUBLIC_SITE_URL:origin,CREATOR_ENABLED:'true',CREATOR_APPLICATION_ENABLED:'true',CREATOR_ADMIN_ENABLED:'true',CREATOR_PORTAL_ENABLED:'true',CREATOR_ACCESS_ISSUER:issuer,CREATOR_ACCESS_AUD:'admin-aud',CREATOR_PORTAL_ACCESS_AUD:'partner-aud',CREATOR_ADMIN_EMAIL:'admin@example.com'};
  const post=(path,body,jwt=adminToken,from=origin)=>creatorAdmin(new Request(origin+'/api/creator-admin/'+path,{method:'POST',headers:{'Cf-Access-Jwt-Assertion':jwt,Origin:from,'Content-Type':'application/json','X-I2M-Admin':'1'},body:JSON.stringify(body)}),env,'creator-admin/'+path);
  const portal=()=>creatorPortal(new Request(origin+'/api/creator-portal/overview',{headers:{'Cf-Access-Jwt-Assertion':partnerToken}}),env,'creator-portal/overview');
  assert.equal((await applyCreator(env,{name:'Creator Test',email:'creator@example.com',privacyAcknowledged:true})).status,200);
  const partner=db.prepare("SELECT * FROM creator_partners WHERE email='creator@example.com'").get();
  assert.equal(partner.status,'pending');assert.equal((await portal()).status,403);
  assert.equal((await post('partner-status',{partnerId:partner.id,status:'active'})).status,422);
  assert.equal((await post('partner-status',{partnerId:partner.id,status:'active',agreementConfirmed:true},partnerToken)).status,403);
  assert.equal((await post('partner-status',{partnerId:partner.id,status:'active',agreementConfirmed:true},adminToken,'https://wrong.example')).status,403);
  assert.equal((await post('partner-status',{partnerId:partner.id,status:'active',agreementConfirmed:true})).status,200);
  assert.equal((await post('codes',{partnerId:partner.id,code:'creator10'})).status,201);
  const when=Math.max(Date.now(),PROMO_END)+60000;
  assert.equal((await getCreatorQuote(env,'CREATOR10',when)).attribution,null);
  assert.equal((await post('code-status',{code:'CREATOR10',active:true})).status,200);
  assert.equal((await getCreatorQuote(env,'CREATOR10',PROMO_END-1)).amountCents,750);
  const quote=await getCreatorQuote(env,'creator10',when);assert.equal(quote.amountCents,1350);assert.equal(quote.attribution.commissionCents,200);
  const id=crypto.randomUUID(),createdAt=new Date(when).toISOString();
  const identity={id,createdAt,tokenHash:'token',payloadHash:'payload'};
  const insert=()=>adapter.prepare('INSERT OR IGNORE INTO orders(id,token_hash,payload_hash,payload_json,amount_cents,created_at,consent_version) VALUES(?,?,?,?,?,?,?)').bind(id,'token','payload','{}',1350,createdAt,'v1');
  await insertAttributedOrder(env,insert(),identity,quote);await insertAttributedOrder(env,insert(),identity,quote);
  assert.equal((await existingAttribution(env,id)).code,'CREATOR10');
  assert.equal(db.prepare('SELECT count(*) AS n FROM creator_order_attribution').get().n,1);
  await recordPendingCommission(env,db.prepare('SELECT * FROM orders WHERE id=?').get(id));
  assert.equal(db.prepare('SELECT count(*) AS n FROM creator_commissions').get().n,0);
  db.prepare("UPDATE orders SET payment_status='paid',payment_id='tr_test1',paid_at=? WHERE id=?").run(createdAt,id);
  const paid=db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  await recordPendingCommission(env,paid);await recordPendingCommission(env,paid);
  const result=await portal();assert.equal(result.status,200);const view=await result.json();
  assert.equal(view.totals.paid_orders,1);assert.equal(view.totals.pending_cents,200);assert.equal(view.codes[0].code,'CREATOR10');
  assert.equal((await post('delivered',{orderId:id,confirmed:true})).status,200);
  assert.equal((await post('partner-status',{partnerId:partner.id,status:'suspended'})).status,200);
  assert.equal((await getCreatorQuote(env,'CREATOR10',when)).attribution,null);assert.equal((await portal()).status,403);
 }finally{globalThis.fetch=originalFetch;db.close();}
});
