-- Additive migration. Apply to an isolated preview database first.
-- Existing orders and invoice tables are deliberately untouched.
CREATE TABLE IF NOT EXISTS creator_partners (
 id TEXT PRIMARY KEY NOT NULL,
 display_name TEXT NOT NULL,
 email TEXT NOT NULL COLLATE NOCASE UNIQUE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','suspended','closed')),
 agreement_version TEXT,
 agreement_accepted_at TEXT,
 created_at TEXT NOT NULL,
 CHECK(status <> 'active' OR (agreement_version IS NOT NULL AND agreement_accepted_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS creator_codes (
 code TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
 partner_id TEXT NOT NULL REFERENCES creator_partners(id),
 active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
 discount_bps INTEGER NOT NULL DEFAULT 1000 CHECK(discount_bps = 1000),
 commission_cents INTEGER NOT NULL DEFAULT 200 CHECK(commission_cents IN (200,300)),
 starts_at TEXT NOT NULL,
 ends_at TEXT,
 CHECK(length(code) BETWEEN 3 AND 32),
 CHECK(ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS creator_codes_partner_idx ON creator_codes(partner_id);
CREATE TABLE IF NOT EXISTS creator_order_attribution (
 order_id TEXT PRIMARY KEY NOT NULL REFERENCES orders(id),
 partner_id TEXT NOT NULL REFERENCES creator_partners(id),
 code TEXT NOT NULL REFERENCES creator_codes(code),
 base_cents INTEGER NOT NULL CHECK(base_cents = 1500),
 discount_bps INTEGER NOT NULL CHECK(discount_bps = 1000),
 sale_cents INTEGER NOT NULL CHECK(sale_cents = 1350),
 commission_cents INTEGER NOT NULL CHECK(commission_cents IN (200,300)),
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS creator_attribution_partner_idx ON creator_order_attribution(partner_id);
CREATE TABLE IF NOT EXISTS creator_commissions (
 order_id TEXT PRIMARY KEY NOT NULL REFERENCES creator_order_attribution(order_id),
 payment_id TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','reserved','paid','reversed')),
 amount_cents INTEGER NOT NULL CHECK(amount_cents IN (200,300)),
 paid_verified_at TEXT NOT NULL,
 delivered_at TEXT,
 eligible_at TEXT,
 approved_at TEXT,
 rejection_reason TEXT,
 updated_at TEXT NOT NULL,
 CHECK(status NOT IN ('approved','reserved','paid','reversed') OR (delivered_at IS NOT NULL AND eligible_at IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS creator_payouts (
 id TEXT PRIMARY KEY NOT NULL,
 partner_id TEXT NOT NULL REFERENCES creator_partners(id),
 period_start TEXT NOT NULL,
 period_end TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','paid','void')),
 net_cents INTEGER NOT NULL CHECK(net_cents >= 2000),
 invoice_reference TEXT,
 bank_reference TEXT UNIQUE,
 created_at TEXT NOT NULL,
 paid_at TEXT,
 CHECK(period_end >= period_start),
 CHECK(status <> 'paid' OR (bank_reference IS NOT NULL AND paid_at IS NOT NULL AND invoice_reference IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS creator_payout_items (
 payout_id TEXT NOT NULL REFERENCES creator_payouts(id),
 order_id TEXT NOT NULL UNIQUE REFERENCES creator_commissions(order_id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents IN (200,300)),
 PRIMARY KEY(payout_id,order_id)
);
-- Append-only adjustments for refunds/chargebacks after a payout.
-- An adjustment is not itself an automatic bank debit.
CREATE TABLE IF NOT EXISTS creator_adjustments (
 id TEXT PRIMARY KEY NOT NULL,
 order_id TEXT NOT NULL REFERENCES creator_commissions(order_id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents < 0),
 reason TEXT NOT NULL CHECK(reason IN ('refund','chargeback','manual_correction')),
 provider_event_ref TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS creator_audit (
 id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 created_at TEXT NOT NULL
);
