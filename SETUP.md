# Checkout activeren op bestaande Cloudflare Pages

Dit is een uitbreiding van botgerr-ops/Idea2music.nl voor het bestaande Pages-project idea2music-nl. Geen nieuwe hostingprovider. `main` blijft de productiebranch. De gebruiker heeft gekozen voor de live Mollie-sleutel; geen testomgeving of testbetaling aanmaken zonder nieuw verzoek. De activatieschakelaar blijft uit totdat de instellingen zijn gecontroleerd.

## Cloudflare
1. Maak één D1-database voor orders. Voer `migrations/0001_orders.sql` uit in de D1 Console. Voor bestaande productie-omgevingen: voer **vóór het deployen van de korte bestelnummers** `migrations/0002_order_numbers.sql` één keer uit op de bestaande D1-database. De migratie bewaart de UUID's, betalingen en oude bestelverwijzingen. Maak vooraf een D1-back-up.
2. Voeg een D1 binding toe aan Pages: naam `ORDERS_DB`. Kies de nieuwe database.
3. Configureer runtime secrets in Pages, niet in GitHub of de browser:
   - `MOLLIE_API_KEY`: de **live_** key van het Idea2Music-websiteprofiel.
   - `RESEND_API_KEY`: sending key voor het al geverifieerde domein narrowvision.eu.
4. Variabelen:
   - `MAIL_FROM`: `Idea2Music <info@narrowvision.eu>`
   - `PUBLIC_SITE_URL`: volledige HTTPS-origin zonder pad, voor preview de exacte previeworigin, voor productie `https://www.idea2music.nl`.
   - `CHECKOUT_ENABLED`: pas `true` na onderstaande controles. Zonder deze schakelaar worden geen orders aangenomen.
5. Deploy opnieuw na bindings/secrets. Pages bundelt de `/functions` map. Framework None, build command leeg, output `.` blijven geschikt. Gebruik Node 24 voor lokale tests, geen Node runtime in Pages Functions nodig.
6. Geef preview alleen een aparte testdatabase, testkey en juiste previeworigin. Kopieer productiegegevens en live keys niet naar previews. Zet preview variabelen zelf in het dashboard; deze horen niet in source control.

## Voor activatie
- Bevestig concrete bewaartermijnen en privacytekst, relevante verwerkersafspraken en de manier waarop je het lied gaat leveren. De huidige tekst is ter review; er is nog geen automatische opschoning of afspeel/downloadlevering.
- Gebruik bij levering een aparte klantactie voor download/afspelen na bevestiging van toestemming. Alleen een bestand mailen schakelt de wettelijke bedenktijd niet automatisch uit. Bewaar het moment waarop de klant download/afspelen start of respecteer de resterende bedenktijd.
- De automatische controles gebruiken alleen gesimuleerde providers en versturen geen echte e-mails of betalingen. Verifieer live betaalafhandeling met een door de gebruiker zelf uitgevoerde en goedgekeurde betaling; maak die niet zelfstandig aan.
- Ontvang klantbevestiging én opdrachtmail in echte inboxen. Controleer de ingestuurde gegevens, prijs en toestemmingen.
- Test annuleren: verzoek wordt opgeslagen, beide mails ontvangen. Robin stopt productie en verwerkt eventuele terugbetaling handmatig via Mollie.
- Controleer outbox regelmatig: `SELECT id,state,claimed_at FROM mail_outbox WHERE state != 'sent';`. Bij mailstoring geeft de webhook 503 zodat Mollie opnieuw aanbiedt. Na providerretryperiode moet je onopgeloste berichten zelf afhandelen; de database verliest de opdracht niet.
- Pas na controle productie binding, live key, exacte www-origin en `CHECKOUT_ENABLED=true` instellen. Laat de gebruiker een eventuele eerste echte betaling zelf doen en controleer daarna webhook en e-mails. Maak/verwijder geen externe abonnementen.

## Verificatie
`npm test` (Node 24+, SQLite geheugenadapter met de echte migratie; geen externe provider calls), `npm run check`.
Tests dekken prijsovergang, ongeldige data/toestemming, gesloten configuratie, origincheck, prijsmanipulatie, dubbele checkout, afscherming, betaalstatus, vervalste webhook, mailherstel en annulering.

## Operationele grenzen
- Geen automatische terugbetaling, productie/levering of bescherming van auteursrechten beloofd.
- Geen providergeheimen in HTML, JS, repository, logs of screenshots.
- Rate limits bewaren alleen een korte hash van IP/minuut; verlopen buckets worden bij gebruik opgeruimd. Orderretentie moet vóór livegang worden vastgesteld en uitgevoerd.
- Database back-ups, betaalreconciliatie, klachten, refundafhandeling en afleveren blijven bij de ondernemer.

## Configuratie controleren zonder betalingen
`GET /api/config` geeft alleen booleans voor database, sleutelvorm/aanwezigheid, afzender, site en activatieschakelaar. De databasecontrole leest nul klantregels en controleert de vereiste kolommen. De status van een betaalprovider of daadwerkelijke e-mailbezorging wordt hiermee niet bewezen. Geen geheimen of klantgegevens worden teruggestuurd.

## Kort bestelnummer en e-mails
- Het publieke bestelnummer is `I2M-000001`, `I2M-000002`, enz.; het interne order-ID blijft een UUID voor beveiliging, authenticatie, idempotentie en Mollie-metadata.
- Oude bestelreferenties in eerdere e-mails (`I2M-<UUID>`) blijven geaccepteerd in het annuleringsformulier.
- De klant- en opdrachtmails zijn overzichtelijker en krijgen een eenvoudige HTML-indeling én een leesbare tekstversie. De bestaande outbox blijft dubbele verzending beperken.
- Er wordt nog **geen fiscale factuur gegenereerd of aan e-Boekhouden geschreven**. Activeer automatische facturatie pas na verificatie van de juiste juridische factuurgegevens, factuurnummerreeks en e-Boekhouden-API-inrichting. Een Mollie-betaalbevestiging is geen vervanging van een fiscale factuur.

## Nog nodig voor e-Boekhouden en PDF-factuur
1. Bevestig de exacte statutaire bedrijfsnaam/handelsnaam, vestigingsadres, KVK en btw-identificatienummer voor de factuur. Controleer of de huidige afzendergegevens in de checkoutcode nog kloppen.
2. Maak in e-Boekhouden een **REST API-token** aan (niet de oude SOAP-codes) en zet het uitsluitend als Cloudflare Pages-secret, nooit in GitHub of de chat.
3. Kies/controleer een factuursjabloon en BTW-/omzetgrootboekinstellingen voor het product. Laat e-Boekhouden de officiële, doorlopende factuurnummers toekennen.
4. Bouw en test daarna afzonderlijk het aanmaken van de factuur uitsluitend na een geverifieerde, geslaagde Mollie-betaling. Gebruik een duurzame outbox/retry, bewaar de externe factuur-ID en voorkom dubbele facturen bij herhaalde webhooks. Alleen een bevestigde factuur mag als bijlage naar de klant worden gemaild.
5. Test deze boekhoudkoppeling eerst met een daarvoor bedoeld testaccount/boekhouding: de e-Boekhouden-API heeft geen veilige externe sandbox. Activeer pas daarna op productie. Controleer afzonderlijk terugbetalingen en eventuele creditfacturen.
