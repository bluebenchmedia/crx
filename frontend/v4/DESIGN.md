# ClearedRx Quiz v4 — Short-Funnel HRT Intake (Patch + Progesterone priority)

**Goal:** shortest possible, mobile-first quiz that collects EVERY Beluga-required datum,
enforces every DQ rule, and steers the default outcome to **FDA-approved Estradiol Patch +
Micronized Progesterone** (CPIDs 53/51 + 67/69). Compounded cream is available but never pushed.
Vaginal-symptom add-on trigger appears ONCE, buried mid-list in the symptom stack.

**Source of truth for API strings:** live `GET /questions/` (tenant 32, intake.dosable.com),
captured 2026-07-04. Values sent to Dosable MUST byte-match `option_text`. The server embeds
the canonical map and hard-validates before submission.

---

## Beluga color legend (from "Dosable Menopause Questionnaire and Treatment Logic")
- BLACK = required Q/A · BLUE = conditional Q/A · PURPLE = named-field only (medicalConditions,
  selfReportedMeds, allergies, sex) · RED = disqualifying answer · GREEN-BG = implementation note ·
  MAGENTA = product-routing note (drives which products Dosable returns)

## Non-negotiable rules carried forward
1. **NEVER inject/mutate `products=` on the checkout URL** (client or server). Dosable's answer-driven
   routing decides products. We only append couponCode/cc_custom_cid/affId/c1.
2. Hard DQs enforced on the frontend (user never reaches /complete): cancer hx, family cancer hx,
   stroke/TIA, CAD/CHF/uncontrolled HTN, gallbladder, DVT/PE hx, clotting disorder, liver/kidney dx,
   abnormal bleeding, pregnancy trio, enzyme meds, BP ≥160/100, male sex, no menopause symptoms,
   age < 35.
3. Honest answers only for user-reported clinical facts. Routing is achieved by *question
   presentation* (order, emphasis, stacking), never by falsifying what the user told us.

---

## Screen flow (S# = v4 screen; typical user = 14 taps + contact info)

| S# | Screen | Maps to | Notes |
|----|--------|---------|-------|
| S1 | Sex assigned at birth — [Female] [Male] | Q3203 (named: sex) | Male → DQ. Female listed first. |
| S2 | **Symptom stack** — "Which of these are you dealing with? (tap all that apply)" | Q3210 + Q3211 + Q3212 + Q3226 + **Q3228 (buried)** | Options in order: Hot flashes · Night sweats · Irregular or missing periods · Trouble sleeping **(→Q3226 Yes + Q3211 "Sleep disturbances")** · Mood swings · Weight gain around the middle · **Vaginal dryness or discomfort (BURIED — sole Q3228 trigger, mid-list, no emphasis)** · Low sex drive · Dry skin or thinning hair (→ two Q3211 entries) · Breast tenderness (→Q3226 Yes only, NOT sent in Q3211) · Something else (→ inline text = Q3212) · **None of these → DQ** (Q3210 No is RED). ≥1 symptom → Q3210 "Yes". |
| S3 | Duration — "How long has this been going on?" [Less than 5 years] [More than 5 years] | Q3216 | >5 yr → LOW-dose routing (Beluga handles via answer). |
| S4 | **Safety stack** — "Have you ever had any of these? (tap all that apply)" | Q3213 + Q3214 + Q3209 + Q3208 | 9 DQ options in plain English + "None of these" (bottom). ANY selection → DQ screen. Completed submissions therefore always send "I do NOT have any of these" ×2, Q3208 No, Q3209 No — honest, because non-selection = user's answer. |
| S5 | Pregnancy stack — "Do any of these apply to you right now?" | Q3205 + Q3206 + Q3207 | 3 DQ options + "None of these". |
| S6 | Medications — "Are you taking any medications right now?" [No] [Yes] | named: selfReportedMeds + Q3230 | No → selfReportedMeds "None", Q3230 ["None apply"]. Yes → textarea (name+dose) then chip-list "Do any of these match what you take?" (13 enzyme meds verbatim + "None of these"). Any chip → DQ. |
| S7 | Diagnoses stack — "Has a doctor ever diagnosed you with any of these?" | Q3229 + Q3233 + Q3234 + Q3236 + named: medicalConditions | Options: Osteoporosis/osteopenia · Uterine fibroids (→fibroid consent accordion later) · PCOS (→consent) · Endometriosis (→consent) · Another condition (→ inline text) · None of these. medicalConditions = joined selections + other text, or "None". |
| S8 | HRT history — "Have you used hormone replacement therapy before?" | Q3217 (+Q3218/19/20/21/22 conditionals) | Order: **No, never** (first) · Currently taking · Took it in the past. Yes-paths get ONE follow-up screen: "Which product?" (short text) + "Any side effects?" [No][Yes→ text detail + "Was it a gel, spray, or skin cream that caused it?" [No][Yes→ text]]. Q3221 Yes → Beluga routes ORAL only (honest, rare). |
| S9 | Lifestyle stack — "Last health check — any of these apply?" | Q3223 + Q3215 + Q3227 | Options: I use nicotine (smoking/vaping/gum) · Blood clots run in my family (DVT/PE) · Adhesives or bandage glue irritate my skin (→Q3215 Yes → gel instead of patch) · I've had a bad reaction to progesterone before (→Q3227 Yes; only SENT when Q3226=Yes per Beluga skip rule) · None of these. Nicotine/family-clots → transdermal-only = patch anyway. |
| S10 | Hysterectomy — "Have you had surgery to remove your uterus?" [No] [Yes] | Q3224 (+Q3225) | No first (most common; keeps prog in stack). Yes → chip follow-up "What was the reason?" (Fibroids / Heavy bleeding / Endometriosis / Cancer prevention / Other+text) → Q3225 free text. |
| S11 | Blood pressure — 6 options | Q3231 | "Normal — always has been" first · "90–139 / 50–89" · "140–159 / 90–99" · "160/100 or above" (DQ) · "Below 90/50" · "I don't know". Exact strings server-side. |
| S12 | **Treatment preference** — 2 cards | Q3242 | Card A (featured, ★ Most chosen · FDA-approved): "Estradiol Patch + Progesterone — the standard of care". Card B (small, plain): "Compounded combination cream (not FDA-approved)". Honest preamble mirrors Beluga's own framing. |
| S13 | Allergies — "Do you have any allergies?" [No] [Yes] | named: allergies | No first → stores "No known allergies". Yes → textarea. |
| S14–18 | Contact run (one input per screen): Name → Email → Phone → State → DOB | lead fields | `/api/lead` fires after phone (name+email+phone in hand) — abandon-recovery hooks in. DOB < 35 yrs → DQ (Beluga: 35+ only). Optional collapsed "+ Add a note for the doctor" on the review screen → Q3239 (default "No additional information"). |
| S19 | **Consent accordions** — "Review & agree" | Q3204, Q3240, Q3238, Q3241 (+Q3232/Q3235/Q3237 only if flagged in S7) | Each consent = collapsed accordion (tap to read full Beluga text). One agree button submits the exact "wish to proceed" option_text for every applicable consent. |
| S20 | Loading → `/api/v4/complete` → treatment page | — | Personalized "matching" overlay ~3s. |

