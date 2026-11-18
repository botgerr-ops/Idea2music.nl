export const CONSENT_VERSION = '2026-11-14-v1';
export const PROMO_END = Date.parse('2026-12-01T00:00:00+01:00');
export const DELIVERY = 'We streven ernaar uw bestelling binnen 1 werkdag na betaling en ontvangst van de volledig ingevulde vragenlijst te leveren. Bij drukte kan het soms wat langer duren. In dat geval informeren we u tijdig.';
export const CONSENT = 'Ik geef toestemming om mijn persoonlijke lied binnen de bedenktijd te leveren. Ik begrijp dat mijn wettelijke bedenktijd vervalt zodra ik met het downloaden of afspelen begin, nadat ik hiervan een bevestiging heb ontvangen.';
export function priceAt(now = Date.now()) { return now < PROMO_END ? 750 : 1500; }
export function euro(cents) { return new Intl.NumberFormat('nl-NL', {style:'currency', currency:'EUR'}).format(cents / 100); }
export const fields = {
 name: {label:'Uw naam', min:2, max:100},
 email: {label:'Uw e-mailadres', min:5, max:254},
 phone: {label:'Telefoonnummer', min:0, max:30},
 billingStreet: {label:'Straat (factuuradres)', min:2, max:120},
 billingNumber: {label:'Huisnummer en toevoeging', min:1, max:20},
 billingPostalCode: {label:'Postcode', min:3, max:20},
 billingCity: {label:'Woonplaats', min:2, max:100},
 billingCountry: {label:'Land', min:2, max:80},
 company: {label:'Bedrijfsnaam', min:0, max:120},
 vatNumber: {label:'Btw-nummer', min:0, max:32},
 recipient: {label:'Voor wie is het lied?', min:1, max:100},
 occasion: {label:'Gelegenheid', min:1, max:150},
 story: {label:'Uw verhaal', min:20, max:4000},
 style: {label:'Muziekstijl', min:1, max:150},
 mood: {label:'Sfeer', min:1, max:150},
 language: {label:'Taal', min:1, max:100},
 pronunciation: {label:'Uitspraak van namen', min:0, max:500}
};
export function validateOrder(input) {
 const values = {}, errors = {};
 for (const [key, spec] of Object.entries(fields)) {
  const value = typeof input?.[key] === 'string' ? input[key].trim() : '';
  values[key] = value;
  if(value.length < spec.min) errors[key] = key === 'story' ? 'Vertel iets meer: gebruik minimaal 20 tekens.' : 'Vul dit veld in.';
  if(value.length > spec.max) errors[key] = `Gebruik maximaal ${spec.max} tekens.`;
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) errors[key]='Verwijder de ongeldige tekens.';
 }
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email='Vul een geldig e-mailadres in.';
 for(const name of ['terms','digitalConsent']) { values[name] = input?.[name] === true; if(!values[name]) errors[name]='Vink dit aan om door te gaan.'; }
 return {values,errors};
}
