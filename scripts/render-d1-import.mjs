// Explicit, read-only D1 transfer. No provider calls or customer data in logs.
import {createHash} from 'node:crypto';
import {writeFileSync,renameSync} from 'node:fs';
const tables=[
 ['orders','id','id token_hash payload_hash payload_json amount_cents created_at payment_id checkout_url payment_status paid_at cancellation_requested_at consent_version'],
 ['mail_outbox','id','id order_id body_json state claimed_at sent_at provider_id'],
 ['invoice_outbox','order_id','order_id state started_at finished_at invoice_id invoice_number error_code'],
 ['invoice_test_billing','order_id','order_id street number postal_code city country']
].map(([name,key,columns])=>({name,key,columns:columns.split(' ')}));
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const assert=(condition,message)=>{if(!condition)throw Error(message);};
export async function d1Snapshot(env,fetcher=fetch){
 const account=env.CF_D1_ACCOUNT_ID,dbId=env.CF_D1_DATABASE_ID,token=env.CF_D1_READ_TOKEN;
 assert(/^[a-f0-9]{32}$/i.test(account||'')&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(dbId||'')&&token,'D1 source configuration missing or invalid');
 const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+dbId+'/query';
 async function query(sql,params=[]){
  const response=await fetcher(url,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(15000)});
  assert(response.ok,'D1 read failed (HTTP '+response.status+')');
  const data=await response.json(),result=data.result?.[0];
  assert(data.success&&data.result.length===1&&result.success&&Array.isArray(result.results),'D1 query failed');
  return result.results;
 }
 const available=(await query("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")).map(r=>r.name);
 assert(available.every(n=>tables.some(t=>t.name===n)||['rate_limits','d1_migrations','sqlite_sequence','_cf_KV'].includes(n)),'Unexpected source table; manual review required');
 const snapshot={};
 for(const {name,key,columns} of tables){
  const actual=(await query('PRAGMA table_info('+name+')')).map(r=>r.name);
  assert(actual.length===columns.length&&columns.every(c=>actual.includes(c)),'D1 schema differs: '+name);
  const [{n}]=await query('SELECT COUNT(*) AS n FROM '+name);
  assert(Number.isSafeInteger(n)&&n>=0&&n<=100000,'Unexpected table count: '+name);
  const rows=[];
  for(let offset=0;offset<n;offset+=25){
   const page=await query('SELECT '+columns.join(',')+' FROM '+name+' ORDER BY '+key+' LIMIT 25 OFFSET ?', [String(offset)]);
   assert(page.length===Math.min(25,n-offset),'D1 page count changed: '+name);
   for(const row of page){assert(columns.every(c=>Object.hasOwn(row,c)),'Incomplete D1 row');rows.push(columns.map(c=>row[c]));}
  }
  assert(new Set(rows.map(r=>r[columns.indexOf(key)])).size===n,'Duplicate source key');
  snapshot[name]=rows;
 }
 return snapshot;
}
export async function stableD1Snapshot(env,fetcher=fetch){
 const a=await d1Snapshot(env,fetcher),b=await d1Snapshot(env,fetcher);
 assert(sha(a)===sha(b),'Source changed between reads; no import performed');
 return b;
}
export function applySnapshot(db,snapshot){
 const counts={};
 for(const {name} of tables){
  const n=db.prepare('SELECT COUNT(*) AS n FROM '+name).first().n;
  assert(n===0,'Target already contains data: '+name);
  counts[name]=snapshot[name].length;
 }
 const statements=[];
 for(const {name,columns} of tables)for(const row of snapshot[name]){
  statements.push(db.prepare('INSERT INTO '+name+' ('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')').bind(...row));
 }
 // Counts, row hashes and FK checks execute inside the same transaction.
 db.transaction(()=>{
  for(const stmt of statements)stmt.run();
  const copied={};
  for(const {name,key,columns} of tables)copied[name]=db.prepare('SELECT '+columns.join(',')+' FROM '+name+' ORDER BY '+key).all().results.map(row=>columns.map(c=>row[c]));
  assert(sha(copied)===sha(snapshot),'Target verification failed; transaction rolled back');
  assert(db.prepare('PRAGMA foreign_key_check').all().results.length===0,'Target foreign key check failed');
 });
 return {counts,sha256:sha(snapshot)};
}
export async function runD1Import(db,env,mount,fetcher=fetch){
 const mode=env.I2M_IMPORT_MODE;
 if(!mode||mode==='off')return;
 assert(['check','copy'].includes(mode),'Invalid import mode');
 assert(env.CHECKOUT_ENABLED!=='true'&&env.I2M_CUTOVER_READY!=='true','Import forbidden while checkout is active');
 const snapshot=await stableD1Snapshot(env,fetcher);
 if(mode==='check'){
  console.log('D1 read-only verification complete; counts '+JSON.stringify(Object.fromEntries(tables.map(t=>[t.name,snapshot[t.name].length]))));
  return;
 }
 assert(env.I2M_SOURCE_FROZEN==='true','Copy requires confirmed source write freeze');
 const report=applySnapshot(db,snapshot);
 writeFileSync(mount+'/migration-verified.tmp',JSON.stringify({...report,verifiedAt:new Date().toISOString()}),{mode:0o600});
 renameSync(mount+'/migration-verified.tmp',mount+'/migration-verified');
 console.log('D1 migration verified; counts '+JSON.stringify(report.counts));
}
