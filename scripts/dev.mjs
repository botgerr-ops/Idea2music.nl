// Internal static preview: never accepts orders or calls payment/email providers.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {priceAt} from '../lib/order-rules.js';
const root=process.cwd();
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({enabled:false,test:true,amountCents:priceAt()}));return;}
 const path=resolve(root,`.${decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)}`);
 if(!path.startsWith(root+'/')){res.writeHead(403);res.end();return;}
 try{const data=await readFile(path);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[extname(path)]||'text/plain');res.end(data);}catch{res.writeHead(404);res.end('Niet gevonden');}
}).listen(Number(process.env.PORT||process.argv[process.argv.indexOf('--port')+1]||3000),'0.0.0.0');
