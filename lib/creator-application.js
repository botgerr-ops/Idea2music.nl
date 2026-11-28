const result={message:'Bedankt. Als uw aanmelding nieuw is, beoordelen wij deze en nemen wij contact op.'};
export async function applyCreator(env,body){
 if(env.CREATOR_APPLICATION_ENABLED!=='true')return {status:404,body:{message:'Aanmelden is nog niet beschikbaar.'}};
 const invalid={status:422,body:{message:'Vul een geldige naam, e-mailadres en bevestiging van het privacybericht in.'}};
 if(!body||typeof body!=='object'||Array.isArray(body))return invalid;
 if(body.website)return {status:200,body:result};
 const name=typeof body.name==='string'?body.name.trim():'',email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
 if(name.length<2||name.length>100||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||body.privacyAcknowledged!==true)return invalid;
 // No automatic activation, no acceptance of partner terms, no outbound email.
 await env.ORDERS_DB.prepare("INSERT INTO creator_partners(id,display_name,email,created_at) VALUES(?,?,?,?) ON CONFLICT(email) DO NOTHING").bind(crypto.randomUUID(),name,email,new Date().toISOString()).run();
 return {status:200,body:result};
}
