import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const pages = [
  ['index.html', 'https://www.idea2music.nl/'],
  ['voorbeelden.html', 'https://www.idea2music.nl/voorbeelden'],
  ['zo-werkt-het.html', 'https://www.idea2music.nl/zo-werkt-het'],
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

test('homepage uses the current offer and an honest audio preview', () => {
  const home = read('index.html');
  const checkout = read('bestellen.html');
  const script = read('app.js');
  assert.match(home, /Sommige verhalen verdienen een <em>eigen lied\.<\/em>/);
  assert.match(home, /Maak jouw lied voor <span data-cta-price>€ 7,50<\/span>/);
  assert.match(script, /querySelectorAll\('\[data-cta-price\]'\)/);
  assert.match(home, /Ons introductielied, gemaakt voor ons eigen verhaal/);
  assert.doesNotMatch(home, /wat je juist niet in het lied wilt/i);
  assert.match(checkout, /id="order-progress"/);
});

test('the three public listening samples use real, locally hosted audio files', () => {
  const home = read('index.html');
  const examples = read('voorbeelden.html');
  assert.match(home, /href="voorbeelden\.html"/);
  for (const [title, file] of [
    ['De laatste trein', 'de-laatste-trein-fragment.mp3'],
    ['Vandaag is van jou', 'vandaag-is-van-jou-fragment.mp3'],
    ['Ik hoor je nog', 'ik-hoor-je-nog-fragment.mp3']
  ]) {
    assert.ok(examples.includes(`<h2>${title}</h2>`), title);
    assert.ok(examples.includes(`<source src="assets/${file}" type="audio/mpeg">`), file);
    const size = statSync(new URL(`../assets/${file}`, import.meta.url)).size;
    assert.ok(size > 100_000 && size < 1_500_000, `${file} should be a short excerpt`);
  }
  assert.match(examples, /luisterfragmenten van 45 seconden · muziek en zang gemaakt met AI/);
  for (const fullFile of ['de-laatste-trein.mp3', 'vandaag-is-van-jou.mp3', 'ik-hoor-je-nog.mp3']) {
    assert.equal(existsSync(new URL(`../assets/${fullFile}`, import.meta.url)), false, `${fullFile} must stay private`);
  }
});

test('homepage is short and links to dedicated listening and explanation pages', () => {
  const home = read('index.html');
  const css = read('studio.css');
  assert.match(home, /<body class="studio-home/);
  assert.match(home, /<link rel="stylesheet" href="studio\.css">/);
  assert.doesNotMatch(home, /src="assets\/music-gift\.svg"/);
  assert.match(css, /\.studio-home/);
  assert.ok(home.length < 11_000, 'Homepage should no longer be a giant landing page');
  for (const target of ['voorbeelden.html', 'zo-werkt-het.html', 'bestellen.html']) {
    assert.ok(home.includes(`href="${target}"`), target);
  }
  for (const name of ['studio', 'process', 'train', 'birthday', 'memory']) {
    const asset = `photo-${name}.jpg`;
    assert.ok(statSync(new URL(`../assets/${asset}`, import.meta.url)).size > 20_000, asset);
    assert.match(home + read('voorbeelden.html') + read('zo-werkt-het.html'), new RegExp(`assets/${asset}`));
  }
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
