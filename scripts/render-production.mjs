// Render production candidate. Remains read-only until an explicit verified cutover.
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {isIP} from 'node:net';
import {openOrdersDb} from './render-db.mjs';
import {onRequest} from '../functions/api/[[path]].js';
const root=resolve(process.cwd()), mount='/var/data';
const mounted=readFileSync('/proc/self/mountinfo','utf8').split('\n').some(l=>l.split(' ')[4]===mount);
if(!mounted)throw Error('Persistent orders disk is required');
const db=openOrdersDb(mount+'/orders.sqlite');
const origin='https://www.idea2music.nl';
const cutover=process.env.I2M_CUTOVER_READY==='true'&&existsSync(mount+'/migration-verified');
if(process.env.CHECKOUT_ENABLED==='true'&&!cutover)throw Error('Checkout requires verified import and explicit cutover');
const env={...process.env,ORDERS_DB:db,PUBLIC_SITE_URL:origin,CHECKOUT_ENABLED:cutover&&process.env.CHECKOUT_ENABLED==='true'?'true':'false',CREATOR_ENABLED:'false',CREATOR_ADMIN_ENABLED:'false',CREATOR_PORTAL_ENABLED:'false',CREATOR_APPLICATION_ENABLED:'false',CREATOR_FINANCE_ENABLED:'false',CREATOR_PAYOUT_ENABLED:'false'};
const baseHeaders={};
for(const line of readFileSync(new URL('../_headers',import.meta.url),'utf8').split('\n').slice(1)){
 if(line.trim()&&!line.startsWith(' '))break;
 if(line.includes(':')){const i=line.indexOf(':');baseHeaders[line.slice(0,i).trim()]=line.slice(i+1).trim();}
}
const safePages=new Set('index.html bestellen.html bestelling.html annuleren.html voorbeelden.html zo-werkt-het.html liefdeslied-laten-maken.html persoonlijk-lied-laten-maken.html verjaardagslied-laten-maken.html'.split(' '));
const safeAssets=new Set('app.js cancel.js checkout.js order-status.js samples.js tracking.js checkout.css multipage.css seo.css studio.css style.css tracking.css robots.txt sitemap.xml'.split(' '));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.mp3':'audio/mpeg','.mp4':'video/mp4','.xml':'application/xml','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 for(const [k,v] of Object.entries(baseHeaders))res.setHeader(k,v);
 if(!cutover)res.setHeader('X-Robots-Tag','noindex, nofollow');
 res.setHeader('Cache-Control','no-store');
 const reply=(status,body,type='text/plain; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type});res.end(req.method==='HEAD'?undefined:body);};
 try{
  const url=new URL(req.url,origin);
  if(url.origin!==origin)return reply(400,'Ongeldig verzoek');
  let path=decodeURIComponent(url.pathname);
  if(path==='/healthz'){db.prepare('SELECT 1 AS ok').first();return reply(200,'ok');}
  if(path.startsWith('/api/')){
   if(!['GET','POST'].includes(req.method))return reply(405,'Niet toegestaan');
   const route=path.slice(5);
   if(!['config','checkout','status','webhook','cancel'].includes(route))return reply(404,'Niet gevonden');
   if(!cutover&&route!=='config')return reply(503,'Bestellen is nog niet beschikbaar');
   if(cutover&&req.headers.host!=='www.idea2music.nl')return reply(403,'Open www.idea2music.nl');
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>24000){return reply(413,'Verzoek te groot');}chunks.push(chunk);}
   const headers=new Headers();for(const k of ['origin','authorization','content-type'])if(typeof req.headers[k]==='string')headers.set(k,req.headers[k]);
   // Render's Cloudflare ingress provides the visitor IP. Reject malformed values.
   const ip=req.headers['cf-connecting-ip'];headers.set('CF-Connecting-IP',typeof ip==='string'&&isIP(ip)?ip:'unknown');
   const request=new Request(url,{method:req.method,headers,body:req.method==='POST'?Buffer.concat(chunks):undefined});
   const result=await onRequest({request,env,params:{path:[route]}});
   for(const [k,v] of result.headers)res.setHeader(k,v);
   return reply(result.status,Buffer.from(await result.arrayBuffer()),result.headers.get('Content-Type')||'application/json');
  }
  if(!['GET','HEAD'].includes(req.method))return reply(405,'Niet toegestaan');
  if(path==='/')path='/index.html';
  if(/^\/[a-z0-9-]+\/?$/.test(path))path=path.replace(/\/$/,'')+'.html';
  const filename=path.slice(1);
  if(!safePages.has(filename)&&!safeAssets.has(filename)&&!/^assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(filename))return reply(404,'Niet gevonden');
  if(['bestellen.html','bestelling.html','annuleren.html'].includes(filename))res.setHeader('X-Robots-Tag','noindex');
  if(!cutover&&filename==='robots.txt')return reply(200,'User-agent: *\nDisallow: /\n');
  if(!cutover&&filename==='tracking.js')return reply(200,'window.I2MTracking=Object.freeze({trackInitiateCheckout(){},trackPurchase(){}});',types['.js']);
  const type=types[extname(path).toLowerCase()];if(!type)return reply(404,'Niet gevonden');
  let body=await readFile(resolve(root,filename));
  if(type.startsWith('text/html')&&!cutover)body=body.toString('utf8').replace(/<script\b[^>]*\bsrc=["']https?:[^>]*>\s*<\/script>/gi,'').replace(/(<body\b[^>]*>)/i,'$1<div role="status" style="background:#17212d;color:#fff;text-align:center;padding:10px">MIGRATIEVOORBEELD — bestellen nog niet actief</div>');
  return reply(200,body,type);
 }catch{return reply(503,'Tijdelijk niet beschikbaar');}
});
server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.log('Idea2Music disk-backed candidate ready; checkout '+(env.CHECKOUT_ENABLED==='true'?'enabled':'disabled')));
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit(0);}));
