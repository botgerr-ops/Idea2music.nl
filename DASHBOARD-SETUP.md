# Idea2Music beheerdashboard (optioneel, eerst voorbereiden)

Locatie: `/dashboard.html`. Deze publieke HTML-pagina bevat **geen** klantgegevens; alleen de apart beveiligde D1-route `/api/admin/stats` heeft data. Het dashboard is niet gekoppeld vanuit het publieke menu.

## Activatie in Cloudflare Pages

1. Controleer de laatste deploy en maak zo nodig een backup van de productie D1-database. De dashboardcode doet uitsluitend `SELECT` en vraagt **geen** migratie.
2. Open **Workers & Pages → idea2music-nl → Settings → Variables and Secrets** (Production).
3. Voeg **`ADMIN_DASHBOARD_TOKEN`** toe als **Secret**, met minimaal 32 onvoorspelbare tekens. Gebruik bijvoorbeeld een lokaal gegenereerde 48-byte random waarde; gebruik geen bestaand wachtwoord of API-sleutel. Deel deze waarde niet in GitHub, chat of screenshots.
4. Deploy de geteste PR naar productie. Zonder de secret blijft de admin-API met een `503` geblokkeerd.
5. Open `https://www.idea2music.nl/dashboard.html`, plak de code en controleer de cijfers. De code blijft alleen in het werkgeheugen van de geopende tab en verdwijnt bij vernieuwen/afmelden.

## Wat de getallen betekenen

- **Bestellingen gestart:** D1-orders aangemaakt in de geselecteerde periode.
- **Betalingen ontvangen:** D1-orders met `paid` en `paid_at` binnen de periode.
- **Geregistreerd betaald:** som van de brutobedragen van zulke orders, incl. btw, zonder Mollie-kosten of restituties af te trekken.
- **Nog niet betaald:** recente orders met status `open`, `pending` of `authorized`.
- **Annulering aangevraagd:** verzoeken die in de periode zijn vastgelegd; dit betekent **niet** dat er is terugbetaald.
- **Laatste aanvragen:** de 12 nieuwste orders, ongeacht periode. De getoonde 8 tekens zijn een verkorte interne weergave, **niet** het toekomstige officiële korte bestelnummer uit PR #3.
- **Bezoekers:** via de reeds actieve Cloudflare Web Analytics. Deze versie toont bewust geen verzonnen bezoekersaantallen of Worker-requests. Integratie van die API vraagt apart geconfigureerde Cloudflare-analyticsbevoegdheden.

Belangrijk: de huidige tabel bevat geen betrouwbare betaalmodus of restitutiehistorie per betaling. Als oude testbetalingen in dezelfde D1 staan, kunnen die de geregistreerde bruto-bedragen beïnvloeden. Gebruik dit **niet als boekhoudkundig omzetoverzicht**; verifieer bij Mollie/e-Boekhouden.

## Veilige release

- Geen wijzigingen aan checkout, webhook, betaalstatus of e-mailverzending.
- Geen persoonsgegevens of klantverhalen in API-respons, alleen geanonimiseerde lijstmetadata.
- Geen HTML-clientauth zonder serverauth: elke statsaanvraag vereist de geheime Bearer-code.
- Secret blijft server-side. `no-store`-respons; geen browseropslag voor de code; geen Meta- of Cloudflare-pixel op het dashboard.
- `npm test` en `npm run check` uitvoeren vóór merge. PR pas mergen als productie-`ADMIN_DASHBOARD_TOKEN` is gezet en tests slagen.
