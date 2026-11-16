---
version: alpha
name: Idea2Music
description: Personal music with a restrained record-sleeve identity and a quiet, readable checkout.
colors:
  primary: "#111d35"
  navy: "#111d35"
  ink: "#172239"
  muted: "#606777"
  paper: "#f5f6f8"
  white: "#ffffff"
  lilac: "#c2b5f6"
  line: "#dee2e9"
  danger: "#a42b3a"
typography:
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
  display:
    fontFamily: "Arial Black, Arial, Helvetica, sans-serif"
rounded:
  DEFAULT: "6px"
spacing:
  form-padding: "35px"
  field-gap: "16px"
components:
  button:
    height: "49px"
    backgroundColor: "{colors.lilac}"
    textColor: "{colors.navy}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
---
# Idea2Music design

## Overview
The existing tilted record sleeve and waveform are the memorable brand element. Preserve the navy/lilac landing page; checkout is a quiet paper questionnaire, not another hero campaign. Robin requested a businesslike, simple experience for Dutch consumers, primarily on phones. No new theme, stock imagery, decorative cards, subscriptions or accounts.

Runtime CSS is canonical (Model B): DESIGN.md mirrors `style.css` and `checkout.css`. Existing CSS variables are consumed directly; no framework adapter or generated theme. The checkout adds only the error color and control/scrollbar tokens. The landing page remains the visual sibling.

## Colors
`style.css` owns --navy, --ink, --muted, --paper, --white, --lilac and --line. `checkout.css` owns --danger and aliases for visible scrollbar thumb/track/hover. Error text uses --danger alongside actual messages and aria-invalid. Lilac is used on primary actions with navy text, never white text.

## Typography
Body and native inputs use --font, display uses --display. Inputs remain 16px for iOS. Dutch text, EUR with nl-NL formatting, Europe/Amsterdam promotion boundary. No custom web-font request or font swap.

## Layout
Document scrolling; form max-width 780px. One column throughout, readable labels above fields. Checkout uses an existing 650px breakpoint. Review retains the entered values in memory; never move or clear fields because of a server error. Errors reserve 20px, feedback reserves 52px. Long stories wrap. No sticky control obscures the keyboard.

## Elevation & Depth
Keep the existing sleeve shadow on the landing page. Form sections use borders and white surfaces, without floating panels or new shadows.

## Shapes
Controls share the 6px radius. Native checkboxes remain native. Inputs for style, mood and language deliberately accept free text, so no dropdown primitive is needed.

## Components
Labels, input constraints and errors follow the shared `lib/order-rules.js` schema. Button uses existing .button, deliberate hover/focus/pressed and native disabled semantics. Busy payments keep a full-width 52px button. Textareas auto-grow with resize:none. Details/summary use browser disclosure semantics; each may open independently.

Only transient order ID/access code is stored in sessionStorage, for return from Mollie. Questionnaire answers stay in memory before submission. Disabled checkout is explained in a live region. No fake payment or positive order confirmation is shown when Mollie has not confirmed payment. No browser alert/confirm/prompt. Reduced motion and forced colors remain supported.

## Do's and Don'ts
- Preserve the record-sleeve identity and clear Dutch labels.
- Keep errors actionable and preserve entered data.
- Do not treat a return URL as proof of payment.
- Do not put secrets, customer information or questionnaire answers in URLs or logs.
