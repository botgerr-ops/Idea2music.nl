// Cloudflare Access application JWT, verified at the origin. Never trust email headers.
const decode = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
const parse = value => JSON.parse(new TextDecoder().decode(decode(value)));
export async function verifyAccessIdentity(request,issuer,audience,fetcher=fetch,now=Date.now()){
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer||'')||typeof audience!=='string'||!audience)return null;
 try{
  const token=request.headers.get('Cf-Access-Jwt-Assertion')||'';
  if(token.length>12000)return null;
  const parts=token.split('.');if(parts.length!==3||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))return null;
  const h=parse(parts[0]),p=parse(parts[1]),seconds=Math.floor(now/1000);
  if(h.alg!=='RS256'||typeof h.kid!=='string'||p.iss!==issuer||
    !Array.isArray(p.aud)||!p.aud.includes(audience)||!Number.isFinite(p.exp)||p.exp<=seconds||
    !Number.isFinite(p.iat)||p.iat>seconds+30||(p.nbf!==undefined&&(!Number.isFinite(p.nbf)||p.nbf>seconds))||
    typeof p.sub!=='string'||!p.sub||typeof p.email!=='string'||!p.email.trim()||p.email.length>254)return null;
  const res=await fetcher(issuer+'/cdn-cgi/access/certs',{redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!res.ok)return null;
  const jwks=await res.json(),jwk=jwks.keys?.find(k=>k.kid===h.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256'));
  if(!jwk)return null;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  return valid?{id:p.sub,email:p.email.trim().toLowerCase()}:null;
 }catch{return null;}
}

export async function verifyCreatorAdmin(request,env,fetcher=fetch,now=Date.now()){
 const allowed=(env.CREATOR_ADMIN_EMAIL||'').trim().toLowerCase();
 if(env.CREATOR_ADMIN_ENABLED!=='true'||!allowed)return null;
 const identity=await verifyAccessIdentity(request,env.CREATOR_ACCESS_ISSUER,env.CREATOR_ACCESS_AUD,fetcher,now);
 return identity?.email===allowed?{id:identity.id}:null;
}
