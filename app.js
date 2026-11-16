const introductoryOfferEndsAt = Date.parse('2026-12-01T00:00:00+01:00');
function refreshSongPrice() {
  const introductory = Date.now() < introductoryOfferEndsAt;
  document.getElementById('song-price').textContent = introductory ? '€ 7,50' : '€ 15,00';
  document.querySelectorAll('[data-price-copy]').forEach(el => { el.textContent = introductory ? '€ 7,50' : '€ 15,00'; });
  document.querySelectorAll('[data-promo-only]').forEach(el => { el.hidden = !introductory; });
  document.getElementById('offer-label').textContent = introductory ? 'Een persoonlijk lied met 50% introductiekorting' : 'Jouw verhaal, persoonlijk op muziek';
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
