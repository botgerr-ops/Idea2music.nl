# Idea2Music checkout behavior

Visual contract: DESIGN.md. Business and data policy: PRODUCT.md (conversation decisions, Mollie/ACM contracts and activation gates).

| Capability | Canonical owner | Source of truth | Variant | Verification |
| --- | --- | --- | --- | --- |
| Form | lib/order-rules.js + checkout.js | PRODUCT.md | questionnaire → review → Mollie | schema tests + narrow browser |
| Scrollbar | style.css + checkout.css | DESIGN.md | document scroll | browser |
| Feedback | inline live regions | PRODUCT.md | blocked, pending, error, paid | API + browser |
| Cancellation | cancel.js and /api/cancel | PRODUCT.md and ACM source | order ID + email, confirmation | API tests |
| Pricing | lib/order-rules.js, server authoritative | PRODUCT.md | introductory/regular | boundary + tamper tests |

No select/listbox, date picker, tables, dialogs, login or CRUD admin exists. Free-text music/sphere/language is intentional. Native checkboxes and details are canonical browser primitives.

- Review validates all questionnaire fields and focuses the first error. Back preserves every value.
- The optional personal prompts (memory, qualities, perspective, avoidTopics and voicePreference) are gathered in the first two steps and joined with labels into the existing `story` value on the client. The server accepts only the established fields; no D1 migration or new payment contract is involved. The combined story must stay within 4,000 characters. The review shows the resulting production brief.
- Final submit requires both explicit checkboxes; shows pending feedback and prevents duplicate submits. Retrying the same submitted payload reuses the same private attempt.
- Status access uses an unguessable bearer code. Only order reference, price, payment state and cancellation flag are returned; no questionnaire or email.
- Mollie redirect only starts a server lookup. Failed lookup never instructs customer to pay again.
- Payment confirmation and merchant notification are durable outbox messages. Source order is kept paid if email delivery fails. Mollie receives failure for retry. Monitor unresolved outbox entries before producing orders.
- Annulering acknowledges the request, not an automatic refund or assessment of rights. Nonmatching order/email does not expose existence; user is told to contact support if no confirmation arrives.
- Unsaved questionnaire is held in memory; a page-unload guard warns before loss. Safe navigation to Mollie is exempt. No persistent personal draft.
- Dutch controls and errors, EUR formatting, no date inputs or user-chosen timezone.
- Product/legal wording is staged for review and stays inactive until the explicit configuration gate is enabled.
