CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY,
 token_hash TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 amount_cents INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 payment_id TEXT UNIQUE,
 checkout_url TEXT,
 payment_status TEXT NOT NULL DEFAULT 'open',
 paid_at TEXT,
 cancellation_requested_at TEXT,
 consent_version TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mail_outbox (
 id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL REFERENCES orders(id),
 body_json TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending',
 claimed_at INTEGER,
 sent_at TEXT,
 provider_id TEXT
);
CREATE TABLE IF NOT EXISTS rate_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
