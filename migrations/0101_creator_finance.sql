-- Atomic finance controls; no transfer is initiated by this schema.
CREATE TABLE IF NOT EXISTS creator_payout_adjustments (
 payout_id TEXT NOT NULL REFERENCES creator_payouts(id),
 adjustment_id TEXT NOT NULL UNIQUE REFERENCES creator_adjustments(id),
 PRIMARY KEY(payout_id,adjustment_id)
);
CREATE TABLE IF NOT EXISTS creator_payout_receipts (
 payout_id TEXT PRIMARY KEY REFERENCES creator_payouts(id),
 bank_amount_cents INTEGER NOT NULL CHECK(bank_amount_cents>0),
 recorded_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS creator_one_open_payout ON creator_payouts(partner_id) WHERE status IN ('draft','approved');
CREATE UNIQUE INDEX IF NOT EXISTS creator_one_order_reversal ON creator_adjustments(order_id);
CREATE TRIGGER IF NOT EXISTS creator_payout_item_guard BEFORE INSERT ON creator_payout_items BEGIN
 SELECT CASE WHEN NOT EXISTS(
 SELECT 1 FROM creator_payouts v JOIN creator_order_attribution a ON a.partner_id=v.partner_id
 JOIN creator_commissions c ON c.order_id=a.order_id JOIN orders o ON o.id=c.order_id
 WHERE v.id=NEW.payout_id AND v.status='draft' AND c.order_id=NEW.order_id AND c.status='approved'
 AND c.amount_cents=NEW.amount_cents AND o.payment_status='paid' AND o.cancellation_requested_at IS NULL
 AND c.updated_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 minutes')
 AND substr(c.approved_at,1,10)<=v.period_end) THEN RAISE(ABORT,'ineligible payout item') END;
END;
CREATE TRIGGER IF NOT EXISTS creator_payout_item_reserve AFTER INSERT ON creator_payout_items BEGIN
 UPDATE creator_commissions SET status='reserved' WHERE order_id=NEW.order_id;
END;
CREATE TRIGGER IF NOT EXISTS creator_payout_adjustment_guard BEFORE INSERT ON creator_payout_adjustments BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM creator_payouts v JOIN creator_adjustments x ON x.id=NEW.adjustment_id
 JOIN creator_order_attribution a ON a.order_id=x.order_id WHERE v.id=NEW.payout_id AND v.status='draft' AND a.partner_id=v.partner_id)
 THEN RAISE(ABORT,'invalid adjustment') END;
END;
CREATE TRIGGER IF NOT EXISTS creator_payout_approve_guard BEFORE UPDATE OF status ON creator_payouts WHEN NEW.status='approved' BEGIN
 SELECT CASE WHEN OLD.status<>'draft' OR NEW.net_cents<>(
 COALESCE((SELECT SUM(amount_cents) FROM creator_payout_items WHERE payout_id=NEW.id),0)+
 COALESCE((SELECT SUM(x.amount_cents) FROM creator_payout_adjustments i JOIN creator_adjustments x ON x.id=i.adjustment_id WHERE i.payout_id=NEW.id),0))
 OR EXISTS(SELECT 1 FROM creator_adjustments x JOIN creator_order_attribution a ON a.order_id=x.order_id
 WHERE a.partner_id=NEW.partner_id AND NOT EXISTS(SELECT 1 FROM creator_payout_adjustments i WHERE i.adjustment_id=x.id))
 THEN RAISE(ABORT,'payout totals or adjustments changed') END;
END;
CREATE TRIGGER IF NOT EXISTS creator_payout_paid_guard BEFORE UPDATE OF status ON creator_payouts WHEN NEW.status='paid' BEGIN
 SELECT CASE WHEN OLD.status<>'approved' OR NOT EXISTS(SELECT 1 FROM creator_payout_receipts WHERE payout_id=NEW.id)
 OR EXISTS(SELECT 1 FROM creator_payout_items i JOIN creator_commissions c ON c.order_id=i.order_id WHERE i.payout_id=NEW.id AND c.status<>'reserved')
 THEN RAISE(ABORT,'invalid paid transition') END;
END;
CREATE TRIGGER IF NOT EXISTS creator_payout_paid AFTER UPDATE OF status ON creator_payouts WHEN NEW.status='paid' BEGIN
 UPDATE creator_commissions SET status='paid',updated_at=NEW.paid_at WHERE order_id IN (SELECT order_id FROM creator_payout_items WHERE payout_id=NEW.id);
END;
CREATE TRIGGER IF NOT EXISTS creator_payout_void_guard BEFORE UPDATE OF status ON creator_payouts WHEN NEW.status='void' BEGIN
 SELECT CASE WHEN OLD.status NOT IN ('draft','approved') OR EXISTS(SELECT 1 FROM creator_payout_receipts WHERE payout_id=NEW.id)
 THEN RAISE(ABORT,'cannot void paid payout') END;
END;
CREATE TRIGGER IF NOT EXISTS creator_payout_void AFTER UPDATE OF status ON creator_payouts WHEN NEW.status='void' BEGIN
 UPDATE creator_commissions SET status='approved' WHERE status='reserved' AND order_id IN (SELECT order_id FROM creator_payout_items WHERE payout_id=NEW.id);
 DELETE FROM creator_payout_items WHERE payout_id=NEW.id;
 DELETE FROM creator_payout_adjustments WHERE payout_id=NEW.id;
END;
