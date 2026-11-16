import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../tracking.js', import.meta.url), 'utf8');

function browser({ choice = null, pathname = '/' } = {}) {
  const local = new Map();
  const session = new Map();
  if (choice) local.set('idea2music-meta-consent-v1', JSON.stringify({ choice, at: Date.now() }));
  const scripts = [];
  const before = { parentNode: { insertBefore(script) { scripts.push(script); } } };
  const document = {
    readyState: 'loading',
    addEventListener() {},
    getElementsByTagName() { return [before]; },
    createElement() { return {}; }
  };
  const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) });
  const window = {};
  const location = { pathname };
  vm.runInNewContext(source, { window, document, location, localStorage: storage(local), sessionStorage: storage(session), Date, Number });
  return { window, scripts, session };
}

function events(window) {
  return Array.from(window.fbq?.queue ?? []).map(event => [event[0], event[1], event[2]]);
}

test('no Pixel scripts or events without consent, even during a checkout', () => {
  const app = browser();
  app.window.I2MTracking.trackInitiateCheckout(750);
  app.window.I2MTracking.trackPurchase('0abc1234', 750);
  assert.equal(app.scripts.length, 0);
  assert.equal(app.window.fbq, undefined);
});

test('refused marketing consent never loads the Meta script', () => {
  const app = browser({ choice: 'no' });
  app.window.I2MTracking.trackInitiateCheckout(750);
  app.window.I2MTracking.trackPurchase('0abc1234', 750);
  assert.equal(app.scripts.length, 0);
});

test('accepted consent loads Meta once and tracks a normal pageview', () => {
  const app = browser({ choice: 'yes' });
  assert.equal(app.scripts.length, 1);
  assert.equal(app.scripts[0].src, 'https://connect.facebook.net/en_US/fbevents.js');
  assert.deepEqual(events(app.window).map(event => event[1]), ['autoConfig', '1189104470107229', 'PageView']);
  app.window.I2MTracking.trackInitiateCheckout(750);
  assert.equal(app.scripts.length, 1);
  assert.ok(events(app.window).some(event => event[1] === 'InitiateCheckout'));
});

test('order-status page never fires PageView and tracks only verified paid orders once', () => {
  const app = browser({ choice: 'yes', pathname: '/bestelling.html' });
  assert.equal(app.scripts.length, 0);
  app.window.I2MTracking.trackPurchase('0abc1234', 750, true);
  assert.equal(app.scripts.length, 0, 'test-mode payments must not be counted');
  app.window.I2MTracking.trackPurchase('0abc1234', 750, false);
  assert.equal(app.scripts.length, 1);
  assert.equal(events(app.window).filter(event => event[1] === 'PageView').length, 0);
  assert.equal(events(app.window).filter(event => event[1] === 'Purchase').length, 1);
  assert.equal(events(app.window).find(event => event[1] === 'Purchase')[2].value, 7.5);
  app.window.I2MTracking.trackPurchase('0abc1234', 750, false);
  assert.equal(events(app.window).filter(event => event[1] === 'Purchase').length, 1);
});

test('cancellation page never triggers Meta requests', () => {
  const app = browser({ choice: 'yes', pathname: '/annuleren.html' });
  assert.equal(app.scripts.length, 0);
});

test('cookie choices are equally available; refusal does not contact Meta', () => {
  const scripts = [];
  let banner = null;
  const firstScript = { parentNode: { insertBefore(el) { scripts.push(el); } } };
  function el(tag) {
    return {
      tag, children: [], listeners: {},
      setAttribute() {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      append(...children) { this.children.push(...children); },
      remove() { banner = null; }
    };
  }
  const document = {
    readyState: 'complete',
    addEventListener() {},
    getElementById(id) { return id === 'i2m-consent' ? banner : null; },
    getElementsByTagName() { return [firstScript]; },
    createElement: el,
    body: { append(node) { banner = node; } }
  };
  const local = new Map();
  const window = {};
  const storage = { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, value) };
  vm.runInNewContext(source, { window, document, location: { pathname: '/' }, localStorage: storage, sessionStorage: storage, Date, Number });
  assert.ok(banner);
  const actions = banner.children.at(-1);
  const [refuse, accept] = actions.children;
  assert.equal(refuse.textContent, 'Niet toestaan');
  assert.equal(accept.textContent, 'Marketing toestaan');
  refuse.listeners.click();
  assert.equal(scripts.length, 0);
  assert.equal(JSON.parse(local.get('idea2music-meta-consent-v1')).choice, 'no');
});
