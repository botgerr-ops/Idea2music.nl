# Idea2Music ordering contract

Source: Robin's explicit conversation decisions, 14 November 2026.

- Registered trading name Idea2Music under NarrowVision; KVK 42203449, VAT NL005580746B56; contact info@narrowvision.eu.
- A single personally composed and checked AI song, with lyrics; no subscription.
- EUR 7.50 including VAT through 30 November 2026 inclusive; EUR 15.00 from 1 December, Europe/Amsterdam.
- Complete questionnaire then Mollie payment; only verified paid orders go to production.
- Target one working day from payment and complete questionnaire, with proactive communication during busy periods.
- Customer can request free cancellation before delivery. Statutory rights for digital content and faulty products remain applicable.
- AI production and delivery are performed manually by Robin. This change does not implement file delivery or automatic refunds.

## Contact- en factuurgegevens (17 november 2026)

- De aanvraag vraagt voortaan naast naam en e-mail ook een factuuradres: straat, huisnummer/toevoeging, postcode, woonplaats en land. Het lied wordt nog steeds uitsluitend per e-mail geleverd.
- Telefoonnummer, bedrijfsnaam en btw-nummer zijn optioneel. Telefoon alleen gebruiken voor vragen over de bestelling, niet voor marketing.
- Het factuuradres en de optionele gegevens worden via het bestaande gevalideerde formulier in de D1-order opgeslagen en lopen mee in het besteloverzicht en de transactionele e-mails. Er is geen nieuwe D1-migratie nodig.
- Dit voegt **nog geen PDF-factuur of koppeling met e-Boekhouden** toe. Voor oude orders zijn deze velden niet beschikbaar; toon nooit fictieve adressen.

## Integration contracts and release gates
- Mollie Payments API: amount, order metadata and test/live mode are verified server-side; an unauthenticated webhook only triggers an authenticated Mollie lookup.
- Payments API idempotency lasts one hour. A checkout attempt is resumable for at most 30 minutes; subsequent new attempt is explicit.
- D1 is the source of truth for orders, consents and email outbox. Missing D1, Mollie, Resend or CHECKOUT_ENABLED keeps checkout closed.
- Resend sends transaction confirmations and merchant orders. No marketing opt-in, marketing emails or visitor analytics.
- Requests to cancel are durably recorded, confirmed by email and processed by Robin; never claim a refund has occurred.
- Data retention specifics, vendor-processing arrangements and final privacy wording must be confirmed by Robin before activation. No collection in unconfigured preview.
- Full live test of payment, webhook, email receipt and cancellation remains required with deployed infrastructure. Automated tests use in-memory SQLite and mocked providers only.

## Legal source check, 14 November 2026
- https://www.acm.nl/nl/verkoop-aan-consumenten/klantenservice/bedenktijd : digital content waiver requires prior consent, confirmation and customer-initiated playback/download; online cancellation function applies from 25 June 2026.
- https://www.acm.nl/nl/verkoop-aan-consumenten/de-koop-sluiten/schriftelijk-bevestigen : durable confirmation after payment and consent before digital delivery.
- Do not send a song attachment as the mechanism that supposedly removes the cooling-off period. At delivery provide a customer-initiated playback/download flow after confirmation, or honor the remaining withdrawal period. That delivery flow is outside this checkout change.
