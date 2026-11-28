import {verifyCommissionPayment,reviewCommission} from './creator-finance.js';
import {payoutEligible} from './creator-rules.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const idOK=v=>typeof v==='string'&&/^[0-9a-f-]{36}$/.test(v);
const safeRef=v=>typeof v==='string'&&v.trim().length>=1&&v.trim().length<=120;
export async function payoutAction(env,actor,path,b){
 if(env.CREATOR_FINANCE_ENABLED!=='true'||env.CREATOR_PAYOUT_ENABLED!=='true')throw fail(404,'Uitbetalingen zijn niet ingeschakeld.');
 const db=env.ORDERS_DB,q=(s,...a)=>db.prepare(s).bind(...a),now=new Date().toISOString();
 const audit=(action,id)=>q('INSERT INTO creator_audit VALUES(?,?,?,?,?)',crypto.randomUUID(),actor.id,action,id,now);
 const getRows=async id=>(await q(`SELECT c.*,a.sale_cents,o.payment_status,o.cancellation_requested_at FROM creator_payout_items i JOIN creator_commissions c ON c.order_id=i.order_id JOIN creator_order_attribution a ON a.order_id=c.order_id JOIN orders o ON o.id=c.order_id WHERE i.payout_id=?`,id).all()).results;
 if(path==='creator-admin/payout-create'){
  if(!idOK(b.partnerId)||b.confirmed!==true)throw fail(422,'Selecteer een partner en bevestig de controle.');
  const partner=await q('SELECT id FROM creator_partners WHERE id=?',b.partnerId).first();if(!partner)throw fail(404,'Partner niet gevonden.');
  const end=new Date();end.setUTCDate(1);end.setUTCHours(0,0,0,0);end.setUTCDate(0);
  const periodEnd=end.toISOString().slice(0,10);
  const rows=(await q(`SELECT c.order_id,c.amount_cents,c.approved_at FROM creator_commissions c JOIN creator_order_attribution a ON a.order_id=c.order_id WHERE a.partner_id=? AND c.status='approved' AND substr(c.approved_at,1,10)<=? ORDER BY c.approved_at,c.order_id LIMIT 15`,b.partnerId,periodEnd).all()).results;
  if(!rows.length)throw fail(409,'Geen goedgekeurde commissies uit afgesloten maanden.');
  // Recheck each original payment; no reservation until every selected order passes.
  for(const r of rows){const result=await reviewCommission(env,actor,{orderId:r.order_id,confirmed:true});if(result.status!=='approved')throw fail(409,'Commissie afgekeurd. Vernieuw het overzicht.');}
  const adjustments=(await q(`SELECT x.id,x.amount_cents FROM creator_adjustments x JOIN creator_order_attribution a ON a.order_id=x.order_id WHERE a.partner_id=? AND NOT EXISTS(SELECT 1 FROM creator_payout_adjustments i WHERE i.adjustment_id=x.id)`,b.partnerId).all()).results;
  if(adjustments.length>50)throw fail(409,'Te veel correcties voor deze pilotbatch.');
  const net=rows.reduce((s,r)=>s+r.amount_cents,0)+adjustments.reduce((s,r)=>s+r.amount_cents,0);
  if(!payoutEligible(net))throw fail(409,'Netto commissie is lager dan €20 in deze batch. Bij grote correcties is handmatige beoordeling nodig.');
  const id=crypto.randomUUID(),periodStart=rows[0].approved_at.slice(0,10);
  await db.batch([q(`INSERT INTO creator_payouts(id,partner_id,period_start,period_end,net_cents,created_at) VALUES(?,?,?,?,?,?)`,id,b.partnerId,periodStart,periodEnd,net,now),
   ...rows.map(r=>q('INSERT INTO creator_payout_items VALUES(?,?,?)',id,r.order_id,r.amount_cents)),
   ...adjustments.map(x=>q('INSERT INTO creator_payout_adjustments VALUES(?,?)',id,x.id)),
   q("UPDATE creator_payouts SET status='approved' WHERE id=?",id),audit('payout_reserved',id)]);
  return {ok:true,id,netCents:net};
 }
 if(path==='creator-admin/correct-paid'){
  if(!idOK(b.orderId)||b.confirmed!==true)throw fail(422,'Bevestig de controle.');
  const row=await q(`SELECT c.*,a.sale_cents FROM creator_commissions c JOIN creator_order_attribution a ON a.order_id=c.order_id WHERE c.order_id=? AND c.status IN ('paid','reversed')`,b.orderId).first();
  if(!row)throw fail(409,'Geen uitbetaalde commissie.');
  const check=await verifyCommissionPayment(env,row);
  if(!check.settledRefund&&!check.chargedBack)throw fail(409,'Geen definitief uitgevoerde refund of chargeback vastgesteld.');
  const reason=check.chargedBack?'chargeback':'refund';
  await db.batch([q(`INSERT INTO creator_adjustments(id,order_id,amount_cents,reason,provider_event_ref,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(order_id) DO NOTHING`,crypto.randomUUID(),row.order_id,-row.amount_cents,reason,'reversal:'+row.order_id,now),
   q("UPDATE creator_commissions SET status='reversed',updated_at=? WHERE order_id=? AND status='paid'",now,row.order_id),audit('paid_commission_reversed',row.order_id)]);
  return {ok:true};
 }
 if(!idOK(b.payoutId))throw fail(422,'Ongeldige uitbetaling.');
 const payout=await q('SELECT * FROM creator_payouts WHERE id=?',b.payoutId).first();
 if(!payout||payout.status!=='approved')throw fail(409,'Geen open uitbetaling.');
 if(path==='creator-admin/payout-void'){
  if(b.confirmed!==true)throw fail(422,'Bevestig dat er geen bankbetaling is gedaan.');
  await db.batch([q("UPDATE creator_payouts SET status='void' WHERE id=? AND status='approved'",payout.id),audit('payout_void_requested',payout.id)]);return {ok:true};
 }
 if(path==='creator-admin/payout-check'){
  const rows=await getRows(payout.id);if(!rows.length)throw fail(409,'Geen gereserveerde commissies.');
  for(const r of rows){
   if(r.status!=='reserved'||r.cancellation_requested_at||r.payment_status!=='paid')throw fail(409,'Bestelling gewijzigd: annuleer reservering als nog niet betaald.');
   const check=await verifyCommissionPayment(env,r);if(check.refunded||check.chargedBack)throw fail(409,'Refund of chargeback gevonden: annuleer reservering als nog niet betaald.');
  }
  const newAdjustments=await q(`SELECT count(*) AS count FROM creator_adjustments x JOIN creator_order_attribution a ON a.order_id=x.order_id WHERE a.partner_id=? AND NOT EXISTS(SELECT 1 FROM creator_payout_adjustments i WHERE i.adjustment_id=x.id)`,payout.partner_id).first();
  if(newAdjustments.count)throw fail(409,'Nieuwe correcties: herbereken de reservering.');
  await audit('payout_pretransfer_checked',payout.id).run();return {ok:true,netCents:payout.net_cents};
 }
 if(path==='creator-admin/payout-paid'){
  if(b.confirmed!==true||!safeRef(b.bankReference)||!safeRef(b.invoiceReference)||!Number.isSafeInteger(b.bankAmountCents)||b.bankAmountCents<payout.net_cents||b.bankAmountCents>Math.round(payout.net_cents*1.21))throw fail(422,'Bevestig de werkelijk uitgevoerde bankbetaling en vul bewijsreferenties en bedrag in.');
  // Record reality, even if a later refund occurred. Corrections are processed separately.
  await db.batch([q('INSERT INTO creator_payout_receipts VALUES(?,?,?)',payout.id,b.bankAmountCents,now),
   q("UPDATE creator_payouts SET status='paid',bank_reference=?,invoice_reference=?,paid_at=? WHERE id=? AND status='approved'",b.bankReference.trim(),b.invoiceReference.trim(),now,payout.id),audit('payout_bank_receipt_recorded',payout.id)]);
  return {ok:true};
 }
 throw fail(404,'Niet gevonden.');
}
