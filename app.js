document.querySelectorAll('.wave').forEach(wave=>{for(let i=0;i<75;i++){const bar=document.createElement('i');const envelope=Math.exp(-Math.pow((i-37)/23,2));bar.style.height=(7+envelope*(20+74*Math.abs(Math.sin(i*1.71)))*Math.abs(Math.cos(i*.24)))+'%';wave.append(bar)}});

// November introductory offer ends at midnight in the Netherlands (CET).
const introductoryOfferEndsAt = Date.parse('2026-12-01T00:00:00+01:00');
function refreshSongPrice() {
  if (Date.now() < introductoryOfferEndsAt) return;
  const price = document.getElementById('song-price');
  if (!price) return;
  price.textContent = '€ 15,00';
  document.getElementById('offer-label').textContent = 'PERSOONLIJK LIED OP MAAT';
  document.getElementById('offer-details').textContent = 'Een persoonlijk lied, inclusief songtekst.';
}
refreshSongPrice();
setInterval(refreshSongPrice, 60000);
document.addEventListener('visibilitychange', refreshSongPrice);
