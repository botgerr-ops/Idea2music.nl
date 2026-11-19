---
version: alpha
name: Idea2Music
description: Personal music gifts with warm cherry typography, a music envelope and a quiet paper questionnaire.
colors:
  primary: "#5b162b"
  berry: "#5b162b"
  ink: "#421d2b"
  muted: "#735962"
  paper: "#fff5e6"
  white: "#fffdfa"
  coral: "#e9544b"
  pink: "#f4bec4"
  yellow: "#ffc95c"
  sage: "#dce8ce"
  green: "#34563b"
  line: "#e5d2c5"
  danger: "#a42b3a"
typography:
  body:
    fontFamily: "DM Sans, Arial, sans-serif"
  display:
    fontFamily: "Bricolage, Arial Black, Arial, sans-serif"
rounded:
  DEFAULT: "12px"
  button: "100px"
spacing:
  form-padding: "35px"
  field-gap: "16px"
components:
  button:
    height: "57px"
    backgroundColor: "{colors.berry}"
    textColor: "{colors.paper}"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
---
# Idea2Music design

## Homepage visual revision — 19 November 2026

Robin rejected the illustrated gift-card and cartoon-demo treatment as too childish. The production homepage now has a restrained, music-studio-led presentation while retaining the approved I2M logo and all existing ordering behavior. `studio.css` is loaded on `index.html` only: deep teal ink (#12262a), cool paper (#f4f5f2), self-hosted DM Sans, orange sound accent (#ff7448) and crisp editorial panels. The hero uses an audio waveform generated from the real Idea2Music introduction track; the three demo covers use real waveforms generated from the approved 45-second MP3 excerpts. No fictional customers, AI-generated images, stock illustrations, or new services are introduced. Cartoon-style occasion art is hidden on the homepage. Checkout styles and the server code are deliberately untouched. Regenerate waveform assets with `node scripts/generate-waveforms.mjs` when replacing audio files.

## Overview
Robin approved an independent, warm gift-and-music identity on 16 November 2026 after finding the navy/lilac site too similar to NarrowVision. This deliberately replaces that visual identity across the landing page and questionnaire. Audience: Dutch consumers, primarily on phones. The job is choosing a thoughtful music gift, listening and starting the existing questionnaire.

Signature: a cherry/coral gift envelope with a personal music card and record. This is an illustration of a digital song, not physical merchandise. The listening sample is Robin's approved brand song, labelled as our own story.

Brand mark: Robin approved the playful charcoal, orange and turquoise **I2M** monogram, paired with the slogan **“Jij het idee. Wij de muziek.”** The exact approved transparent artwork lives in `assets/i2m-logo.png`; keep it unchanged. Navigation and checkout/status headers visually crop the mark from this same file using CSS and present a separate, legible slogan directly beneath it, including on mobile. The audio preview crops only the mark, while the full slogan lockup appears in the landing-page and checkout footers. The earlier `assets/i2m-mark.png` is not used because it represents a different draft. `assets/favicon.svg` is a simplified legible small-size I2M rendering.

Runtime CSS is canonical (Model B): style.css defines tokens; checkout.css consumes them. This file mirrors exact accepted values. Fonts are self-hosted; OFL licenses are in assets. No external font requests or analytics.

## Colors
style.css owns --berry, --ink, --muted, --paper, --white, --coral, --pink, --yellow, --sage, --green, --line and --danger. --navy and --blue are compatibility aliases for --berry; --lilac aliases --coral. New components use current semantic names. Primary actions use berry/paper. Coral is illustration accent, not small-text foreground. Pink/yellow/sage use dark text. Errors retain messages and aria-invalid.

## Typography
--font: DM Sans 400/600. --display: Bricolage 800. Rounded large lettering gives the music-gift brand character while body/form text remains quiet. Inputs stay 16px for iOS. Dutch, nl-NL EUR and the existing Europe/Amsterdam price boundary remain unchanged.

## Layout
Two-column marketing hero: story/CTA left, gift/listening sample right. Mobile reading order: story, CTA, transparent price, artwork, sample. Follow with promise strip, three occasion illustrations, actual three-step process, native FAQs and final order invitation. No hamburger or obstructive sticky controls.
Questionnaire remains document-scrolling single column with max-width 780px. Existing validation, payment, cancellation, consent and privacy behavior stays canonical. Errors reserve 20px; feedback 52px. Long stories wrap; no sticky control obscures the keyboard.

## Elevation & Depth
Only the envelope is expressive. Other surfaces use quiet borders without floating shadows. Avoid gradients, technical dashboard tiles and a SaaS aesthetic.

## Shapes
Pill CTAs; 12px fields; 24px form/occasion panels. Audio, checkboxes and disclosures preserve native browser interaction.

## Components
| Design role | Runtime target | Consumers | Owner |
| --- | --- | --- | --- |
| primary / berry | --berry | headings, buttons, focus, checkout accents | style.css |
| paper / white | --paper / --white | document, cards, fields | style.css |
| accent palette | --coral / --pink / --yellow / --sage | authored illustrations, occasions | style.css and matching SVG |
| body / display | --font / --display | marketing and questionnaire | style.css |
| control shape | --control-radius | fields and notices | style.css |
| form spacing | --form-padding / --field-gap | questionnaire | checkout.css |
| validation | --danger and error text | inline errors | style.css and checkout.js |
| scrollbar | --scroll-thumb / --scroll-track / --scroll-hover | document | style.css |

Native audio is self-hosted, preload=none, no autoplay, with a direct-file fallback. It is not a customer example. Browser owns audio controls.
Landing readiness comes from /api/config; failure leaves a questionnaire explanation. Only enabled promotes all links directly. Server remains authoritative for prices and charging.
Labels, rules and errors stay in lib/order-rules.js and checkout.js. Keep input/review in memory, never clear it on errors; busy payments preserve dimensions. Textareas auto-grow. Session storage contains only transient order ID/access code. Never treat redirect as proof of payment.
Visible focus, reduced motion, forced colors and themed visible scrollbars are shared.

## Do's and Don'ts
- Put the personal story and gift first; show price clearly.
- Use real audio and honest labels, no fake reviews, sales counts or customer songs.
- Promotion ends 30 November 2026 inclusive; EUR 15 from 1 December.
- Target one working day with communicated delays, never guaranteed delivery.
- No trackers, accounts, subscription upsells or physical-record sale claims.
- No credentials or questionnaire answers in URLs/logs.
- PRODUCT.md owns legal, charging, cancellation and email rules.

## Reconcile drift — 16 November 2026
| Previous rule | Decision | Implementation |
| --- | --- | --- |
| Preserve navy/lilac | User-approved independent gift identity | palette, graphic, checkout accents |
| Arial body/display | Rounded Bricolage / DM Sans | self-hosted fonts, shared variables |
| 6px actions | Pill CTAs and quiet rounded fields | .button and --control-radius |
