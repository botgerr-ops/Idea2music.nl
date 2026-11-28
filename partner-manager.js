const $=id=>document.getElementById(id);
const money=c=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(c/100);
const labels={pending:'In behandeling',active:'Actief',suspended:'Geblokkeerd',closed:'Gesloten',approved:'Goedgekeurd',rejected:'Afgekeurd',reserved:'Gereserveerd',paid:'Uitbetaald',reversed:'Gecorrigeerd'};
let busy=false;
async function api(path,data){
 const r=await fetch('/api/creator-admin/'+path,{credentials:'same-origin',cache:'no-store',redirect:'error',...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-I2M-Admin':'1'},body:JSON.stringify(data)})});
 const d=await r.json();if(!r.ok)throw Error(d.message||'Actie mislukt.');return d;
}
function td(row,value){const cell=row.insertCell();cell.textContent=value??'—';return cell;}
function button(cell,text,handler){const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',handler);cell.append(b);}
function empty(table,n,text){if(table.rows.length)return;const cell=table.insertRow().insertCell();cell.colSpan=n;cell.textContent=text;}
function date(v){return v?new Date(v).toLocaleDateString('nl-NL'):'—';}
function lock(value){busy=value;document.querySelectorAll('.pm button').forEach(b=>b.disabled=value);}
async function act(path,data){
 if(busy)return;lock(true);
 try{await api(path,data);await refresh();$('status').textContent='Actie verwerkt. Overzicht vernieuwd.';}catch(e){$('status').textContent=e.message;}finally{lock(false);}
}
async function refresh(){
 try{
  const d=await api('overview'),names=new Map(d.partners.map(p=>[p.id,p.display_name]));
  $('active').textContent=d.totals.active_partners;$('pending').textContent=money(d.totals.pending_cents);$('approved').textContent=money(d.totals.approved_cents);$('paid').textContent=money(d.totals.paid_cents);
  for(const id of ['partners','codes','commissions'])$(id).replaceChildren();
  const select=$('add-code').elements.partnerId;select.replaceChildren();
  for(const p of d.partners){
   const row=$('partners').insertRow();const who=td(row,p.display_name);const small=document.createElement('small');small.textContent=p.email;who.append(small);
   td(row,labels[p.status]||p.status);td(row,p.agreement_accepted_at?date(p.agreement_accepted_at):'Niet vastgelegd');const actions=td(row,'');
   if(p.status!=='closed'&&p.status!=='active')button(actions,'Activeren',()=>{
    if(!p.agreement_accepted_at&&!confirm('Bevestig alleen als de partner de schriftelijke pilotvoorwaarden daadwerkelijk heeft geaccepteerd.'))return;
    act('partner-status',{partnerId:p.id,status:'active',agreementConfirmed:true});});
   if(p.status==='active'){button(actions,'Blokkeren',()=>{if(confirm('Partner en alle codes blokkeren?'))act('partner-status',{partnerId:p.id,status:'suspended'});});const option=document.createElement('option');option.value=p.id;option.textContent=p.display_name;select.append(option);}
   if(p.status!=='closed')button(actions,'Sluiten',()=>{if(confirm('Partner definitief sluiten? Bestaande commissies blijven geregistreerd.'))act('partner-status',{partnerId:p.id,status:'closed'});});
  }
  for(const c of d.codes){const row=$('codes').insertRow();td(row,c.code);td(row,names.get(c.partner_id)||'Partner');td(row,money(c.commission_cents));td(row,c.active?'Ja':'Nee');const actions=td(row,'');
   button(actions,c.active?'Uitschakelen':'Inschakelen',()=>act('code-status',{code:c.code,active:!c.active}));
   button(actions,'Code kopiëren',async()=>{try{await navigator.clipboard.writeText(c.code);$('status').textContent='Kortingscode gekopieerd.';}catch{$('status').textContent='Kopiëren mislukt.';}});
  }
  for(const c of d.commissions){const row=$('commissions').insertRow();td(row,'I2M-'+c.order_id);td(row,names.get(c.partner_id)||c.code);td(row,money(c.amount_cents));td(row,labels[c.status]||c.status);td(row,date(c.delivered_at));const actions=td(row,'');
   if(c.status==='pending'&&!c.delivered_at)button(actions,'Geleverd',()=>{if(confirm('Is dit lied daadwerkelijk aan de klant geleverd?'))act('delivered',{orderId:c.order_id,confirmed:true});});
   if(d.financeEnabled&&['pending','approved'].includes(c.status)&&c.delivered_at)button(actions,'Commissie controleren',()=>{if(confirm('Bevestig dat u de bestelling, daadwerkelijke levering en mogelijke fraude heeft gecontroleerd. De betaalstatus wordt opnieuw gecontroleerd.'))act('review-commission',{orderId:c.order_id,confirmed:true});});
  }
  empty($('partners'),4,'Nog geen partners.');empty($('codes'),5,'Nog geen codes.');empty($('commissions'),6,'Nog geen commissies.');
  $('manager').hidden=false;$('status').textContent='Overzicht geladen.'+(d.totals.total_partners>d.partners.length||d.totals.total_codes>d.codes.length||d.totals.total_commissions>d.commissions.length?' Alleen de meest recente rijen worden getoond.':'');
 }catch(e){$('manager').hidden=true;for(const id of ['partners','codes','commissions'])$(id).replaceChildren();$('status').textContent='Geen overzicht beschikbaar: '+e.message;throw e;}
}
$('refresh').addEventListener('click',()=>{if(!busy){lock(true);refresh().catch(()=>{}).finally(()=>lock(false));}});
$('add-partner').addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget;act('partners',Object.fromEntries(new FormData(f)));});
$('add-code').addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget;act('codes',Object.fromEntries(new FormData(f)));});
lock(true);refresh().catch(()=>{}).finally(()=>lock(false));
