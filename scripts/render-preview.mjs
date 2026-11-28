// Render-only preview. No provider credentials, no writes, no live tracking.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { priceAt } from '../lib/order-rules.js';
const root = resolve(process.cwd());
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.mp3':'audio/mpeg','.mp4':'video/mp4'};
const config = {enabled:false,test:true,amountCents:priceAt(),creatorEnabled:false};
const headers = {'X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",'Cache-Control':'no-store'};
const server = http.createServer(async (req,res)=>{
 for(const [k,v] of Object.entries(headers)) res.setHeader(k,v);
 const reply = (status,body,type='text/plain; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type});res.end(req.method==='HEAD'?undefined:body);};
 if(!['GET','HEAD'].includes(req.method)) return reply(405,'Testomgeving: geen bestellingen, betalingen of wijzigingen.');
 try{
  let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(path==='/healthz')return reply(200,JSON.stringify({status:'ok',mode:'isolated-preview',checkout:false,tracking:false}), 'application/json');
  if(path==='/api/config')return reply(200,JSON.stringify({...config,amountCents:priceAt()}),'application/json');
  if(path.startsWith('/api/'))return reply(503,JSON.stringify({message:'Deze functie is in de testomgeving nog niet beschikbaar.'}),'application/json');
  if(path==='/robots.txt')return reply(200,'User-agent: *\nDisallow: /\n');
  if(path==='/tracking.js')return reply(200,'window.I2MTracking=Object.freeze({trackInitiateCheckout(){},trackPurchase(){}});',types['.js']);
  if(path==='/')path='/index.html';
  if(/^\/[a-z0-9-]+$/.test(path))path+='.html';
  if(!/^\/(?:[a-z0-9][a-z0-9._-]*\.(?:html|js|css)|assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9][a-zA-Z0-9._-]*)$/.test(path))return reply(404,'Niet gevonden');
  const type=types[extname(path).toLowerCase()];
  if(!type)return reply(404,'Niet gevonden');
  let body=await readFile(resolve(root,'.'+path));
  if(type.startsWith('text/html')){
   body=body.toString('utf8').replace(/<script\b[^>]*\bsrc=["']https?:[^>]*>\s*<\/script>/gi,'').replace(/<meta\b[^>]*name=["']google-site-verification["'][^>]*>/gi,'').replace(/(<body\b[^>]*>)/i,'$1<div role="status" style="background:#17212d;color:#fff;text-align:center;padding:10px 16px;font:600 14px system-ui">TESTOMGEVING — geen echte bestellingen of betalingen</div>');
  }
  return reply(200,body,type);
 }catch{return reply(404,'Niet gevonden');}
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Idea2Music isolated Render preview ready'));
