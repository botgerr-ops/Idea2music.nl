# Idea2Music

Standalone Dutch landing page for idea2music.nl. Static HTML, CSS and JavaScript.

## Cloudflare Pages

- Repository: botgerr-ops/Idea2music.nl
- Production branch: main
- Framework preset: None
- Build command: leave empty
- Build output directory: .

Connect the GitHub repository to a new Cloudflare Pages project. Verify the assigned pages.dev URL before changing Hostnet DNS. Add www.idea2music.nl in Pages before pointing the Hostnet CNAME to the exact assigned pages.dev hostname. The apex domain is a separate setup step. Preserve Hostnet mail DNS.

This page has no order submission or payments. It displays an availability notice. The previous ChatGPT Sites concept is separate and must not be used as the production origin after migration.


## Bestellen en Mollie
De checkout staat voorbereid in `bestellen.html` met Pages Functions en D1. Zie `SETUP.md` voor activatie, testbetalingen en operationele grenzen. Zonder runtimeconfiguratie worden geen bestellingen of betalingen aangenomen. `npm test` voert geïsoleerde tests met gesimuleerde betaal- en e-mailproviders uit.
