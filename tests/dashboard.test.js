import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequestGet } from '../functions/api/admin/stats.js';

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_orders.sql', import.meta.url), 'utf8'));
  const binding = {
    prepare(sql) {
      let params = [];
      return {
        bind(...args) { params = args; return this; },
        async first() { return db.prepare(sql).get(...params) || null; },
        async all() { return { results: db.prepare(sql).all(...params) }; },
      };
    },
  };
  const env = { ORDERS_DB: binding, ADMIN_DASHBOARD_TOKEN: 'g'.repeat(48), MOLLIE_API_KEY: 'live_example' };
  const request = (code, days = 30) => new Request(`https://www.idea2music.nl/api/admin/stats?days=${days}`, {
    headers: code === null ? {} : { Authorization: `Bearer ${code}` },
  });
  const call = (code = env.ADMIN_DASHBOARD_TOKEN, days = 30) => onRequestGet({ request: request(code, days), env });
  const order = ({ id, daysAgo = 1, status = 'open', paidDaysAgo, amount = 750, cancel = false }) => {
    const stamp = offset => new Date(Date.now() - offset * 86400000).toISOString();
    const createdAt = stamp(daysAgo);
    const paidAt = paidDaysAgo === undefined ? null : stamp(paidDaysAgo);
    db.prepare('INSERT INTO orders(id,token_hash,payload_hash,payload_json,amount_cents,created_at,payment_status,paid_at,cancellation_requested_at,consent_version) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, 'hash', 'hash', JSON.stringify({ name: 'Private Name', email: 'private@example.test', story: 'private story' }), amount, createdAt, status, paidAt, cancel ? stamp(.5) : null, 'v1');
  };
  return { db, env, call, order, close: () => db.close() };
}

test('owner endpoint is disabled until a long secret and D1 are present', async () => {
  const x = setup();
  try {
    delete x.env.ADMIN_DASHBOARD_TOKEN;
    assert.equal((await x.call(null)).status, 503);
    x.env.ADMIN_DASHBOARD_TOKEN = 'weak';
    assert.equal((await x.call('weak')).status, 503);
    x.env.ADMIN_DASHBOARD_TOKEN = 'secure-secret-that-is-at-least-32-bytes';
    delete x.env.ORDERS_DB;
    assert.equal((await x.call(x.env.ADMIN_DASHBOARD_TOKEN)).status, 503);
  } finally { x.close(); }
});

test('denies missing and invalid bearer tokens without returning order data', async () => {
  const x = setup();
  try {
    x.order({ id: crypto.randomUUID() });
    for (const token of [null, 'wrong', 'h'.repeat(48)]) {
      const response = await x.call(token);
      assert.equal(response.status, 401);
      const body = await response.text();
      assert.ok(!body.includes('private@example.test'));
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  } finally { x.close(); }
});

test('reports paid totals by payment date, requests by creation date, and no PII', async () => {
  const x = setup();
  try {
    x.order({ id: crypto.randomUUID(), daysAgo: 1, status: 'paid', paidDaysAgo: .5, amount: 750 });
    x.order({ id: crypto.randomUUID(), daysAgo: 1, status: 'open', amount: 1500 });
    x.order({ id: crypto.randomUUID(), daysAgo: 50, status: 'paid', paidDaysAgo: 2, amount: 1500 });
    x.order({ id: crypto.randomUUID(), daysAgo: 1, status: 'failed', cancel: true });
    const response = await x.call();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.totals, { started: 3, paid: 2, paidCents: 2250, awaiting: 1, cancellationRequests: 1 });
    assert.equal(body.recentOrders.length, 4);
    assert.ok(body.recentOrders.every(x => /^I2M-[A-Z0-9-]{8}$/.test(x.ref)));
    assert.ok(!JSON.stringify(body).includes('Private Name'));
    assert.ok(!JSON.stringify(body).includes('private story'));
    assert.ok(!JSON.stringify(body).includes('private@example.test'));
  } finally { x.close(); }
});

test('supports bounded periods and never gives SQL or credential errors', async () => {
  const x = setup();
  try {
    x.order({ id: crypto.randomUUID(), daysAgo: 15 });
    assert.equal((await (await x.call(undefined, 7)).json()).totals.started, 0);
    assert.equal((await (await x.call(undefined, 90)).json()).totals.started, 1);
    assert.equal((await (await x.call(undefined, 999)).json()).days, 30);
    x.env.MOLLIE_API_KEY = 'test_example';
    assert.equal((await (await x.call()).json()).testMode, true);
    x.db.exec('DROP TABLE orders');
    const response = await x.call();
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes('SQLITE_ERROR'));
  } finally { x.close(); }
});

test('dashboard never embeds analytics pixels or persists owner token to storage', () => {
  const html = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../dashboard.js', import.meta.url), 'utf8');
  assert.match(html, /name="robots" content="noindex/);
  assert.doesNotMatch(html, /data-cf-beacon|connect\.facebook/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|document\.cookie/);
  assert.match(js, /Authorization: `Bearer \$\{secret\}`/);
});
