# Idea2Music invoice rollout

The e-Boekhouden integration creates **real** invoices and can email customers.
There is no accounting sandbox. Do not enable the new-orders mode without an
explicit cutover decision and a successful production deployment.

## Production variables (Cloudflare Pages)

- `EBOEKHOUDEN_INVOICING_ENABLED=true`: overall switch (already used by the pilot).
- `EBOEKHOUDEN_INVOICING_MODE`: absent or `pilot` means the existing single-order
  pilot. Set to exactly `new-orders` to permit future orders.
- `EBOEKHOUDEN_NEW_ORDERS_FROM`: required for `new-orders`; an explicit UTC
  timestamp in the form `YYYY-MM-DDTHH:mm:ss.sssZ`. Choose a future time at
  cutover. Orders **created earlier** can never be invoiced automatically in
  this mode even when their Mollie webhooks arrive afterward.
- `EBOEKHOUDEN_TEST_ORDER_ID`: retained for pilot mode; ignored in new-orders.

Any missing or invalid setting fails closed. A feature change requires a new
Cloudflare Pages production deployment. Confirm the exact Git commit and
deployment success before cutover.

## Invariants and review

- Only server-verified `paid` Mollie payments can lead to invoicing.
- `invoice_outbox` is the one-shot idempotency gate. `sent` and `review` rows
  cannot be retried automatically. Never reset review state without checking
  the corresponding invoice in e-Boekhouden first.
- Non-Dutch billing countries are intentionally sent to manual review pending
  tax treatment validation.
- Invoice creation and email delivery do **not** automatically reconcile Mollie
  receipts, fees, refunds, or the e-Boekhouden sales mutation. Those remain in
  the agreed weekly manual accounting workflow.
- Rolling back to pilot: set `EBOEKHOUDEN_INVOICING_MODE=pilot` (or disable the
  global switch), then redeploy; do not delete invoices or outbox records.

