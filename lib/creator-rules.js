import { priceAt, PROMO_END } from './order-rules.js';

export const CREATOR_TERMS_VERSION = 'creator-pilot-v1';
export const MIN_PAYOUT_CENTS = 2000;
export const HOLD_MS = 14 * 24 * 60 * 60 * 1000;

export function normalizeCreatorCode(input) {
 if (typeof input !== 'string') return null;
 const code = input.trim().toUpperCase();
 return /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code) ? code : null;
}

// A record must come from a trusted server-side DB lookup, never the request body.
export function creatorQuote({code, record, now = Date.now(), enabled = false} = {}) {
 const baseCents = priceAt(now);
 const regular = {amountCents:baseCents, attribution:null};
 if (code == null || code === '') return regular;
 if (!enabled) return {...regular, error:'Partnercodes zijn nog niet beschikbaar.'};
 if (now < PROMO_END) return {...regular, error:'Partnerkorting is niet combineerbaar met de introductieactie.'};
 const normalized = normalizeCreatorCode(code);
 const starts = Date.parse(record?.starts_at);
 const ends = record?.ends_at == null ? Infinity : Date.parse(record.ends_at);
 if (!normalized || normalized !== record?.code || record.active !== 1 ||
     record.partner_status !== 'active' || !record.partner_id ||
     !Number.isFinite(starts) || now < starts || !(now < ends) ||
     record.discount_bps !== 1000 || ![200,300].includes(record.commission_cents))
   return {...regular, error:'Deze partnercode is niet geldig.'};
 const amountCents = baseCents - Math.round(baseCents * record.discount_bps / 10000);
 return {amountCents, attribution:{partnerId:record.partner_id, code:normalized,
  baseCents, discountBps:record.discount_bps, saleCents:amountCents,
  commissionCents:record.commission_cents}};
}

// Requires a fresh, server-verified payment/refund/chargeback snapshot.
// Unknown financial states deliberately fail closed.
export function commissionDecision({verifiedPayment, deliveredAt, cancellationRequested,
 ownOrder, reviewApproved, now = Date.now()} = {}) {
 if (!verifiedPayment || verifiedPayment.status !== 'paid') return 'pending';
 if (verifiedPayment.refunded === true || verifiedPayment.chargedBack === true ||
     cancellationRequested === true || ownOrder === true) return 'rejected';
 if (verifiedPayment.refunded !== false || verifiedPayment.chargedBack !== false ||
     cancellationRequested !== false || ownOrder !== false || reviewApproved !== true) return 'pending';
 const delivered = Date.parse(deliveredAt);
 if (!Number.isFinite(delivered) || delivered > now || now < delivered + HOLD_MS) return 'pending';
 return 'approved';
}
export function payoutEligible(netCents) {
 return Number.isSafeInteger(netCents) && netCents >= MIN_PAYOUT_CENTS;
}
