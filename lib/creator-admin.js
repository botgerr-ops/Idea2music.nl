import {reviewCommission} from './creator-finance.js';
import {verifyCreatorAdmin} from './creator-admin-auth.js';
import {normalizeCreatorCode,CREATOR_TERMS_VERSION,HOLD_MS} from './creator-rules.js';
import {PROMO_END} from './order-rules.js';

const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const fail=(status,message)=>Object.assign(new Error(message),{status});
const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max+1):'';
const idOK=id=>typeof id==='string'&&/^[0-9a-f-]{36}$/.test(id);
async function body(request){
 if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))throw fail(415,'Ongeldig formaat.');
 const reader=request.body?.getReader();if(!reader)throw fail(400,'Lege aanvraag.');
 let size=0,parts=[];while(true){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>4096){await reader.cancel();throw fail(413,'Aanvraag te groot.');}parts.push(x.value);}
 const data=new Uint8Array(size);let offset=0;for(const p of parts){data.set(p,offset);offset+=p.length;}
 try{return JSON.parse(new TextDecoder().decode(data));}catch{throw fail(400,'Ongeldige aanvraag.');}
}
export async function creatorAdmin(request,env,path){
 if(env.CREATOR_ADMIN_ENABLED!=='true')return json({message:'Niet gevonden.'},404);
 const actor=await verifyCreatorAdmin(request,env);
 if(!actor)return json({message:'Geen toegang tot Partner Manager.'},403);
 if(!env.ORDERS_DB||!env.PUBLIC_SITE_URL)return json({message:'Beheer nog niet geconfigureerd.'},503);
 const db=env.ORDERS_DB, now=new Date().toISOString();
 const stmt=(sql,...args)=>db.prepare(sql).bind(...args);
 const audit=(action,id)=>stmt('INSERT INTO creator_audit(id,actor_id,action,entity_id,created_at) VALUES(?,?,?,?,?)',crypto.randomUUID(),actor.id,action,id,now);
 const partner=async id=>{if(!idOK(id))throw fail(422,'Ongeldige partner.');const p=await stmt('SELECT * FROM creator_partners WHERE id=?',id).first();if(!p)throw fail(404,'Partner niet gevonden.');return p;};
 try{
  if(request.method==='GET'&&path==='creator-admin/overview'){
   const [partners,codes,commissions,totals]=await Promise.all([
    db.prepare('SELECT id,display_name,email,status,agreement_version,agreement_accepted_at,created_at FROM creator_partners ORDER BY created_at DESC LIMIT 100').all(),
    db.prepare('SELECT code,partner_id,active,commission_cents,starts_at FROM creator_codes ORDER BY starts_at DESC LIMIT 200').all(),
    db.prepare(`SELECT c.order_id,c.status,c.amount_cents,c.paid_verified_at,c.delivered_at,c.eligible_at,a.partner_id,a.code FROM creator_commissions c JOIN creator_order_attribution a ON a.order_id=c.order_id ORDER BY c.paid_verified_at DESC LIMIT 200`).all(),
    db.prepare(`SELECT (SELECT count(*) FROM creator_partners WHERE status='active') active_partners,(SELECT count(*) FROM creator_partners) total_partners,(SELECT count(*) FROM creator_codes) total_codes,(SELECT count(*) FROM creator_commissions) total_commissions,COALESCE(SUM(CASE WHEN status='pending' THEN amount_cents ELSE 0 END),0) pending_cents,COALESCE(SUM(CASE WHEN status='approved' THEN amount_cents ELSE 0 END),0) approved_cents,COALESCE(SUM(CASE WHEN status='paid' THEN amount_cents ELSE 0 END),0) paid_cents FROM creator_commissions`).first()
   ]);
   return json({partners:partners.results,codes:codes.results,commissions:commissions.results,totals,financeEnabled:env.CREATOR_FINANCE_ENABLED==='true'});
  }
  if(request.method!=='POST')throw fail(404,'Niet gevonden.');
  if(request.headers.get('Origin')!==new URL(env.PUBLIC_SITE_URL).origin||request.headers.get('X-I2M-Admin')!=='1')throw fail(403,'Open de beheeromgeving op het juiste domein.');
  const b=await body(request);if(!b||typeof b!=='object'||Array.isArray(b))throw fail(400,'Ongeldige aanvraag.');
  if(path==='creator-admin/partners'){
   const name=clean(b.name,100),email=clean(b.email,254).toLowerCase();
   if(name.length<2||name.length>100||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(422,'Vul een geldige naam en e-mail in.');
   if(await stmt('SELECT id FROM creator_partners WHERE email=?',email).first())throw fail(409,'Dit e-mailadres bestaat al.');
   const id=crypto.randomUUID();
   await db.batch([stmt('INSERT INTO creator_partners(id,display_name,email,created_at) VALUES(?,?,?,?)',id,name,email,now),audit('partner_created',id)]);
   return json({ok:true,id},201);
  }
  if(path==='creator-admin/partner-status'){
   const p=await partner(b.partnerId);
   if(!['active','suspended','closed'].includes(b.status)||p.status==='closed')throw fail(422,'Ongeldige statuswijziging.');
   if(b.status==='active'){
    if(!p.agreement_accepted_at&&b.agreementConfirmed!==true)throw fail(422,'Bevestig eerst de ontvangen partnerovereenkomst.');
    await db.batch([stmt(`UPDATE creator_partners SET status='active',agreement_version=COALESCE(agreement_version,?),agreement_accepted_at=COALESCE(agreement_accepted_at,?) WHERE id=? AND status<>'closed'`,CREATOR_TERMS_VERSION,now,p.id),audit('partner_activation_requested',p.id)]);
   }else{
    await db.batch([stmt("UPDATE creator_partners SET status=? WHERE id=? AND status<>'closed'",b.status,p.id),stmt('UPDATE creator_codes SET active=0 WHERE partner_id=?',p.id),audit('partner_deactivation_requested',p.id)]);
   }
   return json({ok:true});
  }
  if(path==='creator-admin/codes'){
   const p=await partner(b.partnerId),code=normalizeCreatorCode(b.code);
   if(!code||p.status!=='active')throw fail(422,'Een actieve partner en geldige code zijn vereist.');
   if(await stmt('SELECT code FROM creator_codes WHERE code=?',code).first())throw fail(409,'Deze code bestaat al.');
   const starts=new Date(Math.max(Date.now(),PROMO_END)).toISOString();
   // A code starts inactive, and commission always begins at 200 cents.
   await db.batch([stmt('INSERT INTO creator_codes(code,partner_id,starts_at) VALUES(?,?,?)',code,p.id,starts),audit('code_created',code)]);
   return json({ok:true},201);
  }
  if(path==='creator-admin/code-status'){
   const code=normalizeCreatorCode(b.code);
   if(!code||typeof b.active!=='boolean')throw fail(422,'Ongeldige codewijziging.');
   const c=await stmt('SELECT c.*,p.status partner_status FROM creator_codes c JOIN creator_partners p ON p.id=c.partner_id WHERE c.code=?',code).first();
   if(!c)throw fail(404,'Code niet gevonden.');
   if(b.active&&c.partner_status!=='active')throw fail(409,'Partner is niet actief.');
   await db.batch([stmt(`UPDATE creator_codes SET active=? WHERE code=? AND (?=0 OR EXISTS(SELECT 1 FROM creator_partners p WHERE p.id=creator_codes.partner_id AND p.status='active'))`,Number(b.active),code,Number(b.active)),audit('code_status_requested',code)]);
   return json({ok:true});
  }
  if(path==='creator-admin/review-commission') return json(await reviewCommission(env,actor,b));
  if(path==='creator-admin/delivered'){
   if(!idOK(b.orderId)||b.confirmed!==true)throw fail(422,'Bevestig de daadwerkelijke levering.');
   const c=await stmt('SELECT c.status,c.delivered_at,o.cancellation_requested_at FROM creator_commissions c JOIN orders o ON o.id=c.order_id WHERE c.order_id=?',b.orderId).first();
   if(!c||c.status!=='pending'||c.delivered_at||c.cancellation_requested_at)throw fail(409,'Levering kan niet worden geregistreerd.');
   const eligible=new Date(Date.now()+HOLD_MS).toISOString();
   await db.batch([stmt(`UPDATE creator_commissions SET delivered_at=?,eligible_at=?,updated_at=? WHERE order_id=? AND status='pending' AND delivered_at IS NULL AND EXISTS(SELECT 1 FROM orders o WHERE o.id=creator_commissions.order_id AND o.cancellation_requested_at IS NULL)`,now,eligible,now,b.orderId),audit('delivery_registration_requested',b.orderId)]);
   return json({ok:true});
  }
  throw fail(404,'Niet gevonden.');
 }catch(e){return json({message:e.status?e.message:'Beheeractie kon niet worden uitgevoerd. Probeer opnieuw.'},e.status||503);}
}
