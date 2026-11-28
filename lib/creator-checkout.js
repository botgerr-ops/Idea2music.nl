import {creatorQuote, normalizeCreatorCode} from './creator-rules.js';
export const creatorEnabled = env => env.CREATOR_ENABLED === 'true';
export async function getCreatorQuote(env, code, now=Date.now()) {
 const normalized=normalizeCreatorCode(code);
 let record=null;
 if(creatorEnabled(env)&&normalized) {
  record=await env.ORDERS_DB.prepare(`SELECT c.*,p.status AS partner_status,p.email AS partner_email
   FROM creator_codes c JOIN creator_partners p ON p.id=c.partner_id
   WHERE c.code=?`).bind(normalized).first();
 }
 const quote=creatorQuote({code,record,now,enabled:creatorEnabled(env)});
 return {...quote,partnerEmail:quote.attribution?record.partner_email:null};
}
export async function existingAttribution(env,id) {
 return env.ORDERS_DB.prepare('SELECT * FROM creator_order_attribution WHERE order_id=?').bind(id).first();
}
export async function insertAttributedOrder(env,insertOrder,identity,quote) {
 const a=quote.attribution;
 // Both statements are atomic. Only associate the matching order and never replace an existing attribution.
 const attribution=env.ORDERS_DB.prepare(`INSERT INTO creator_order_attribution
 (order_id,partner_id,code,base_cents,discount_bps,sale_cents,commission_cents,created_at)
 SELECT id,?,?,?,?,?,?,? FROM orders WHERE id=? AND token_hash=? AND payload_hash=? AND amount_cents=?
 ON CONFLICT(order_id) DO NOTHING`).bind(a.partnerId,a.code,a.baseCents,a.discountBps,a.saleCents,a.commissionCents,
 identity.createdAt,identity.id,identity.tokenHash,identity.payloadHash,a.saleCents);
 await env.ORDERS_DB.batch([insertOrder,attribution]);
}
export async function recordPendingCommission(env,row) {
 if(row.payment_status!=='paid'||!row.payment_id||!row.paid_at) return;
 const now=new Date().toISOString();
 await env.ORDERS_DB.prepare(`INSERT INTO creator_commissions(order_id,payment_id,amount_cents,paid_verified_at,updated_at)
 SELECT a.order_id,?,a.commission_cents,?,? FROM creator_order_attribution a
 JOIN orders o ON o.id=a.order_id WHERE a.order_id=? AND o.payment_status='paid'
 AND o.payment_id=? AND o.amount_cents=a.sale_cents
 ON CONFLICT(order_id) DO NOTHING`).bind(row.payment_id,row.paid_at,now,row.id,row.payment_id).run();
}
