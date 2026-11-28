const form=document.getElementById('application'),status=document.getElementById('status'),button=document.getElementById('submit');
form.addEventListener('submit',async e=>{
 e.preventDefault();button.disabled=true;status.textContent='Aanmelding verwerken…';
 const data=new FormData(form);
 try{
  const r=await fetch('/api/creator-application',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:data.get('name'),email:data.get('email'),website:data.get('website'),privacyAcknowledged:data.has('privacyAcknowledged')}),signal:AbortSignal.timeout(10000)});
  const d=await r.json();status.textContent=d.message||'Aanmelding kon niet worden verwerkt.';if(r.ok)form.reset();
 }catch{status.textContent='Aanmelden lukt nu niet. Probeer opnieuw.';}finally{button.disabled=false;}
});
