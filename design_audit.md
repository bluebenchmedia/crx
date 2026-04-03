# Treatments Page Design Audit

## Observed Issues (Desktop / Mobile)

### Treatment Selector Cards
- On desktop: 5 cards render in a 4-column grid, so the 5th card (Estrogen + Progesterone Pills) wraps to a second row and sits alone in the bottom-left — looks unbalanced
- Cards are quite tall on mobile due to wrapping text in the name area

### Product Panel
- The schedule cards (Monthly / 3-Month) have very tight top spacing — they appear immediately below the benefits list with no visual separator
- The addon row (Progesterone Included) has inconsistent vertical alignment — the "Included" label floats to the right but the row itself has no clear visual separation from the schedule cards above it
- The total-wrap box looks fine but the price line ($189 strikethrough + $95) has awkward baseline alignment
- The checkout button is full-width on mobile (good) but has no top margin from the total-wrap

### General Spacing
- The product section (white background) has very little top padding — the product image/title appear cramped right after the selector section
- On mobile, the panel-top (image + info) stacks vertically but the image takes up too much height before the text starts
- The schedule cards grid has no gap between the two cards on very narrow screens

## Missing CSS Classes Referenced in treatments.js
- `.addon-row` — used in progHtml but the CSS in treatments.html uses different class names (`.addon-row--included`, `.addon-info`, `.addon-name`, `.addon-sub`, `.addon-price`, `.addon-price--included`)
- `.panel-benefit` and `.benefit-check` — used in benefitsHtml but not defined in treatments.html CSS
- `.sched-wrap` — used in scheduleHtml but not defined
- `.sched-card`, `.sched-card--active`, `.sched-save-badge`, `.sched-card-name`, `.sched-price-orig`, `.sched-price-disc`, `.sched-detail` — some defined, some not
- `.addons-wrap` — not defined
- `.panel-benefits` — not defined

## Missing Quiz Questions
1. Date of Birth (DOB) — hardcoded as 01/01/1975 in lead capture
2. State — hardcoded as 'CA' in lead capture
3. Transdermal side effects — currently proxied from HRT history question, needs dedicated step
