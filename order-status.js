let identity=null, busy=false, attempts=0;
const title=document.getElementById('status-title'),status=document.getElementById('payment-status'),button=document.getElementById('refresh-status');
const fragment=location.hash.slice(1).split(':');
if(fragment.length===2){identity={orderId:fragment[0],token:fragment[1]};try{sessionStorage.setItem('idea2music-order',JSON.stringify(identity));}catch{}history.replaceState(null,'',location.pathname);}
else{try{identity=JSON.parse(sessionStorage.getItem('idea2music-order'));}catch{}}
async function check(){
 if(busy)return;
 if(!identity){title.textContent='Bestelling terugvinden';status.textContent='Open deze pagina via de terugkeerlink van Mollie, of mail ons uw bestelnummer. Een ontbrekende bevestiging betekent niet dat uw betaling is mislukt.';button.hidden=true;return;}
 busy=true;button.disabled=true;button.setAttribute('aria-busy','true');
 try{const response=await fetch(`/api/status?id=${encodeURIComponent(identity.orderId)}`,{headers:{Authorization:`Bearer ${identity.token}`},cache:'no-store',signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw Error(data.message||'De status is tijdelijk niet bereikbaar.');document.getElementById('reference').textContent=`Bestelnummer: I2M-${data.orderId}`;
 const states={paid:['Betaling ontvangen','Uw aanvraag is ontvangen. U krijgt een bestelbevestiging per e-mail. We streven naar levering binnen 1 werkdag; bij drukte informeren we u tijdig.'],open:['Betaling nog niet afgerond','We hebben nog geen afgeronde betaling ontvangen. Als u net heeft betaald, controleer de status over een moment opnieuw.'],pending:['Betaling wordt verwerkt','Mollie verwerkt uw betaling nog. U hoeft niet opnieuw te betalen.'],authorized:['Betaling wordt verwerkt','Uw betaling is geautoriseerd, maar nog niet definitief bevestigd.'],canceled:['Betaling geannuleerd','Deze betaling is geannuleerd. Heeft u mogelijk toch betaald? Neem contact op voordat u opnieuw bestelt.'],failed:['Betaling niet gelukt','Mollie meldt dat de betaling niet is gelukt. Neem contact op als u wel een afschrijving ziet.'],expired:['Betaalpoging verlopen','Deze betaalpoging is verlopen. Neem contact op als u wel een afschrijving ziet.']};
 const copy=states[data.status]||['Status controleren','Neem contact op voor de status van uw bestelling.'];title.textContent=copy[0];status.textContent=copy[1];if(data.cancellationRequested)status.textContent+=' Voor deze bestelling is een annuleringsverzoek ontvangen.';
 if(data.status==='paid')window.I2MTracking?.trackPurchase(data.orderId,data.amountCents,data.testMode===true);
 document.title=`${copy[0]} — Idea2Music`;
 if(['open','pending','authorized'].includes(data.status)&&attempts++<5)setTimeout(check,4000);
 }catch(error){title.textContent='Nog geen bevestiging';status.textContent=`${error.message} Betaal niet nogmaals zolang de status onduidelijk is.`;}finally{busy=false;button.disabled=false;button.removeAttribute('aria-busy');}
}
button.addEventListener('click',check);check();
