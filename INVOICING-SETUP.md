# Idea2Music – e-Boekhouden facturen (voorbereid, UIT)

De koppeling gebruikt de officiële e-Boekhouden REST API.
Er worden **geen facturen aangemaakt** totdat de beheerder bewust `EBOEKHOUDEN_INVOICING_ENABLED=true` zet.

## Benodigde Cloudflare Pages-variabelen (Production)

| Variabele | Waarde |
| --- | --- |
| `EBOEKHOUDEN_API_TOKEN` | Bestaand geheim; **nooit** delen of in git zetten |
| `EBOEKHOUDEN_INVOICING_ENABLED` | **Niet instellen / `false`** totdat de controle hieronder klaar is |

De code haalt de IDs zelf op via de read-only endpoints `GET /v1/invoicetemplate` en `GET /v1/ledger`, met de tijdelijke sessietoken uit `POST /v1/session`. De koppeling staat alleen het exact benoemde sjabloon `Idea2Music` en grootboekcode `8050` toe. Ontbreekt een van beide, of zijn er meerdere treffers, dan wordt **geen** factuur verzonden en wordt handmatige controle vereist. De naam/code zijn op 17 november 2026 in e-Boekhouden door Robin bevestigd.

## Vóór activeren

1. Voeg `migrations/0002_invoice_outbox.sql` toe aan de productie-D1-database **ORDERS_DB**.
2. Controleer de 21%-btw-code voor dit product, óók bij bestellingen buiten Nederland. De huidige bouw gaat uit van een Nederlandse binnenlandse verkoop; internationale fiscale behandeling moet eerst worden uitgewerkt.
3. Controleer in e-Boekhouden de afzender, factuurlay-out, factuurmail en de betekenis van `termOfPayment: 0` en 'reeds betaald'.
4. Doe één gecontroleerde **echte** proefbetaling na expliciete toestemming, controleer **één** factuur, **één** factuurmail en de geldige factuurnummerreeks.
5. Verifieer afzonderlijk dat de Mollie-uitbetaling en eventuele kosten correct worden geboekt. 'Reeds betaald' op een factuur **boekt de bankontvangst niet vanzelf af**.
6. Pas daarna de activeringsvariabele op `true` zetten en productie opnieuw deployen.

De factuur wordt alleen geprobeerd na een door Mollie als `paid` geverifieerde **live** betaling. Testbetalingen maken nooit facturen aan. Voor bestellingen met een factuuradres buiten Nederland wordt voorlopig **geen** automatische factuur gemaakt: deze orders komen in `review` (`ebookhouden_foreign_invoice_review`) totdat de internationale btw-behandeling is ingericht. De bestaande checkout kan deze bestellingen nog steeds ontvangen; zorg dus voor handmatige opvolging van deze review-rijen. Per bestelling is er maximaal één automatische poging. Als de verbinding na een factuurverzoek wegvalt, blijft de rij `review`; vóór handmatige afhandeling **eerst** in e-Boekhouden zoeken naar `I2M-<bestel-id>` (referentie), zodat geen dubbele factuur kan ontstaan. Herstel nooit automatisch met een tweede POST.

Noot: e-Boekhouden kent geen idempotency-key op `POST /v1/invoice`. Daarom ontbreekt opzettelijk een automatische retry en wordt niet zonder bevestiging gefactureerd.

API-specificatie: https://api.e-boekhouden.nl/openapi/v1.json
