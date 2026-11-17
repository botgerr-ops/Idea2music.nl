// Read-only owner dashboard. No order/customer data is returned without a strong
// deployment secret; this endpoint has no dependency on the checkout switch.
const json = (data, status = 200) => Response.json(data, {
  status,
  headers: {
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  },
});

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function onRequestGet({ request, env }) {
  const expected = env.ADMIN_DASHBOARD_TOKEN;
  if (!env.ORDERS_DB || typeof expected !== 'string' || expected.length < 32 || expected.length > 256) {
    return json({ message: 'Beheerdashboard is nog niet geactiveerd.' }, 503);
  }

  const authorization = request.headers.get('Authorization') || '';
  const given = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!timingSafeEqual(given, expected)) {
    return json({ message: 'Onjuiste beheercode.' }, 401);
  }

  const url = new URL(request.url);
  const days = [7, 30, 90].includes(Number(url.searchParams.get('days')))
    ? Number(url.searchParams.get('days')) : 30;
  const start = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    const totals = await env.ORDERS_DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM orders WHERE created_at >= ?) AS started,
        (SELECT COUNT(*) FROM orders WHERE payment_status = 'paid' AND paid_at >= ?) AS paid,
        (SELECT COALESCE(SUM(amount_cents), 0) FROM orders WHERE payment_status = 'paid' AND paid_at >= ?) AS paid_cents,
        (SELECT COUNT(*) FROM orders WHERE created_at >= ? AND payment_status IN ('open','pending','authorized')) AS awaiting,
        (SELECT COUNT(*) FROM orders WHERE cancellation_requested_at >= ?) AS cancellation_requests
    `).bind(start, start, start, start, start).first();

    const recent = await env.ORDERS_DB.prepare(`
      SELECT id, created_at, payment_status, amount_cents, cancellation_requested_at
      FROM orders ORDER BY created_at DESC LIMIT 12
    `).all();

    return json({
      days,
      generatedAt: new Date().toISOString(),
      testMode: String(env.MOLLIE_API_KEY || '').startsWith('test_'),
      totals: {
        started: Number(totals.started),
        paid: Number(totals.paid),
        paidCents: Number(totals.paid_cents),
        awaiting: Number(totals.awaiting),
        cancellationRequests: Number(totals.cancellation_requests),
      },
      recentOrders: recent.results.map(row => ({
        // Short internal display identifier; the authoritative ID is unchanged.
        ref: `I2M-${row.id.slice(0, 8).toUpperCase()}`,
        createdAt: row.created_at,
        status: row.payment_status,
        amountCents: Number(row.amount_cents),
        cancellationRequested: Boolean(row.cancellation_requested_at),
      })),
    });
  } catch {
    // Never expose SQL, database content, or runtime credentials.
    return json({ message: 'De cijfers zijn tijdelijk niet beschikbaar.' }, 503);
  }
}
