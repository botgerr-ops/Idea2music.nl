const $=id=>document.getElementById(id);
const money=c=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(Number(c)/100);
const status={pending:'In behandeling',approved:'Goedgekeurd',reserved:'Gereserveerd',paid:'Uitbetaald',rejected:'Afgekeurd',reversed:'Gecorrigeerd'};
const date=v=>v?String(v).slice(0,10):'—';
let busy=false;
function add(parent,tag,value){const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;}
function row(table,values){const tr=table.insertRow();for(const v of values)tr.insertCell().textContent=v;}
function clear(){ $('portal').hidden=true;$('welcome').textContent='Uw partneroverzicht.';for(const id of ['codes','history','payouts'])$(id).replaceChildren();for(const id of ['orders','pending','approved','reserved','paid','adjustments'])$(id).textContent='—';}
async function refresh(){
 if(busy)return;busy=true;$('refresh').disabled=true;clear();
 try{
  const r=await fetch('/api/creator-portal/overview',{credentials:'same-origin',cache:'no-store',redirect:'error'});
  const d=await r.json();if(!r.ok)throw Error(d.message||'Geen toegang.');
  $('welcome').textContent='Welkom, '+d.partner.display_name;
  $('orders').textContent=d.totals.paid_orders;
  for(const k of ['pending','approved','reserved','paid'])$(k).textContent=money(d.totals[k+'_cents']);
  $('adjustments').textContent=money(d.adjustments.adjustment_cents);
  for(const c of d.codes){
   const box=document.createElement('div');box.className='creator-code';$('codes').append(box);
   const usable=!!c.active&&Date.parse(c.starts_at)<=Date.now()&&(!c.ends_at||Date.parse(c.ends_at)>Date.now());
   add(box,'small',usable?'Ingeschakeld volgens code-instellingen':c.active?'Nog niet geldig of verlopen':'Uitgeschakeld');
   add(box,'strong',c.code);add(box,'p','10% klantkorting · '+money(c.commission_cents)+' commissie per geldige bestelling');
   if(usable){const button=add(box,'button','Code kopiëren');button.type='button';button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(c.code);$('status').textContent='Kortingscode gekopieerd.';}catch{$('status').textContent='Kopiëren niet gelukt; selecteer de code handmatig.';}});}
  }
  if(!d.codes.length)add($('codes'),'p','Er is nog geen kortingscode toegewezen.');
  for(const h of d.history)row($('history'),[date(h.day),h.code,status[h.status]||h.status,h.orders,money(h.commission_cents)]);
  if(!d.history.length)row($('history'),['—','—','Nog geen commissies','0','—']);
  for(const p of d.payouts)row($('payouts'),[date(p.period_start)+' t/m '+date(p.period_end),money(p.net_cents),status[p.status]||p.status,date(p.paid_at)]);
  if(!d.payouts.length)row($('payouts'),['—','—','Nog geen uitbetalingen','—']);
  $('portal').hidden=false;$('status').textContent='Uw overzicht is geladen.';
 }catch(e){clear();$('status').textContent='Overzicht niet beschikbaar. '+e.message;}finally{busy=false;$('refresh').disabled=false;}
}
$('refresh').addEventListener('click',refresh);
window.addEventListener('pagehide',clear);window.addEventListener('pageshow',e=>{if(e.persisted)refresh();});
refresh();
