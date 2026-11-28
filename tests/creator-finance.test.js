import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPayment,verifyCommissionPayment,reviewCommission} from '../lib/creator-finance.js';
const row={order_id:'order-1',payment_id:'tr_test1',sale_cents:1350};
const p={id:row.payment_id,metadata:{orderId:row.order_id},mode:'test',status:'paid',amount:{currency:'EUR',value:'13.50'}};
const list=(key,entries=[])=>({count:entries.length,_embedded:{[key]:entries},_links:{next:null}});
const refunds=list('refunds'),charges=list('chargebacks');
const classify=(payment=p,r=refunds,c=charges)=>classifyPayment(payment,r,c,row,'test');
test('verified paid order with no refunds or chargebacks is clean',()=>assert.deepEqual(classify(),{status:'paid',refunded:false,chargedBack:false,settledRefund:false}));
test('refunds and chargebacks block approval',()=>{
 assert.equal(classify(p,list('refunds',[{status:'pending'}])).refunded,true);
 assert.equal(classify(p,list('refunds',[{status:'refunded'}])).refunded,true);
 assert.equal(classify({...p,amountRefunded:{currency:'EUR',value:'0.01'}}).refunded,true);
 assert.equal(classify(p,list('refunds',[{status:'failed'}])).refunded,false);
 assert.equal(classify(p,refunds,list('chargebacks',[{}])).chargedBack,true);
});
test('incomplete, mismatched and malformed payment data fail closed',()=>{
 for(const payment of [{...p,id:'tr_other'},{...p,mode:'live'},{...p,status:'open'},{...p,amount:{currency:'EUR',value:'15.00'}},{...p,metadata:{orderId:'wrong'}},{...p,amountRefunded:{currency:'USD',value:'1.00'}}]) assert.throws(()=>classify(payment));
 assert.throws(()=>classify(p,{...refunds,_links:{next:{href:'https://example.com'}}}));
 assert.throws(()=>classify(p,{}));
 assert.throws(()=>classify(p,refunds,{...charges,count:1}));
});
test('payment verification uses read-only original payment endpoints',async()=>{
 const seen=[];
 const result=await verifyCommissionPayment({MOLLIE_API_KEY:'test_fake123'},row,async(url,opts)=>{
  seen.push(url);assert.equal(opts.method,undefined);assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,'Bearer test_fake123');
  return Response.json(url.includes('/refunds?')?refunds:url.includes('/chargebacks?')?charges:p);
 });
 assert.equal(result.refunded,false);assert.equal(seen.length,3);
 assert.ok(seen.every(url=>url.startsWith('https://api.mollie.com/v2/payments/tr_test1')));
 await assert.rejects(verifyCommissionPayment({MOLLIE_API_KEY:'test_fake123'},row,async()=>new Response('',{status:503})));
});
test('finance review disabled by default',async()=>assert.rejects(reviewCommission({}, {id:'admin'},{}),e=>e.status===404));
