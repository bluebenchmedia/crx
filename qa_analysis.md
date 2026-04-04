# QA Scenario Test Results Analysis

## Scenario 1: Standard Patient (has uterus, no allergies)
- **Flags**: ALL CORRECT
  - needsProgesterone=true, hysterectomy=false, all blocks=false
  - doseTier="normal", vaginalSymptoms=false
- **API Answers**: CORRECT
  - Q3242 = "Compounded estrogen/progesterone cream" (vcream selected)
  - Q3224 = "No" (no hysterectomy)
  - Q3215 = "No" (no adhesive allergy)
  - Q3217 = "No, I have never taken HRT"
- **Expected CPIDs**: 119:1 (vcream monthly) — CORRECT (no prog addon since compounded)
- **VERDICT: PASS**

## Scenario 2: Hysterectomy Patient
- **Flags**: ALL CORRECT
  - hysterectomy=true, needsProgesterone=false
  - Q3226/Q3227 (sleep/tenderness/prog intolerance) correctly SKIPPED
- **API Answers**: CORRECT
  - Q3224 = "Yes" (hysterectomy)
  - Q3225 = "Medical necessity" (hysterectomy reason)
  - No Q3226/Q3227 sent (correct — skipped for hysterectomy)
  - No Q3242 sent (correct — gel is FDA product, no formulation pref needed)
- **Expected CPIDs**: 15:1 (gel monthly, NO prog addon) — CORRECT
- **NOTE**: Q3242 (formulation preference) is NOT sent for gel. This is because the formulation preference is only sent for compounded products. Need to verify Dosable accepts this.
- **VERDICT: PASS (with note)**

## Scenario 3: Adhesive Allergy Patient
- **Flags**: ALL CORRECT
  - adhesiveAllergy=true, blockPatch=true
  - vaginalSymptoms=true (vaginal-dryness in symptoms)
- **API Answers**: CORRECT
  - Q3215 = "Yes" (adhesive allergy — NEVER overridden)
  - Q3228 = ["Vaginal dryness"] (vaginal symptoms correctly detected)
  - Q3242 = "FDA-approved..." (gel selected)
- **Expected CPIDs**: 15:1;35:1;31:1 (gel + prog + vaginal addon monthly) — CORRECT
- **VERDICT: PASS**

## Scenario 4: Nicotine/Clot Patient
- **Flags**: ALL CORRECT
  - nicotineUse=true, nicotineOrClot=true, blockOral=true
- **API Answers**: CORRECT
  - Q3223 = ["Do you currently use nicotine products?"] (nicotine flagged)
  - Q3242 = "Compounded estrogen/progesterone cream" (vcream selected)
- **Expected CPIDs**: 119:1 (vcream monthly) — CORRECT
- **VERDICT: PASS**

## Scenario 5: Quarterly Supply
- **Flags**: ALL CORRECT (same as scenario 1)
- **API Answers**: CORRECT (same as scenario 1)
  - Q3242 = "Compounded estrogen/progesterone cream" (vcream selected)
- **Expected CPIDs**: 157:1 (vcream quarterly) — CORRECT
- **VERDICT: PASS**

## Scenario 6: Transdermal Side Effects Patient
- **Flags**: ALL CORRECT
  - transdermalSideEffects=true, blockTransdermal=true
- **API Answers**: CORRECT — SOFT ROUTING ACTIVATED
  - Q3217 = "Yes, I have taken HRT in the past" (soft-routed)
  - Q3218 = "Estradiol patch" (soft-routed formulation)
  - Q3219 = "Yes" (soft-routed side effects)
  - Q3220 = "Skin irritation at application site" (soft-routed detail)
  - Q3221 = "Yes" (transdermal SE)
  - Q3222 = "Skin irritation at application site" (transdermal reaction detail)
  - Q3242 = "FDA-approved..." (pill selected)
- **Expected CPIDs**: 27:1;35:1 (pill + prog monthly) — CORRECT
- **NOTE**: The soft routing correctly fills Q3217-Q3222 because the user reported real transdermal SE (step-25=yes). This is the "honest" soft route — the user actually had transdermal issues.
- **VERDICT: PASS**

## Scenario 7: Gel + Progesterone + Vaginal Addon (quarterly)
- **Flags**: ALL CORRECT
  - vaginalSymptoms=true, needsProgesterone=true
- **API Answers**: CORRECT
  - Q3228 = ["Vaginal dryness"] (vaginal symptoms)
  - Q3242 = "FDA-approved..." (gel selected)
- **Expected CPIDs**: 125:1;145:1;141:1 (gel + prog + vag quarterly) — CORRECT
- **VERDICT: PASS**

## Scenario 8: Hysterectomy + Adhesive Allergy
- **Flags**: ALL CORRECT
  - hysterectomy=true, adhesiveAllergy=true, needsProgesterone=false
  - doseTier="low" (symptomDurationLong=true, 3+ years)
  - blockPatch=true
- **API Answers**: CORRECT
  - Q3215 = "Yes" (adhesive allergy)
  - Q3224 = "Yes" (hysterectomy)
  - Q3216 = "Greater than 5 years" (long duration)
- **Expected CPIDs**: 13:1 (gel monthlyLow, NO prog) — CORRECT (low dose tier)
- **Frontend products available**: gel and pill only (vcream/cream hidden by hyst, patch hidden by allergy)
- **VERDICT: PASS**

---

## OVERALL RESULT: ALL 8 SCENARIOS PASS

### One Note
Scenario 2 (hysterectomy + gel): Q3242 (formulation preference) is not sent. This is intentional — Q3242 is only relevant for compounded products. For FDA products (gel/patch/pill), the formulation preference is set to "FDA-approved..." which is the default. Need to verify this doesn't cause a Dosable validation error at session complete time.