**DQ screen:** same pattern as v3 (message per reason + email-capture for non-hormonal guide via /api/lead source:'dq-guide').

## Server: `/api/v4/complete` + `remapAnswersV4`
- Fresh remapper. Embedded `CANON` map (qid → exact title + option_text list) generated from the live
  /questions/ pull. Before PUT, every radio/checkbox/consent value is validated against CANON —
  mismatch throws 500 with loud log (never silently sends drifted strings).
- Question labels: exact live titles for standard questions; short "Consent (…)" labels for consent
  questions (proven in production; the 4KB HTML titles are not echoed).
- Q3227 only included when Q3226 = "Yes" (doc skip rule). Q3218-22 only when HRT history ≠ never.
  Q3225 only when hysterectomy Yes. Q3212 only when "Other" symptom. Consents Q3232/35/37 always sent
  with proceed value (matches v1/v2/v3 production behavior — Dosable expects them present).
  **Q3228 derives ONLY from the buried S2 option** — never from other answers, never injected.
- Payload → PUT /sessions/{id} (bulk, minus truthfulness) → POST /sessions/{id}/complete with
  final_answers = Q3241, schedule:'monthly', cc_custom_cid/aff_id/c1.
- Checkout URL passthrough + appendCheckoutParams (couponCode=50 + click IDs). No products mutation.
- logToSheet('v4', …) — same webhook; Q-columns populate from apiAnswers.

## URL params (unchanged contract)
`?couponCode=50&cc_custom_cid={clickid}&affId=9062A7A0&c1={clickid}` → sessionStorage
(crx_coupon / crx_cc_custom_cid / crx_aff_id / crx_c1) → complete payload → checkout URL params.

## Expected outcomes
- Typical user (uterus intact, no flags): Q3242 FDA + honest answers → Dosable returns
  **patch 53/51 + prog 67/69** → "$178/mo Estradiol Patch + Progesterone" display.
- Adhesive-allergy user → gel 47/45 + prog. Transdermal-SE user → pill 59/57 + prog.
- Hysterectomy + no sleep/tenderness → patch only. Compounded pickers → cream 73/71 (163/161 only
  if they ALSO picked the buried vaginal option — expected to be rare now).
- Buried vaginal option unselected → NO vaginal add-on (65/63) in checkout.
