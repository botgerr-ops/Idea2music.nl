import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCreatorAdmin} from '../lib/creator-admin-auth.js';
import {creatorAdmin} from '../lib/creator-admin.js';
const now=Date.parse('2026-12-01T12:00:00Z');
const env={CREATOR_ADMIN_ENABLED:'true',CREATOR_ACCESS_ISSUER:'https://example-team.cloudflareaccess.com',CREATOR_ACCESS_AUD:'example-aud',CREATOR_ADMIN_EMAIL:'admin@example.com'};
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'key-1',alg:'RS256'};
const b64=x=>Buffer.from(x).toString('base64url');
const claims={iss:env.CREATOR_ACCESS_ISSUER,aud:[env.CREATOR_ACCESS_AUD],sub:'admin-id',email:env.CREATOR_ADMIN_EMAIL,iat:now/1000-10,exp:now/1000+600};
async function token(patch={},header={}){
 const input=b64(JSON.stringify({alg:'RS256',kid:'key-1',...header}))+'.'+b64(JSON.stringify({...claims,...patch}));
 return input+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(input)));
}
const request=t=>new Request('https://example.com/api/creator-admin/overview',{headers:{'Cf-Access-Jwt-Assertion':t}});
const fetcher=async url=>{assert.equal(url,env.CREATOR_ACCESS_ISSUER+'/cdn-cgi/access/certs');return Response.json({keys:[jwk]});};
test('accepts only a verified admin application JWT',async()=>{assert.deepEqual(await verifyCreatorAdmin(request(await token()),env,fetcher,now),{id:'admin-id'});});
test('rejects wrong audience, issuer, email, expiry and future token',async()=>{
 for(const patch of [{aud:['wrong']},{iss:'https://other.cloudflareaccess.com'},{email:'other@example.com'},{exp:now/1000},{iat:now/1000+60},{nbf:now/1000+60}])assert.equal(await verifyCreatorAdmin(request(await token(patch)),env,fetcher,now),null);
});
test('rejects unsigned, tampered and unknown-key tokens',async()=>{
 const t=await token();const [h,p,s]=t.split('.');const tampered=h+'.'+b64(JSON.stringify({...claims,sub:'attacker'}))+'.'+s;
 for(const v of [tampered,await token({},{alg:'none'}),await token({},{kid:'unknown'}),''])assert.equal(await verifyCreatorAdmin(request(v),env,fetcher,now),null);
});
test('disabled and unauthenticated admin routes do not query the database',async()=>{
 const poison={prepare(){throw Error('Database accessed without auth');}};
 assert.equal((await creatorAdmin(request(''),{ORDERS_DB:poison},'creator-admin/overview')).status,404);
 assert.equal((await creatorAdmin(request(''),{...env,ORDERS_DB:poison},'creator-admin/overview')).status,403);
});
