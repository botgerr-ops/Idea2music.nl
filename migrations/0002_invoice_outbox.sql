-- One irreversible invoice attempt per paid order. A network timeout is NOT retried
-- automatically: the invoice might already exist in e-Boekhouden.
CREATE TABLE IF NOT EXISTS invoice_outbox (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','sent','review')),
 started_at TEXT,
 finished_at TEXT,
 invoice_id INTEGER,
 invoice_number TEXT,
 error_code TEXT
);
