# Comprehensive QA Audit Notes — Apr 3, 2026

## Issues to Fix

### 1. Navbar
- Current: Logo left, "HIPAA Secure" badge right
- Fix: Logo left, customer support phone number right. Remove HIPAA badge entirely.
- Phone number from footer: 1-800-555-0100

### 2. Product Badges/Widgets — CRO Sweep
- Current badges: vcream="Most Popular" (rose), cream="All-in-One" (rose), gel="Most Flexible" (green), pill="Simplest Routine" (sage), patch=none
- Fix: ONLY vcream keeps "Most Popular" badge. Remove ALL other badges (cream, gel, pill).
- The flagship product is the vaginal compound cream — it should be the only one with visual emphasis.

### 3. Product Titles — Show Full Treatment Pairs
- When needsProgesterone=true:
  - vcream: "Estrogen + Progesterone Vaginal Cream" (already correct, compounded)
  - cream: "Estrogen + Progesterone Body Cream" (already correct, compounded)
  - gel: should show "Estrogen Gel + Progesterone Pills" in panel title
  - patch: should show "Estrogen Patches + Progesterone Pills" in panel title
  - pill: should show "Estrogen + Progesterone Pills" in panel title
- When needsProgesterone=false (hysterectomy):
  - vcream/cream: should NOT show — they're compounded E+P, user doesn't need P
  - Actually wait — vcream and cream are compounded E+P. If user had hysterectomy, they don't need progesterone. So should we still show compounded E+P products? Need to check.
  - Per the spec: hysterectomy removes progesterone. Compounded creams include progesterone. So for hysterectomy patients, compounded creams may not be appropriate — they'd only see gel, patch, pill (estrogen-only).
  - BUT the current code shows all products regardless of hysterectomy status. The only thing that changes is needsProgesterone flag which controls the progesterone add-on display.
  - For hysterectomy patients: gel, patch, pill show as "Estrogen Gel", "Estrogen Patch", "Estrogen Pills" (no progesterone mention)
  - vcream and cream still show but without the "Progesterone Included" row. This is actually wrong — compounded creams inherently contain progesterone. Need to hide them for hysterectomy patients OR show estrogen-only versions.
  - Actually checking the CPID catalog: vcream CPID 119 is the compounded E+P vaginal cream. There's no estrogen-only vaginal cream CPID. So for hysterectomy patients, vcream and cream should be HIDDEN since they contain progesterone the patient doesn't need.
  - WAIT — need to check if Dosable has estrogen-only cream CPIDs. Looking at the catalog... no, there are no estrogen-only cream CPIDs. So for hysterectomy patients, only gel, patch, and pill are available.

### 4. Product Descriptions — Copy Overhaul
Current benefits are in checklist format. Need to rewrite as educational selling copy.

### 5. Hysterectomy Scenario
- Hide vcream and cream for hysterectomy patients (compounded E+P not appropriate)
- Only show gel, patch, pill (estrogen-only)
- Default to gel for hysterectomy patients

### 6. 3-Month Supply Checkout
- Need to verify the quarterly CPID is being sent correctly
- The server uses selectedSchedule to pick the right CPID

### 7. Panel Title vs Card Title
- Card titles already append "+ Progesterone Pills" for non-compounded products when needsProgesterone
- Panel title (renderPanel) currently shows just p.name — needs to also show the full pair
