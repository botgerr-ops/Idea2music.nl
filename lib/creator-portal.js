import {verifyAccessIdentity} from './creator-admin-auth.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export async function creatorPortal(request,env,path,verify=verifyAccessIdentity){
 if(env.CREATOR_PORTAL_ENABLED!=='true'||path!=='creator-portal/overview'||request.method!=='GET')return json({message:'Niet gevonden.'},404);
 // Separate audience prevents reuse of a partner token on an admin endpoint.
 if(!env.CREATOR_PORTAL_ACCESS_AUD||env.CREATOR_PORTAL_ACCESS_AUD===env.CREATOR_ACCESS_AUD)return json({message:'Portaal niet geconfigureerd.'},503);
 const identity=await verify(request,env.CREATOR_ACCESS_ISSUER,env.CREATOR_PORTAL_ACCESS_AUD);
 if(!identity?.email)return json({message:'Geen toegang. Log in met uw geregistreerde e-mailadres.'},403);
 if(!env.ORDERS_DB)return json({message:'Portaal niet beschikbaar.'},503);
 try{
  const db=env.ORDERS_DB, email=identity.email;
  // One transactional read batch; scope every query independently to the verified email.
  const q=(sql)=>db.prepare(sql).bind(email);
  const [partners,codes,totals,history,payouts,adjustments]=await db.batch([
   q("SELECT display_name FROM creator_partners WHERE email=? AND status='active'"),
   q("SELECT c.code,c.active,c.commission_cents,c.starts_at,c.ends_at FROM creator_codes c JOIN creator_partners p ON p.id=c.partner_id WHERE p.email=? AND p.status='active' ORDER BY c.starts_at DESC"),
   q(`SELECT COUNT(*) AS paid_orders,COALESCE(SUM(CASE WHEN c.status='pending' THEN c.amount_cents ELSE 0 END),0) pending_cents,
    COALESCE(SUM(CASE WHEN c.status='approved' THEN c.amount_cents ELSE 0 END),0) approved_cents,
    COALESCE(SUM(CASE WHEN c.status='reserved' THEN c.amount_cents ELSE 0 END),0) reserved_cents,
    COALESCE(SUM(CASE WHEN c.status='paid' THEN c.amount_cents ELSE 0 END),0) paid_cents
    FROM creator_commissions c JOIN creator_order_attribution a ON a.order_id=c.order_id JOIN creator_partners p ON p.id=a.partner_id WHERE p.email=? AND p.status='active'`),
   q(`SELECT substr(c.paid_verified_at,1,10) AS day,a.code,c.status,COUNT(*) AS orders,SUM(c.amount_cents) AS commission_cents
    FROM creator_commissions c JOIN creator_order_attribution a ON a.order_id=c.order_id JOIN creator_partners p ON p.id=a.partner_id
    WHERE p.email=? AND p.status='active' GROUP BY day,a.code,c.status ORDER BY day DESC,a.code,c.status LIMIT 100`),
   q(`SELECT period_start,period_end,status,net_cents,paid_at FROM creator_payouts v JOIN creator_partners p ON p.id=v.partner_id
    WHERE p.email=? AND p.status='active' AND v.status IN ('approved','paid') ORDER BY period_end DESC LIMIT 50`),
   q(`SELECT COALESCE(SUM(x.amount_cents),0) AS adjustment_cents FROM creator_adjustments x
    JOIN creator_order_attribution a ON a.order_id=x.order_id JOIN creator_partners p ON p.id=a.partner_id WHERE p.email=? AND p.status='active'`)
  ]);
  if(partners.results?.length!==1)return json({message:'Geen actief partneraccount gevonden.'},403);
  return json({partner:partners.results[0],codes:codes.results,totals:totals.results[0],history:history.results,payouts:payouts.results,adjustments:adjustments.results[0]});
 }catch{return json({message:'Overzicht tijdelijk niet beschikbaar.'},503);}
}
