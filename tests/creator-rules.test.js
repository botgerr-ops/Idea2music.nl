import test from 'node:test';
import assert from 'node:assert/strict';
import {creatorQuote, normalizeCreatorCode, commissionDecision, payoutEligible, HOLD_MS} from '../lib/creator-rules.js';
import {PROMO_END} from '../lib/order-rules.js';
const now=PROMO_END+1000;
const record={code:'MANDY10',partner_id:'p1',partner_status:'active',active:1,
 discount_bps:1000,commission_cents:200,starts_at:new Date(PROMO_END).toISOString(),ends_at:null};
const quote=(overrides={})=>creatorQuote({code:'mandy10',record,now,enabled:true,...overrides});
test('normalizes codes and rejects malformed input',()=>{
 assert.equal(normalizeCreatorCode(' mandy10 '),'MANDY10');
 for(const v of ['a','<script>',{},'A B','A'.repeat(33)]) assert.equal(normalizeCreatorCode(v),null);
});
test('normal price remains unchanged with no partner',()=>{
 assert.deepEqual(creatorQuote({now}),{amountCents:1500,attribution:null});
});
test('disabled program and active introduction promotion do not grant a partner discount',()=>{
 assert.equal(quote({enabled:false}).amountCents,1500);
 assert.ok(quote({enabled:false}).error);
 assert.equal(quote({now:PROMO_END-1}).amountCents,750);
 assert.equal(quote({now:PROMO_END-1}).attribution,null);
});
test('valid creator code snapshots exact discount and commission in integer cents',()=>{
 assert.deepEqual(quote(),{amountCents:1350,attribution:{partnerId:'p1',code:'MANDY10',
  baseCents:1500,discountBps:1000,saleCents:1350,commissionCents:200}});
 assert.equal(quote({record:{...record,commission_cents:300}}).attribution.commissionCents,300);
});
test('inactive, unknown, expired, future or manipulated records are rejected',()=>{
 for(const r of [null,{...record,active:0},{...record,partner_status:'suspended'},
 {...record,ends_at:new Date(now).toISOString()},{...record,starts_at:new Date(now+1).toISOString()},
 {...record,commission_cents:500},{...record,discount_bps:9000}]) {
  assert.equal(quote({record:r}).attribution,null);
  assert.ok(quote({record:r}).error);
 }
});
const deliveredAt=new Date(now).toISOString();
const verifiedPayment={status:'paid',refunded:false,chargedBack:false};
const valid={verifiedPayment,deliveredAt,cancellationRequested:false,ownOrder:false,reviewApproved:true,now:now+HOLD_MS};
test('commission requires verified payment, delivery, review and hold period',()=>{
 assert.equal(commissionDecision(valid),'approved');
 for(const patch of [{verifiedPayment:null},{deliveredAt:null},{reviewApproved:false},{now:now+HOLD_MS-1},
 {verifiedPayment:{status:'paid'}},{ownOrder:undefined}]) assert.equal(commissionDecision({...valid,...patch}),'pending');
});
test('refunds, chargebacks, cancellations and self purchases reject commissions',()=>{
 for(const patch of [{verifiedPayment:{...verifiedPayment,refunded:true}},
 {verifiedPayment:{...verifiedPayment,chargedBack:true}},{cancellationRequested:true},{ownOrder:true}])
 assert.equal(commissionDecision({...valid,...patch}),'rejected');
});
test('payout threshold is twenty euros net commission',()=>{
 assert.equal(payoutEligible(1999),false);assert.equal(payoutEligible(2000),true);
 assert.equal(payoutEligible(2000.5),false);assert.equal(payoutEligible('2000'),false);
});
