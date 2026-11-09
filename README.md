# Habib Orchards — personalized chatbot demo

PERSONALIZED build for **Habib Orchards** (developed housing society, Rahim Yar Khan) —
residential plots + payment plans. Assistant: **Noor**. Built 2026-11-09 by Tameer Ali's demo factory.

- Real business details baked in from `DETAILS.md` (verified from their Facebook Page only;
  no plot sizes, no prices, no plan terms invented — the assistant always has the sales
  team confirm current prices/plan options). NOT re-brandable via query params.
- 4 flows: plots/prices/payment-plan Q&A · site-visit booking (interest → name → optional
  WhatsApp number → day → time, HO- reference card, lead saved) · after-hours 11:42 PM
  lead capture (plot / payment plan / site visit) · 60-sec plot quiz (purpose → timeline →
  payment → name → phone) · plus review routing.
- Phone validation: `digits.length < 7` rejected in every phone field.
- Inbox panel is pre-seeded once with 3 clearly-marked **sample** leads in Pakistani
  test-pattern numbers (0300 1234567 etc.) so the format is visible; real captures append live.
- Zero external requests; works from file://; leads persist in localStorage
  (`nmc_habib_leads`).
- Sent-bubble emoji fix included: chip labels are entity-decoded before display, so
  "🌙 After-hours demo" no longer renders as raw `&#127769;` text.
- Harness: `~/workspace/outreach/demo-deploy-zips/habib-verify-2026-11-09.js`.
