import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const pages = [
  ['index.html', 'https://www.idea2music.nl/'],
  ['persoonlijk-lied-laten-maken.html', 'https://www.idea2music.nl/persoonlijk-lied-laten-maken'],
  ['verjaardagslied-laten-maken.html', 'https://www.idea2music.nl/verjaardagslied-laten-maken'],
  ['liefdeslied-laten-maken.html', 'https://www.idea2music.nl/liefdeslied-laten-maken']
];

test('each public page has one canonical URL and share metadata', () => {
  for (const [file, canonical] of pages) {
    const html = read(file);
    assert.match(html, /<html lang="nl">/);
    assert.match(html, /<h1[\s>]/);
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1, file);
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`), file);
    assert.ok(html.includes(`<meta property="og:url" content="${canonical}">`), file);
    assert.match(html, /<meta property="og:image" content="https:\/\/www\.idea2music\.nl\/assets\/i2m-logo\.png">/);
  }
});

test('home has valid organization and website structured data', () => {
  const html = read('index.html');
  const payload = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(payload, 'homepage JSON-LD is missing');
  const json = JSON.parse(payload[1]);
  assert.deepEqual(json['@graph'].map(item => item['@type']), ['Organization', 'WebSite']);
  assert.equal(json['@graph'][0].name, 'Idea2Music');
});

test('homepage explains manual quality control and has an honest audio preview', () => {
  const home = read('index.html');
  const checkout = read('bestellen.html');
  const script = read('app.js');
  assert.match(home, /Sommige verhalen verdienen een <em>eigen lied\.<\/em>/);
  assert.match(home, /Maak jouw lied voor <span data-cta-price>€ 7,50<\/span>/);
  assert.match(script, /querySelectorAll\('\[data-cta-price\]'\)/);
  assert.match(home, /Ons introductielied, gemaakt voor ons eigen verhaal/);
  assert.match(home, /Wij maken en controleren jouw lied/);
  assert.match(home, /Je ontvangt één persoonlijk lied met de songtekst digitaal per e-mail/);
  assert.doesNotMatch(home, /wat je juist niet in het lied wilt/i);
  assert.match(checkout, /id="order-progress"/);
});

test('sitemap lists just the canonical indexable pages', () => {
  const xml = read('sitemap.xml');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(urls, pages.map(([, canonical]) => canonical));
  assert.match(xml, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  assert.match(read('robots.txt'), /Sitemap: https:\/\/www\.idea2music\.nl\/sitemap\.xml/);
});

test('checkout and order management pages stay out of search results', () => {
  const headers = read('_headers');
  for (const route of ['bestellen', 'bestelling', 'annuleren']) {
    assert.ok(headers.includes(`/${route}\n  X-Robots-Tag: noindex`));
    assert.ok(headers.includes(`/${route}.html\n  X-Robots-Tag: noindex`));
  }
  assert.match(read('bestelling.html'), /<meta name="robots" content="noindex">/);
});

test('landing pages link directly to the original checkout without changing its code', () => {
  for (const [file] of pages.slice(1)) {
    const html = read(file);
    assert.match(html, /href="bestellen\.html"/);
    assert.match(html, /Muziek en zang gemaakt met AI/);
  }
});
