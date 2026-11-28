import {fields,validateOrder,euro,priceAt,PROMO_END} from './lib/order-rules.js';
const form=document.getElementById('order-form');
const pay=document.getElementById('pay-button');
const feedback=document.getElementById('form-feedback');
const creatorBox=document.createElement('div');
creatorBox.className='notice';creatorBox.hidden=true;
const creatorLabel=document.createElement('label');creatorLabel.htmlFor='creator-code';creatorLabel.textContent='Partnerkortingscode (optioneel)';
const creatorInput=document.createElement('input');creatorInput.id='creator-code';creatorInput.type='text';creatorInput.maxLength=32;creatorInput.autocomplete='off';creatorInput.placeholder='Kortingscode';
const creatorApply=document.createElement('button');creatorApply.type='button';creatorApply.className='text-button';creatorApply.textContent='Toepassen';
const creatorRemove=document.createElement('button');creatorRemove.type='button';creatorRemove.className='text-button';creatorRemove.textContent='Verwijderen';
const creatorNotice=document.createElement('p');creatorNotice.setAttribute('role','status');
creatorBox.append(creatorLabel,creatorInput,creatorApply,creatorRemove,creatorNotice);
document.getElementById('availability').after(creatorBox);
let creatorCode=null,quoteBusy=false,configLoaded=false,requestVersion=0;
creatorInput.value=(new URL(location.href).searchParams.get('ref')||'').slice(0,32);
function lockCode(){
 const locked=busy||quoteBusy||!!identity;
 creatorInput.disabled=locked;creatorApply.disabled=locked;creatorRemove.disabled=locked;
 pay.disabled=!config.enabled||quoteBusy||busy;
}
async function applyCode(){
 if(!config.creatorEnabled||identity||busy||quoteBusy)return;
 const candidate=creatorInput.value.trim();
 if(!candidate){clearCode();return;}
 const version=++requestVersion;
 quoteBusy=true;lockCode();creatorNotice.textContent='Kortingscode controleren…';
 try{
  const response=await fetch('/api/creator-quote?code='+encodeURIComponent(candidate),{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('De kortingscode kon niet worden gecontroleerd.');
  const data=await response.json();
  if(version!==requestVersion)return;
  if(!data.valid)throw Error(data.message||'Deze partnercode is niet geldig.');
  creatorCode=data.code;creatorInput.value=data.code;config.amountCents=data.amountCents;
  creatorNotice.textContent='10% partnerkorting toegepast.';displayPrice();
 }catch(error){
  if(version!==requestVersion)return;
  creatorNotice.textContent=error.message+(creatorCode?' Eerdere code blijft toegepast: '+creatorCode+'.':' Geen partnerkorting toegepast.');
  creatorInput.value=creatorCode||candidate;
 }finally{
  if(version===requestVersion){quoteBusy=false;lockCode();}
 }
}
function clearCode(){
 if(identity||busy||quoteBusy)return;
 creatorCode=null;creatorInput.value='';config.amountCents=config.baseAmountCents??priceAt();
 creatorNotice.textContent='';displayPrice();lockCode();
}
creatorApply.addEventListener('click',applyCode);creatorRemove.addEventListener('click',clearCode);
creatorInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();applyCode();}});
for(const id of ['review-button','edit-button','new-attempt']) document.getElementById(id).disabled=false;
let config={enabled:false,amountCents:priceAt()}, busy=false, identity=null, submittedPayload=null, dirty=false, navigating=false;
const freshIdentity=()=>({orderId:crypto.randomUUID(),token:Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('')});
const answers=()=>({...Object.fromEntries(new FormData(form)),terms:form.elements.terms.checked,digitalConsent:form.elements.digitalConsent.checked});

