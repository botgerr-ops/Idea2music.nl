-- One-off billing data for a paid legacy order. Store personal data in D1,
-- never in source control; do not alter the original checkout payload.
CREATE TABLE IF NOT EXISTS invoice_test_billing (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 street TEXT NOT NULL,
 number TEXT NOT NULL,
 postal_code TEXT NOT NULL,
 city TEXT NOT NULL,
 country TEXT NOT NULL
);
