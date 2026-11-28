import {commissionDecision} from './creator-rules.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const uncertain=()=>fail(409,'Betaalcontrole niet volledig. Commissie blijft geblokkeerd.');
export function classifyPayment(payment,refunds,chargebacks,row,mode){
 if(!payment||payment.id!==row.payment_id||payment.metadata?.orderId!==row.order_id||
   payment.mode!==mode||payment.status!=='paid'||payment.amount?.currency!=='EUR'||
   payment.amount?.value!==(row.sale_cents/100).toFixed(2))throw uncertain();
 const inspect=(list,key)=>{
  if(!Array.isArray(list?._embedded?.[key])||!Number.isInteger(list.count)||
    list.count!==list._embedded[key].length||list._links?.next)throw uncertain();
  return list._embedded[key];
 };
 const rs=inspect(refunds,'refunds'),cs=inspect(chargebacks,'chargebacks');
 const nonzero=(v)=>v==null?false:v.currency==='EUR'&&typeof v.value==='string'&&/^\d+\.\d{2}$/.test(v.value)?Number(v.value)>0:(()=>{throw uncertain();})();
 // Conservative pilot: any refund record except failed/canceled blocks approval.
 // Any chargeback record blocks, even if later reversed; manual review is required.
 return {status:'paid',refunded:nonzero(payment.amountRefunded)||rs.some(r=>!['failed','canceled'].includes(r.status)),
  chargedBack:nonzero(payment.amountChargedBack)||cs.length>0,settledRefund:rs.some(r=>r.status==='refunded')};
}
export async function verifyCommissionPayment(env,row,fetcher=fetch){
 const key=env.MOLLIE_API_KEY||'';
 if(!/^(test|live)_[A-Za-z0-9]+$/.test(key)||!/^tr_[A-Za-z0-9]+$/.test(row.payment_id))throw uncertain();
 const base='https://api.mollie.com/v2/payments/'+row.payment_id;
 const get=async url=>{
  const r=await fetcher(url,{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw uncertain();return r.json();
 };
 const [p,r,c]=await Promise.all([get(base),get(base+'/refunds?limit=250'),get(base+'/chargebacks?limit=250')]);
 return classifyPayment(p,r,c,row,key.startsWith('test_')?'test':'live');
}
export async function reviewCommission(env,actor,body){
 if(env.CREATOR_FINANCE_ENABLED!=='true')throw fail(404,'Financieel beheer nog niet beschikbaar.');
 if(typeof body.orderId!=='string'||!/^[0-9a-f-]{36}$/.test(body.orderId)||body.confirmed!==true)throw fail(422,'Bevestig de controle van de bestelling.');
 const db=env.ORDERS_DB, q=(sql,...args)=>db.prepare(sql).bind(...args);
 const row=await q(`SELECT c.*,a.sale_cents,a.commission_cents AS snapshot_commission_cents,a.partner_id,o.payload_json,o.cancellation_requested_at,o.payment_status,
 o.payment_id AS order_payment_id,o.amount_cents AS order_amount_cents,p.email AS partner_email
 FROM creator_commissions c JOIN creator_order_attribution a ON a.order_id=c.order_id
 JOIN orders o ON o.id=c.order_id JOIN creator_partners p ON p.id=a.partner_id WHERE c.order_id=?`,body.orderId).first();
 if(!row||!['pending','approved'].includes(row.status)||row.payment_status!=='paid'||
 row.order_payment_id!==row.payment_id||row.order_amount_cents!==row.sale_cents||row.amount_cents!==row.snapshot_commission_cents)throw fail(409,'Commissie kan niet worden beoordeeld.');
 const customer=JSON.parse(row.payload_json).email;
 if(typeof customer!=='string'||!customer.trim())throw uncertain();
 const ownOrder=customer.trim().toLowerCase()===row.partner_email.trim().toLowerCase();
 const verified=await verifyCommissionPayment(env,row);
 const now=new Date().toISOString();
 const decision=commissionDecision({verifiedPayment:verified,deliveredAt:row.delivered_at,
 cancellationRequested:!!row.cancellation_requested_at,ownOrder,reviewApproved:true});
 if(decision==='pending')throw fail(409,'Controleperiode nog niet verstreken of levering niet geregistreerd.');
 const reason=verified.chargedBack?'chargeback':verified.refunded?'refund':ownOrder?'self_order':'cancellation';
 const update=decision==='approved'?
 q(`UPDATE creator_commissions SET status='approved',approved_at=COALESCE(approved_at,?),updated_at=? WHERE order_id=? AND status IN ('pending','approved')
 AND delivered_at=? AND eligible_at<=? AND EXISTS(SELECT 1 FROM orders o WHERE o.id=creator_commissions.order_id AND o.cancellation_requested_at IS NULL AND o.payment_status='paid' AND o.payment_id=creator_commissions.payment_id)`,now,now,row.order_id,row.delivered_at,now):
 q("UPDATE creator_commissions SET status='rejected',rejection_reason=?,updated_at=? WHERE order_id=? AND status IN ('pending','approved')",reason,now,row.order_id);
 const results=await db.batch([update,q("INSERT INTO creator_audit(id,actor_id,action,entity_id,created_at) VALUES(?,?,?,?,?)",crypto.randomUUID(),actor.id,'commission_review_'+decision,row.order_id,now)]);
 if(results[0]?.meta?.changes!==1)throw fail(409,'Commissie is ondertussen gewijzigd. Vernieuw het overzicht.');
 return {ok:true,status:decision};
}