// Keep the original invoice and payment fields unchanged. Only their presentation
// is reorganised: a personal story, the musical choices, then customer details.
const questions=document.getElementById('questions');
const originalGroups=[...questions.querySelectorAll(':scope > fieldset')];
if(originalGroups.length!==4)throw Error('Onverwachte opbouw van het bestelformulier.');
const stepDefinitions=[
 {title:'Uw verhaal',hint:'Voor wie is het lied en welke herinneringen maken het bijzonder?',groups:[originalGroups[2]],keys:['recipient','occasion','story']},
 {title:'De muziek',hint:'Kies de stijl, sfeer en taal. Een lastige naam? Schrijf de uitspraak erbij.',groups:[originalGroups[3]],keys:['style','mood','language','pronunciation']},
 {title:'Uw gegevens',hint:'Nog even de contact- en factuurgegevens, daarna kunt u alles controleren.',groups:[originalGroups[0],originalGroups[1]],keys:['name','email','phone','billingStreet','billingNumber','billingPostalCode','billingCity','billingCountry','company','vatNumber']}
];
const heading=document.getElementById('form-title');
const context=document.getElementById('step-context');
const progress=[...document.querySelectorAll('[data-progress-step]')];
const reviewButton=document.getElementById('review-button');
const panels=stepDefinitions.map((step,index)=>{
 const panel=document.createElement('section');
 panel.className='order-step';panel.dataset.step=String(index);
 step.groups.forEach(group=>panel.append(group));
 const actions=document.createElement('div');actions.className='step-actions';
 if(index>0){
  const back=document.createElement('button');back.type='button';back.className='text-button step-back';
  back.textContent='← Vorige stap';back.addEventListener('click',()=>showStep(index-1));actions.append(back);
 }
 if(index<stepDefinitions.length-1){
  const next=document.createElement('button');next.type='button';next.className='button step-next';
  next.textContent=index===0?'Verder naar de muziek →':'Verder naar uw gegevens →';
  next.addEventListener('click',()=>{
   const {errors}=validateOrder(answers());
   if(showErrors(errors,step.keys))showStep(index+1);
  });
  actions.append(next);
 }else actions.append(reviewButton);
 panel.append(actions);questions.append(panel);
 return panel;
});
heading.tabIndex=-1;
function showStep(index,focus=true){
 panels.forEach((panel,i)=>{panel.hidden=i!==index;});
 progress.forEach((item,i)=>{
  if(i===index)item.setAttribute('aria-current','step');
  else item.removeAttribute('aria-current');
  item.classList.toggle('is-complete',i<index);
 });
 heading.textContent=stepDefinitions[index].title;context.textContent=stepDefinitions[index].hint;
 if(focus){heading.focus({preventScroll:true});heading.scrollIntoView({behavior:'auto',block:'start'});}
}
showStep(0,false);
function showErrors(errors,keys=[...Object.keys(fields),'terms','digitalConsent']) {
 for(const key of keys){const el=form.elements[key];el.setAttribute('aria-invalid',String(!!errors[key]));document.getElementById(`${key}-error`).textContent=errors[key]||'';}
 const first=keys.find(key=>errors[key]);if(first)form.elements[first].focus();return !first;
}
function displayPrice(){document.querySelectorAll('[data-price]').forEach(el=>el.textContent=euro(config.amountCents));if(Date.now()>=PROMO_END)document.querySelector('[data-offer]').textContent=creatorCode?'10% partnerkorting toegepast.':'Eén persoonlijk samengesteld en gecontroleerd lied met songtekst.';pay.textContent=`Bestellen en betalen — ${euro(config.amountCents)}`;}
async function loadConfig(){try{const r=await fetch('/api/config',{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!r.ok)throw Error();const next=await r.json();config={...next,baseAmountCents:next.amountCents};if(identity&&creatorCode)config.amountCents=1350;creatorBox.hidden=!config.creatorEnabled;displayPrice();document.getElementById('availability').textContent=config.enabled?(config.test?'Testomgeving: er worden geen echte betalingen gedaan.':'Uw aanvraag wordt pas definitief nadat Mollie uw betaling bevestigt.'):'Online bestellen is nog niet geopend. U kunt het formulier bekijken; betalen is nog niet mogelijk. Vragen? Mail info@narrowvision.eu.';}catch{document.getElementById('availability').textContent='De bestelstatus is niet bereikbaar. Probeer later opnieuw of mail info@narrowvision.eu.';}lockCode();if(config.creatorEnabled&&!identity&&creatorInput.value&&!configLoaded){configLoaded=true;await applyCode();}else if(config.creatorEnabled&&!identity&&creatorCode){await applyCode();}}
document.getElementById('review-button').addEventListener('click',()=>{
 const {values,errors}=validateOrder(answers());delete errors.terms;delete errors.digitalConsent;
 const firstInvalid=Object.keys(fields).find(key=>errors[key]);
 if(firstInvalid){
  const index=stepDefinitions.findIndex(step=>step.keys.includes(firstInvalid));
  showStep(index);
  showErrors(errors,stepDefinitions[index].keys);
  return;
 }
 const dl=document.getElementById('order-summary');dl.replaceChildren();
 for(const [key,spec]of Object.entries(fields)){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=spec.label;dd.textContent=values[key]||'Niet opgegeven';dl.append(dt,dd);}
 questions.hidden=true;document.getElementById('review').hidden=false;
 heading.textContent='Controleer uw aanvraag';context.textContent='Klopt alles? Daarna gaat u veilig betalen via Mollie.';
 document.getElementById('review-title').focus();feedback.textContent='';
});
document.getElementById('edit-button').addEventListener('click',()=>{if(busy)return;questions.hidden=false;document.getElementById('review').hidden=true;showStep(0);});
document.getElementById('new-attempt').addEventListener('click',()=>{if(busy)return;identity=null;submittedPayload=null;lockCode();feedback.textContent='U kunt opnieuw afrekenen. Een eerdere geslaagde betaling kunt u terugvinden via de link van Mollie.';document.getElementById('new-attempt').hidden=true;});
form.addEventListener('input',event=>{dirty=true;if(event.target.name){event.target.setAttribute('aria-invalid','false');const error=document.getElementById(`${event.target.name}-error`);if(error)error.textContent='';}if(event.target.tagName==='TEXTAREA'){event.target.style.height='auto';event.target.style.height=`${event.target.scrollHeight}px`;}});
window.addEventListener('beforeunload',event=>{if(dirty&&!navigating){event.preventDefault();event.returnValue='';}});
form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy||quoteBusy||!config.enabled)return;
 const {values,errors}=validateOrder(answers());if(!showErrors(errors))return;
 const payload=JSON.stringify(values);
 if(submittedPayload&&submittedPayload!==payload){feedback.textContent='Er is al een betaalpoging gestart met andere gegevens. Rond die af of controleer eerst de betaalstatus. Start daarna zo nodig een nieuwe aanvraag.';return;}
 identity ||= freshIdentity();submittedPayload=payload;busy=true;lockCode();pay.setAttribute('aria-busy','true');pay.textContent='Betaalpagina openen…';feedback.textContent='';
 try{
  const response=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...identity,answers:values,amountCents:config.amountCents,creatorCode}),signal:AbortSignal.timeout(25000)});
  const data=await response.json();
  if(!response.ok){
   if(data.errors){
    const firstField=Object.keys(fields).find(key=>data.errors[key]);
    if(firstField){
     questions.hidden=false;document.getElementById('review').hidden=true;
     const index=stepDefinitions.findIndex(step=>step.keys.includes(firstField));
     showStep(index);showErrors(data.errors,stepDefinitions[index].keys);
    }else showErrors(data.errors,['terms','digitalConsent']);
   }
   if(response.status===409)document.getElementById('new-attempt').hidden=false;
   throw Error(data.message||'Betalen is nu niet mogelijk. Probeer opnieuw.');
  }
  const statusUrl=`/bestelling.html#${identity.orderId}:${identity.token}`;
  try{sessionStorage.setItem('idea2music-order',JSON.stringify(identity));}catch{/* The fragment in the Mollie return URL also carries access. */}
  if(!data.paid&&data.checkoutUrl)window.I2MTracking?.trackInitiateCheckout(config.amountCents);
  navigating=true;window.location.assign(data.paid?statusUrl:data.checkoutUrl);
 }catch(error){feedback.textContent=error.name==='TimeoutError'?'De reactie duurt te lang. Probeer opnieuw: dezelfde betaalpoging wordt hervat.':error.message;busy=false;lockCode();pay.removeAttribute('aria-busy');displayPrice();}
});
window.addEventListener('pageshow',()=>{navigating=false;busy=false;pay.removeAttribute('aria-busy');loadConfig();});
