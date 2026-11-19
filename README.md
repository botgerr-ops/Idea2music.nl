# Idea2Music

Standalone Dutch landing page for idea2music.nl. Static HTML, CSS and JavaScript.

## Cloudflare Pages

- Repository: botgerr-ops/Idea2music.nl
- Production branch: main
- Framework preset: None
- Build command: leave empty
- Build output directory: .

Connect the GitHub repository to a new Cloudflare Pages project. Verify the assigned pages.dev URL before changing Hostnet DNS. Add www.idea2music.nl in Pages before pointing the Hostnet CNAME to the exact assigned pages.dev hostname. The apex domain is a separate setup step. Preserve Hostnet mail DNS.

The homepage features the brand introduction audio and three separate, self-hosted 45-second demo excerpts. Full-length examples are not stored in the public repository. The standalone ChatGPT Sites concept is not the production website and must not be linked as the origin.

The landing page has an order CTA and a separately controlled Cloudflare Pages checkout. The public `/api/config` endpoint reports whether the deployed runtime is configured and enabled. Never assume a complete real payment was successful based on this status alone.


## Bestellen en Mollie
De checkout staat voorbereid in `bestellen.html` met Pages Functions en D1. Zie `SETUP.md` voor activatie, testbetalingen en operationele grenzen. Zonder runtimeconfiguratie worden geen bestellingen of betalingen aangenomen. `npm test` voert geïsoleerde tests met gesimuleerde betaal- en e-mailproviders uit.
