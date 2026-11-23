const introductoryOfferEndsAt = Date.parse('2026-12-01T00:00:00+01:00');
const sinterklaasCampaignEndsAt = Date.parse('2026-12-06T00:00:00+01:00');
function refreshSongPrice() {
  const introductory = Date.now() < introductoryOfferEndsAt;
  const isSinterklaasSeason = Date.now() < sinterklaasCampaignEndsAt;
  document.getElementById('song-price').textContent = introductory ? '€ 7,50' : '€ 15,00';
  document.querySelectorAll('[data-price-copy]').forEach(el => { el.textContent = introductory ? '€ 7,50' : '€ 15,00'; });
  document.querySelectorAll('[data-cta-price]').forEach(el => { el.textContent = introductory ? '€ 7,50' : '€ 15,00'; });
  document.querySelectorAll('[data-promo-only]').forEach(el => { el.hidden = !introductory; });
  document.getElementById('offer-label').textContent = introductory
    ? 'Sinterklaasactie: een persoonlijk lied voor € 7,50'
    : (isSinterklaasSeason ? 'Een persoonlijk lied cadeau voor Sinterklaas' : 'Jouw verhaal, persoonlijk op muziek');
  const heroIntro = document.querySelector('.hero-intro');
  if (heroIntro) heroIntro.textContent = isSinterklaasSeason
    ? 'Op zoek naar een origineel Sinterklaascadeau? Laat een persoonlijk lied maken met herkenbare namen, herinneringen en grappige gewoontes. Ook voor verjaardagen en andere bijzondere momenten.'
    : 'Van een bijzondere verjaardag tot een herinnering die je nooit wilt vergeten. Jouw verhaal wordt een lied dat écht iets zegt.';
  document.getElementById('offer-details').textContent = introductory ? 'T/m 30 november 2026. Vanaf 1 december € 15,00 inclusief btw.' : 'Eén persoonlijk lied met songtekst, digitaal bezorgd.';
}
refreshSongPrice();
setInterval(refreshSongPrice, 60000);
document.addEventListener('visibilitychange', refreshSongPrice);

const availability = document.querySelector('.availability');
fetch('/api/config', {cache:'no-store', signal:AbortSignal.timeout(8000)})
  .then(r => { if (!r.ok) throw new Error('config'); return r.json(); })
  .then(config => {
    if (config?.enabled) {
      document.querySelectorAll('[data-order-link]').forEach(link => { link.href = 'bestellen.html'; });
      availability.textContent = config.test ? 'Bestellen is beschikbaar in de testomgeving.' : 'Vul de vragenlijst in en reken veilig af via Mollie.';
    } else {
      availability.textContent = 'Online bestellen is nog niet geopend. Bekijk gerust de vragenlijst, of mail naar info@narrowvision.eu.';
    }
  })
  .catch(() => { availability.textContent = 'De bestelstatus is nu niet bereikbaar. Bekijk de vragenlijst of mail naar info@narrowvision.eu.'; });

const audio = document.querySelector('audio');
audio.addEventListener('error', () => { document.querySelector('.audio-feedback').hidden = false; });
audio.querySelector('source').addEventListener('error', () => { document.querySelector('.audio-feedback').hidden = false; });

// A new sample should stop the previous one, especially on mobile.
const players = [...document.querySelectorAll('audio')];
players.forEach(player => player.addEventListener('play', () => {
  players.forEach(other => { if (other !== player && !other.paused) other.pause(); });
}));
