/* Idea2Music: optional Meta and Metricool tracking; never load either before explicit consent. */
(() => {
  'use strict';

  const PIXEL_ID = '1189104470107229';
  const METRICOOL_HASH = 'a267a32b21d013c46739e57056395474';
  // New consent key: previous Meta-only consent must not authorize Metricool.
  const CONSENT_KEY = 'idea2music-marketing-consent-v2';
  const CONSENT_MAX_AGE = 180 * 24 * 60 * 60 * 1000;
  const isOrderStatus = /\/bestelling(?:\.html)?\/?$/.test(location.pathname);
  const isCancellation = /\/annuleren(?:\.html)?\/?$/.test(location.pathname);
  const isCheckout = /\/bestellen(?:\.html)?\/?$/.test(location.pathname);
  let loaded = false;
  let metricoolLoaded = false;
  let pendingPurchase = null;

  function getChoice() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONSENT_KEY));
      if (saved && ['yes', 'no'].includes(saved.choice) &&
          Number.isFinite(saved.at) && Date.now() - saved.at < CONSENT_MAX_AGE &&
          Date.now() >= saved.at) return saved.choice;
    } catch { /* Private browsing and disabled storage are valid choices. */ }
    return null;
  }

  let choice = getChoice();

  function enablePixel() {
    if (choice !== 'yes' || loaded || isCancellation) return;
    loaded = true;
    // Meta's queue stub; the remote code is requested only after consent.
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ?
        n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = true; t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    // The order form can contain very personal stories: avoid automatic event discovery.
    window.fbq('set', 'autoConfig', false, PIXEL_ID);
    window.fbq('init', PIXEL_ID);
    // Do not emit a PageView on the status page (its return URL initially contains a token).
    if (!isOrderStatus) window.fbq('track', 'PageView');
  }

  function enableMetricool() {
    // Metricool records public marketing visits only; never send form, payment
    // status or cancellation URLs, where personal data or tokens might appear.
    if (choice !== 'yes' || metricoolLoaded || isCheckout || isOrderStatus || isCancellation) return;
    metricoolLoaded = true;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://tracker.metricool.com/resources/be.js';
    script.onload = () => {
      if (choice === 'yes' && typeof window.beTracker?.t === 'function') {
        window.beTracker.t({ hash: METRICOOL_HASH });
      }
    };
    script.onerror = () => { metricoolLoaded = false; };
    document.head.appendChild(script);
  }

  function amount(value) {
    return Number.isInteger(value) && value > 0 ? value / 100 : null;
  }

  function sendPurchase() {
    if (choice !== 'yes' || !pendingPurchase || isCancellation) return;
    const { orderId, value } = pendingPurchase;
    const key = `idea2music-purchase-tracked:${orderId}`;
    try { if (sessionStorage.getItem(key) === 'yes') return; } catch { /* Continue without deduplication. */ }
    enablePixel();
    if (typeof window.fbq !== 'function') return;
    window.fbq('track', 'Purchase', { currency: 'EUR', value });
    try { sessionStorage.setItem(key, 'yes'); } catch { /* Storage may be unavailable. */ }
    pendingPurchase = null;
  }

  function choose(newChoice) {
    const wasLoaded = loaded || metricoolLoaded;
    choice = newChoice;
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, at: Date.now() })); } catch { /* Respect the current in-memory choice. */ }
    document.getElementById('i2m-consent')?.remove();
    if (choice === 'yes') {
      if (!isOrderStatus) enablePixel();
      enableMetricool();
      sendPurchase();
    } else if (wasLoaded) {
      // Stop already-running Meta code immediately, then reload without loading it again.
      window.fbq?.('consent', 'revoke');
      location.reload();
    }
  }

  function showPreferences() {
    document.getElementById('i2m-consent')?.remove();
    const panel = document.createElement('aside');
    panel.id = 'i2m-consent';
    panel.className = 'i2m-cookie-panel';
    panel.setAttribute('aria-labelledby', 'i2m-consent-title');

    const title = document.createElement('h2');
    title.id = 'i2m-consent-title';
    title.textContent = 'Mogen we meten wat werkt?';
    const details = document.createElement('p');
    details.textContent = 'Met jouw toestemming gebruiken we de Meta Pixel voor advertentiemeting en Metricool voor bezoekstatistieken van openbare pagina’s. We sturen geen ingevulde verhalen of contactgegevens naar deze diensten. Je kunt weigeren en toch gewoon bestellen.';
    const privacy = document.createElement('a');
    privacy.href = '/bestellen.html#privacy';
    privacy.textContent = 'Lees de privacyinformatie';
    privacy.className = 'i2m-cookie-privacy';
    const controls = document.createElement('div');
    controls.className = 'i2m-cookie-actions';
    const refuse = document.createElement('button');
    refuse.type = 'button';
    refuse.textContent = 'Niet toestaan';
    refuse.className = 'i2m-cookie-button i2m-cookie-refuse';
    refuse.addEventListener('click', () => choose('no'));
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.textContent = 'Marketing en statistiek toestaan';
    accept.className = 'i2m-cookie-button i2m-cookie-accept';
    accept.addEventListener('click', () => choose('yes'));
    controls.append(refuse, accept);
    panel.append(title, details, privacy, controls);
    document.body.append(panel);
  }

  window.I2MTracking = Object.freeze({
    trackInitiateCheckout(amountCents) {
      if (choice !== 'yes' || amount(amountCents) === null) return;
      enablePixel();
      window.fbq('track', 'InitiateCheckout', { currency: 'EUR', value: amount(amountCents) });
    },
    trackPurchase(orderId, amountCents, testMode = false) {
      if (testMode || typeof orderId !== 'string' || !/^[A-Za-z0-9-]{8,80}$/.test(orderId)) return;
      const value = amount(amountCents);
      if (value === null) return;
      pendingPurchase = { orderId, value };
      sendPurchase();
    }
  });

  function setup() {
    document.addEventListener('click', event => {
      if (event.target.closest('[data-cookie-settings]')) {
        event.preventDefault();
        showPreferences();
      }
    });
    if (!choice) showPreferences();
  }

  if (choice === 'yes' && !isOrderStatus && !isCancellation) enablePixel();
  if (choice === 'yes') enableMetricool();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
})();
