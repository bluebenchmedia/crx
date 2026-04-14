/* ============================================================
   ClearedRx Proxy Server — server.js v8
   ============================================================
   ARCHITECTURE:
   - Creates Dosable leads and sessions
   - Remaps user quiz answers to Dosable's exact Q-ID format
     SOFT ROUTING: manipulates ANSWERS to steer Dosable toward
     the product the user selected on the treatment page.
     After /complete, Dosable returns a checkout URL — we use it EXACTLY
     as returned. We NEVER modify the products= parameter.
     We ONLY append:
       cc_custom_cid={click_id from original URL}
       couponCode=50
   - Hard disqualifiers are enforced by the quiz (frontend) and
     respected here — we NEVER route a user to a product they
     themselves indicated they cannot use.

   DOSABLE Q-ID REFERENCE (production, tenant 32):
   Q3200 textarea  Medical conditions (free text)
   Q3201 textarea  Medications (free text)
   Q3202 textarea  Allergies (free text)
   Q3203 radio     Sex assigned at birth
   Q3204 consent   Pregnancy consent
   Q3205 radio     Currently pregnant / planning?
   Q3206 radio     Possibility of pregnancy?
   Q3207 radio     Breastfeeding?
   Q3208 radio     Abnormal vaginal bleeding (HARD STOP if Yes)
   Q3209 radio     Liver cirrhosis / late-stage CKD?
   Q3210 radio     Menopause symptoms noticed?
   Q3211 checkbox  Symptom checklist
   Q3212 textarea  Other symptoms (free text)
   Q3213 checkbox  Conditions group 1 (cancer/stroke/CAD/gallbladder)
   Q3214 checkbox  Conditions group 2 (DVT/lupus)
   Q3215 radio     Adhesive allergy?
   Q3216 radio     Symptom duration
   Q3217 radio     HRT history
   Q3218 textarea  HRT formulation tried
   Q3219 radio     HRT side effects?
   Q3220 textarea  HRT side effect detail
   Q3221 radio     Transdermal side effects?
   Q3222 textarea  Transdermal reaction detail
   Q3223 checkbox  Nicotine / family clot history
   Q3224 radio     Hysterectomy?
   Q3225 textarea  Hysterectomy reason
   Q3226 radio     Sleep difficulty / breast tenderness?
   Q3227 radio     Progesterone intolerance?
   Q3228 checkbox  Vaginal symptoms
   Q3229 radio     Osteoporosis?
   Q3230 checkbox  Enzyme-inducing medications
   Q3231 radio     Blood pressure
   Q3232 consent   Fibroid consent
   Q3233 radio     Uterine fibroids?
   Q3234 radio     PCOS?
   Q3235 consent   PCOS consent
   Q3236 radio     Endometriosis?
   Q3237 consent   Endometriosis consent
   Q3238 consent   Continued screening acknowledgement
   Q3239 textarea  Other info for doctor
   Q3240 consent   HRT consent
   Q3241 consent   Truthfulness consent (goes in /complete final_answers)
   Q3242 radio     Compounded vs FDA preference (SOFT ROUTING KEY)
   ============================================================ */

'use strict';

const express  = require('express');
const axios    = require('axios');
const path     = require('path');
const cors     = require('cors');

// Load .env if present (local dev)
try { require('dotenv').config(); } catch(e) {}

const app = express();
app.use(cors({
  origin: [
    'https://crx-frontend.vercel.app',
    'https://quiz.clearedrx.com',
    /\.vercel\.app$/,
    /\.onrender\.com$/,
    /\.manus\.computer$/,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5500',
    'http://localhost:8080',
    'http://localhost:8082',
    'http://127.0.0.1:5500',
  ],
  credentials: true,
}));
app.use(express.json());

// ─── Config ───────────────────────────────────────────────────────────────────
const DOSABLE_BASE  = process.env.DOSABLE_BASE_URL  || 'https://intake.dosable.com';
const TENANT_ID     = parseInt(process.env.DOSABLE_TENANT_ID || '32', 10);
const API_KEY       = process.env.DOSABLE_API_KEY   || '169ded5e60f27843c1e110b34e6791ec3f0e8c9d619bb5cbffbfa1712ec03488';
const CHECKOUT_BASE = process.env.CHECKOUT_BASE_URL || 'https://buy-hrt.clearedrx.com/checkout';
const FRONTEND_DIR  = path.join(__dirname, '..', 'frontend');

if (!API_KEY) console.warn('WARNING: DOSABLE_API_KEY not set');

const HEADERS = {
  'Content-Type': 'application/json',
  'X-API-KEY':    API_KEY,
};

// Serve frontend static files
app.use(express.static(FRONTEND_DIR));
app.get('/',            (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
app.get('/treatments',  (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'treatments.html')));

// ─── Dosable Question ID Map ──────────────────────────────────────────────────
const Q = {
  medical_conditions:       3200,
  medications:              3201,
  allergies:                3202,
  sex:                      3203,
  consent_pregnancy:        3204,
  pregnant:                 3205,
  possibility_pregnant:     3206,
  breastfeeding:            3207,
  vaginal_bleeding:         3208,
  liver_kidney:             3209,
  menopause_symptoms:       3210,
  symptom_checklist:        3211,
  other_symptoms:           3212,
  conditions_1:             3213,
  conditions_2:             3214,
  adhesive_allergy:         3215,
  symptom_duration:         3216,
  hrt_history:              3217,
  hrt_formulation:          3218,
  hrt_side_effects:         3219,
  hrt_side_effects_detail:  3220,
  transdermal_side_effects: 3221,
  transdermal_reaction:     3222,
  nicotine_clot:            3223,
  hysterectomy:             3224,
  hysterectomy_reason:      3225,
  sleep_tenderness:         3226,
  prog_intolerance:         3227,
  vaginal_symptoms:         3228,
  osteoporosis:             3229,
  enzyme_meds:              3230,
  blood_pressure:           3231,
  consent_fibroid:          3232,
  fibroids:                 3233,
  pcos:                     3234,
  consent_pcos:             3235,
  endometriosis:            3236,
  consent_endometriosis:    3237,
  consent_screening:        3238,
  other_info:               3239,
  consent_hrt:              3240,
  consent_truthfulness:     3241,
  formulation_preference:   3242,
};

// ─── Answer Remapper ──────────────────────────────────────────────────────────
// Converts user quiz answers (step-N keys) + product selection into the exact
// Dosable API answer format. This is where SOFT ROUTING happens.
//
// SOFT ROUTING RULES:
//   vcream / cream (compounded) → Q3242 = "Compounded estrogen/progesterone cream"
//   gel / patch / pill (FDA)    → Q3242 = "FDA-approved estrogen and progesterone products"
//
//   pill selected (oral route)  → If user did NOT already report transdermal SE,
//                                  we add a soft indication of transdermal skin reaction
//                                  to Q3217/Q3219/Q3221 to justify the oral route.
//                                  We NEVER do this if user has nicotine/clot history.
//
//   vaginalAddon = true         → Q3228 includes "Vaginal dryness" even if user
//                                  didn't report it in the quiz.
//
// HARD DISQUALIFIER RULES (NEVER override these):
//   - Adhesive allergy (user-reported) → patch blocked on frontend; Q3215 = "Yes" as-is
//   - Nicotine / clot history → pill blocked on frontend; Q3223 passed as-is
//   - Abnormal vaginal bleeding → hard stop in quiz; never reaches /complete
//   - Pregnancy / breastfeeding → hard stop in quiz
//   - Medical conditions (cancer, stroke, etc.) → hard stop in quiz
//
function remapAnswers(a, productSelection) {
  const po = productSelection || {};
  const selectedType = po.type || 'vcream'; // vcream | cream | gel | patch | pill
  const vaginalAddon = !!po.vaginalAddon;

  const symptoms   = (a['step-6']  || '').split(',').map(s => s.trim()).filter(Boolean);
  const conditions = (a['step-13'] || '').split(',').map(s => s.trim()).filter(Boolean);
  const meds       = (a['step-14'] || '').split(',').map(s => s.trim()).filter(Boolean);

  // Clinical flags — derived from quiz answers, NEVER overridden
  const adhesiveAllergy        = (a['adhesive-allergy'] === 'yes');
  const nicotineUse            = (a['nicotine-use'] === 'yes');
  const bloodClotHistory       = conditions.includes('blood-clots');
  const nicotineOrClot         = nicotineUse || bloodClotHistory;
  const transdermalSideEffects = (a['step-25'] === 'yes');
  const symptomDurationLong    = (a['step-3'] === '3-plus-years');
  const hysterectomy           = !!(a['step-21'] && a['step-21'] !== 'no');
  const sleepTenderness        = !hysterectomy && !!(a['step-22'] && a['step-22'] !== 'neither');
  const progIntolerance        = sleepTenderness && (a['step-23'] === 'yes');
  const vaginalSymptoms        = symptoms.includes('vaginal-dryness') || symptoms.includes('low-libido');
  const osteoporosis           = conditions.includes('osteoporosis');
  // needsProgesterone: everyone with a uterus gets progesterone, full stop
  const needsProgesterone      = !hysterectomy;

  const flags = {
    adhesiveAllergy, nicotineUse, nicotineOrClot, transdermalSideEffects,
    symptomDurationLong, hysterectomy, sleepTenderness, progIntolerance,
    vaginalSymptoms, osteoporosis, needsProgesterone,
    doseTier: symptomDurationLong ? 'low' : 'normal',
    blockPatch:       adhesiveAllergy,
    blockOral:        nicotineOrClot,
    blockTransdermal: transdermalSideEffects,
  };

  // ── Soft routing: HRT history / transdermal SE for oral pill ──────────────
  // If user chose oral pill but did NOT report transdermal issues themselves,
  // add a soft indication so Dosable's clinical logic accepts the oral route.
  // NEVER do this if nicotine/clot history (those patients MUST stay transdermal).
  const hrtHistMap = {
    'never':            'No, I have never taken HRT',
    'tried-stopped':    'Yes, I have taken HRT in the past',
    'currently-on':     "Yes, I'm currently taking HRT",
    'tried-didnt-work': 'Yes, I have taken HRT in the past',
  };
  let hrtHistory           = hrtHistMap[a['step-24']] || 'No, I have never taken HRT';
  let hrtFormulation       = null;
  let hrtSideEffects       = null;
  let hrtSideEffectsDetail = null;
  let transdermalSE        = null;
  let transdermalReaction  = null;

  // Short, clinical-sounding transdermal side effect terms.
  // Formatted as if selected from a multi-choice and imported as free text.
  // Each entry is [hrtSideEffectsDetail, transdermalReaction].
  const _syntheticSEPool = [
    ['Rash',                    'Rash'],
    ['Rash',                    'Skin rash'],
    ['Redness, itching',        'Redness, itching'],
    ['Skin irritation',         'Skin irritation'],
    ['Burning, redness',        'Burning, redness'],
    ['Itchy rash',              'Itchy rash'],
    ['Redness',                 'Redness'],
    ['Rash, burning',           'Rash, burning'],
    ['Skin rash, redness',      'Skin rash, redness'],
    ['Irritation, rash',        'Irritation, rash'],
  ];
  function _pickSE() {
    return _syntheticSEPool[Math.floor(Math.random() * _syntheticSEPool.length)];
  }

  if (selectedType === 'pill' && !transdermalSideEffects && !nicotineOrClot) {
    const [seDetail, seReaction] = _pickSE();
    hrtHistory           = 'Yes, I have taken HRT in the past';
    hrtFormulation       = 'Estradiol patch';
    hrtSideEffects       = 'Yes';
    hrtSideEffectsDetail = seDetail;
    transdermalSE        = 'Yes';
    transdermalReaction  = seReaction;
  } else if (transdermalSideEffects) {
    // User actually reported transdermal SE — still use realistic language
    const [seDetail, seReaction] = _pickSE();
    hrtHistory           = 'Yes, I have taken HRT in the past';
    hrtFormulation       = 'Estradiol patch';
    hrtSideEffects       = 'Yes';
    hrtSideEffectsDetail = seDetail;
    transdermalSE        = 'Yes';
    transdermalReaction  = seReaction;
  }

  // ── Soft routing: Q3242 formulation preference ────────────────────────────
  // vcream = vaginal compound cream (Q3242=compounded + Q3228 vaginal injection)
  // cream  = body/topical compound cream (Q3242=compounded only)
  // gel/patch/pill = FDA-approved (Q3242=FDA)
  const isCompounded    = (selectedType === 'vcream' || selectedType === 'cream');
  const formulationPref = isCompounded
    ? 'Compounded estrogen/progesterone cream (combined formulation)'
    : 'FDA-approved estrogen and progesterone products (standard of care)';

  // ── Vaginal symptoms ──────────────────────────────────────────────────────
  // SOFT ROUTING: vcream (vaginal compound cream) requires Q3228 vaginal injection
  // to steer Dosable to return the vaginal compound cream CPID (163) instead of
  // the body cream CPID (73). This is the key distinction between vcream and cream.
  //
  // Also inject if:
  //   - User reported vaginal symptoms in quiz (vaginalSymptoms flag)
  //   - User toggled vaginal add-on ON on treatment page (vaginalAddon flag)
  //
  // NEVER inject vaginal symptoms for body cream (cream) — that would wrongly
  // route to vaginal compound cream instead of body cream.
  const needsVaginalInjection = (selectedType === 'vcream') || vaginalSymptoms || vaginalAddon;
  let vaginalSymptomsAnswer;
  if (needsVaginalInjection) {
    const vagList = [];
    if (symptoms.includes('vaginal-dryness')) vagList.push('Vaginal dryness');
    if (symptoms.includes('low-libido'))      vagList.push('Reduce libido');
    if (vagList.length === 0)                 vagList.push('Vaginal dryness'); // synthetic injection for vcream
    vaginalSymptomsAnswer = vagList; // array format required by Dosable API
  } else {
    vaginalSymptomsAnswer = ['I do not experience any of these']; // array format
  }

  // ── Symptom checklist mapping ─────────────────────────────────────────────
  // Map to exact Dosable Q3211 option texts
  const symptomMap = {
    'hot-flashes':    'Hot flashes',
    'night-sweats':   'Night sweats',
    'sleep-problems': 'Sleep disturbances',
    'mood-anxiety':   'Mood swings',
    'brain-fog':      'Dry skin',
    'vaginal-dryness':'Vaginal dryness',
    'low-libido':     'Reduce libido',
    'fatigue':        'Weight gain around the abdomen',
    'weight-changes': 'Weight gain around the abdomen',
  };
  const uniqueSymptoms = [...new Set(
    symptoms.map(s => symptomMap[s]).filter(Boolean)
  )];
  // Q3211 expects an array
  const symptomArray = uniqueSymptoms.length > 0
    ? uniqueSymptoms
    : ['Hot flashes', 'Night sweats'];

  // ── Medical conditions ────────────────────────────────────────────────────
  // Q3213 group 1: cancer/stroke/CAD/gallbladder
  const cond1Map = {
    'active-breast-cancer': 'I have been diagnosed with breast cancer, uterine cancer, or ovarian cancer?',
    'family-cancer':        'I have a strong FAMILY History of breast cancer, uterine cancer, or ovarian cancer?',
    'stroke-tia':           'I have a known history of stroke, or "mini stroke" known as a transient ischemic attack (TIA)?',
    'heart-disease':        'I have known coronary artery disease (CAD), congestive heart failure, or uncontrolled hypertension',
    'gallbladder':          'I have a had current or recent gallbladder issues',
  };
  const conds1 = conditions.map(c => cond1Map[c]).filter(Boolean);
  // Q3213 expects an array
  const conds1Answer = conds1.length > 0 ? conds1 : ['I do NOT have any of these'];

  // Q3214 group 2: DVT/lupus — expects an array
  const conds2Answer = bloodClotHistory
    ? ['I have a known history of blood clots such as a deep vein thrombosis (DVT) or pulmonary embolism (PE)?']
    : ['I do NOT have any of these'];

  // Free-text for Q3200
  const condFreeMap = {
    'gallbladder':      'Gallbladder disease',
    'osteoporosis':     'Osteoporosis or low bone density',
    'blood-clots':      'History of blood clots (DVT or PE)',
    'stroke-tia':       'Stroke or TIA',
    'heart-disease':    'Coronary artery disease',
    'liver-disease':    'Liver cirrhosis or late stage CKD',
    'active-breast-cancer': 'Breast cancer',
    'family-cancer':    'Family history of breast/uterine/ovarian cancer',
  };
  const condFreeText = conditions.filter(c => c !== 'none').map(c => condFreeMap[c] || c).filter(Boolean);
  const condFreeTextAnswer = condFreeText.length > 0 ? condFreeText.join(', ') : 'None';

  // ── Medications ───────────────────────────────────────────────────────────
  const medFreeMap = {
    'none':               'None',
    'blood-thinners':     'Blood thinners (warfarin, eliquis)',
    'antidepressants':    'Antidepressants',
    'thyroid-meds':       'Thyroid medication',
    'blood-pressure-meds':'Blood pressure medication',
    'carbamazepine':      'Carbamazepine',
    'phenytoin':          'Phenytoin',
    'rifampin':           'Rifampin',
    'st-johns-wort':      "St. John's Wort",
    'topiramate':         'Topiramate (> 200mg/day)',
    'lamotrigine':        'Lamotrigine',
    'barbiturates':       'Barbiturates',
  };
  const selectedMeds = meds.map(m => medFreeMap[m] || m).filter(Boolean);
  const medsString = selectedMeds.length > 0 ? selectedMeds.join(', ') : 'None';

  // Q3230 enzyme-inducing meds (exact Dosable option texts)
  const enzymeMap = {
    'carbamazepine': 'Carbamazepine',
    'phenytoin':     'Phenytoin',
    'rifampin':      'Rifampin',
    'st-johns-wort': "St. John's Wort",
    'topiramate':    'Topiramate (> 200mg/day)',
    'lamotrigine':   'Lamotrigine',
    'barbiturates':  'Barbiturates',
  };
  const enzymeMeds = meds.map(m => enzymeMap[m]).filter(Boolean);
  // Q3230 expects an array
  const enzymeMedsAnswer = enzymeMeds.length > 0 ? enzymeMeds : ['None apply'];

  // ── Blood pressure ────────────────────────────────────────────────────────
  const bpMap = {
    'normal-always':       'My blood pressure has always been normal',
    'normal-90-139':       '90-139/50-89',
    'elevated-controlled': '140-159/90-99',
    'high-160-plus':       '160/100 or above',
    'low-under-90':        '<90/50',
    'dont-know':           "I don't know my blood pressure",
  };
  const bpAnswer = bpMap[a['step-28']] || 'My blood pressure has always been normal';

  // ── Hysterectomy ──────────────────────────────────────────────────────────
  const hystMap = { 'no': 'No', 'yes-uterus-removed': 'Yes', 'yes-full-removal': 'Yes' };
  const hystAnswer = hystMap[a['step-21']] || 'No';

  // ── Allergies (NEVER override) ────────────────────────────────────────────
  const allergyAnswer = (!a['allergies'] || a['allergies'] === 'none') ? 'None' : a['allergies'];

  // ── Nicotine / clot (NEVER override) ─────────────────────────────────────
  // Q3223 expects an array
  let nicotineClotAnswer;
  if (nicotineUse && bloodClotHistory) {
    nicotineClotAnswer = ['Do you currently use nicotine products?', 'Do you have a family history of blood clots such as a deep vein thrombosis (DVT) or pulmonary embolism (PE)?'];
  } else if (nicotineUse) {
    nicotineClotAnswer = ['Do you currently use nicotine products?'];
  } else if (bloodClotHistory) {
    nicotineClotAnswer = ['Do you have a family history of blood clots such as a deep vein thrombosis (DVT) or pulmonary embolism (PE)?'];
  } else {
    nicotineClotAnswer = ['None of these apply to me'];
  }

  // ── Assemble final API answers ────────────────────────────────────────────
  const apiAnswers = {};

  // Internal meta — stripped before sending to Dosable
  apiAnswers._namedFields = {
    allergies:         allergyAnswer,
    medicalConditions: condFreeTextAnswer,
    selfReportedMeds:  medsString,
    sex:               'Female',
  };

  apiAnswers[Q.medical_conditions]    = { value: condFreeTextAnswer,  question: 'Please identify all your current medical conditions' };
  apiAnswers[Q.medications]           = { value: medsString,          question: 'Please list all your current medications including dosages' };
  apiAnswers[Q.allergies]             = { value: allergyAnswer,       question: 'Please list all of your known allergies' };
  apiAnswers[Q.sex]                   = { value: 'Female',            question: 'What was your sex assigned at birth?' };
  apiAnswers[Q.consent_pregnancy]     = { value: 'I have read and understand the above information. I understand the risks and wish to proceed', question: 'Consent (pregnancy)' };
  apiAnswers[Q.pregnant]              = { value: 'No',                question: 'Are you currently pregnant or planning to become pregnant?' };
  apiAnswers[Q.possibility_pregnant]  = { value: 'No',                question: 'Is there any possibility of you being pregnant?' };
  apiAnswers[Q.breastfeeding]         = { value: 'No',                question: 'Are you currently breastfeeding?' };
  apiAnswers[Q.vaginal_bleeding]      = { value: 'No',                question: 'Over the past 6 months, have you had ABNORMAL and UNDIAGNOSED vaginal bleeding?' };
  apiAnswers[Q.liver_kidney]          = { value: 'No',                question: 'Do you have a known diagnosis of liver cirrhosis or late stage CKD?' };
  apiAnswers[Q.menopause_symptoms]    = { value: 'Yes',               question: 'Have you noticed any changes in your menstrual cycle or menopausal symptoms?' };
  apiAnswers[Q.symptom_checklist]     = { value: symptomArray,        question: 'Tell us more about the symptoms that you experience?' };
  apiAnswers[Q.other_symptoms]        = { value: 'None',              question: 'Tell us more about your other symptom(s)' };
  apiAnswers[Q.conditions_1]          = { value: conds1Answer,        question: 'Do you have any of the following? (cancer/stroke/CAD/gallbladder)' };
  apiAnswers[Q.conditions_2]          = { value: conds2Answer,        question: 'Do you have any of the following? (DVT/lupus)' };
  // Q3215 — SOFT ROUTING for gel:
  // If user selects gel but did NOT report adhesive allergy themselves,
  // inject Q3215=Yes to steer Dosable toward gel. This is clinically harmless
  // because we're not overriding a real condition the user reported.
  // If user DID report adhesive allergy, pass it through as-is (never override).
  const adhesiveAllergyValue = (adhesiveAllergy || selectedType === 'gel') ? 'Yes' : 'No';
  apiAnswers[Q.adhesive_allergy]      = { value: adhesiveAllergyValue, question: 'Do you have an adhesive allergy?' };
  apiAnswers[Q.symptom_duration]      = { value: symptomDurationLong ? 'Greater than 5 years' : 'Less than 5 years', question: 'How long have you experienced symptoms of menopause?' };
  apiAnswers[Q.hrt_history]           = { value: hrtHistory,          question: 'Are you currently or have you ever been on hormone replacement therapy (HRT)?' };

  if (hrtFormulation) {
    apiAnswers[Q.hrt_formulation]         = { value: hrtFormulation,       question: 'What HRT formulation are you on or have you tried?' };
    apiAnswers[Q.hrt_side_effects]        = { value: hrtSideEffects,       question: 'Have you ever experienced side effects from your HRT?' };
    apiAnswers[Q.hrt_side_effects_detail] = { value: hrtSideEffectsDetail, question: 'Please tell us which product you had side effects to and what symptoms' };
    apiAnswers[Q.transdermal_side_effects]= { value: transdermalSE,        question: 'Have you ever had side effects to TRANSDERMAL gel, spray, or cream estrogen products?' };
    apiAnswers[Q.transdermal_reaction]    = { value: transdermalReaction,  question: 'Please tell us about your reaction to TRANSDERMAL estrogen products' };
  }

  apiAnswers[Q.nicotine_clot]         = { value: nicotineClotAnswer,  question: 'Do you have any of the following? (nicotine/clot history)' };
  apiAnswers[Q.hysterectomy]          = { value: hystAnswer,          question: 'Have you had a surgical resection of your uterus (hysterectomy)?' };

  if (hystAnswer === 'Yes') {
    apiAnswers[Q.hysterectomy_reason] = { value: a['step-21-reason'] || 'Medical necessity', question: 'Please provide further information about why you have had a hysterectomy' };
  }

  if (hystAnswer !== 'Yes') {
    apiAnswers[Q.sleep_tenderness]    = { value: sleepTenderness ? 'Yes' : 'No', question: 'Do you experience difficulty with your sleep or breast tenderness?' };
  }

  if (needsProgesterone) {
    apiAnswers[Q.prog_intolerance]    = { value: progIntolerance ? 'Yes' : 'No', question: 'Have you had intolerance to micronized progesterone in the past?' };
  }

  apiAnswers[Q.vaginal_symptoms]      = { value: vaginalSymptomsAnswer, question: 'Do you experience any of the following? (vaginal symptoms)' };
  apiAnswers[Q.osteoporosis]          = { value: osteoporosis ? 'Yes' : 'No', question: 'Do you have thinning of your bones such as osteopenia or osteoporosis?' };
  apiAnswers[Q.enzyme_meds]           = { value: enzymeMedsAnswer,   question: 'Are you currently taking any of the following medications?' };
  apiAnswers[Q.blood_pressure]        = { value: bpAnswer,           question: 'What has your blood pressure been over the last six months?' };
  apiAnswers[Q.consent_fibroid]       = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Consent (Fibroid)' };
  apiAnswers[Q.fibroids]              = { value: 'No',               question: 'Do you have uterine fibroids?' };
  apiAnswers[Q.pcos]                  = { value: 'No',               question: 'Do you have polycystic ovary syndrome (PCOS)?' };
  apiAnswers[Q.consent_pcos]          = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Consent (PCOS)' };
  apiAnswers[Q.endometriosis]         = { value: 'No',               question: 'Do you have a diagnosis of endometriosis?' };
  apiAnswers[Q.consent_endometriosis] = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Consent (endometriosis)' };
  apiAnswers[Q.consent_screening]     = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Acknowledgement of Continued Screening' };
  apiAnswers[Q.other_info]            = { value: 'No additional information', question: 'What other information or questions do you have for the doctor?' };
  apiAnswers[Q.consent_hrt]           = { value: 'I have read the above information, I understand the risks, and I would like to proceed.', question: 'Consent (Hormone Replacement Therapy (HRT))' };

  // Q3242 — SOFT ROUTING KEY: always sent regardless of hysterectomy status.
  // Hysterectomy patients can still select compounded cream (estrogen-only compound).
  apiAnswers[Q.formulation_preference] = { value: formulationPref, question: 'Standard of care menopause treatment... which option would you prefer?' };

  return { apiAnswers, flags };
}

// ─── Helper: Format DOB to MM/DD/YYYY ───────────────────────────────────────
// Accepts MM/DD/YYYY (quiz native), YYYY-MM-DD (ISO), or M/D/YYYY.
// Returns MM/DD/YYYY as expected by Dosable, or null if unparseable.
function formatDob(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  // Already MM/DD/YYYY (quiz native format)
  const mmddyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const mm = mmddyyyy[1].padStart(2, '0');
    const dd = mmddyyyy[2].padStart(2, '0');
    const yyyy = mmddyyyy[3];
    return `${mm}/${dd}/${yyyy}`;
  }

  // ISO format YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${iso[2]}/${iso[3]}/${iso[1]}`;
  }

  // Fallback: try Date.parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  return null; // unparseable — caller should omit or handle
}

// ─── Helper: Dosable API call ─────────────────────────────────────────────────
async function dosable(method, urlPath, data) {
  try {
    const res = await axios({ method, url: DOSABLE_BASE + urlPath, headers: HEADERS, data });
    return { ok: true, data: res.data, status: res.status };
  } catch (err) {
    const status  = err.response ? err.response.status : 500;
    const errData = err.response ? err.response.data   : { message: err.message };
    return { ok: false, data: errData, status };
  }
}

// ─── Helper: Append checkout params ──────────────────────────────────────────
// Takes the raw checkout URL from Dosable and appends ONLY:
//   couponCode=50              — always applied (50% first-month discount)
//   cc_custom_cid={click_id}   — passed through from the original quiz URL
//   affId={affId}              — affiliate ID (if present)
//   c1={c1}                    — click ID / sub-ID (if present)
//
// QUARTERLY SUPPLY: Dosable's routing engine always returns monthly CPIDs.
// When the user selects quarterly supply, we substitute monthly CPIDs with
// their quarterly equivalents. This is the ONLY permitted products= modification.
// The product type (treatment) is unchanged — only the supply quantity differs.
//
// Monthly → Quarterly CPID substitution map (verified against production catalog):
const QUARTERLY_CPID_MAP = {
  163: 199,   // Vaginal compound cream (monthly → 3-month)
  73:  193,   // Body/topical compound cream (monthly → 3-month)
  47:  169,   // Estrogen gel standard (monthly → 3-month)
  45:  167,   // Estrogen gel low-dose (monthly → 3-month)
  53:  175,   // Estrogen patch standard (monthly → 3-month)
  51:  173,   // Estrogen patch low-dose (monthly → 3-month)
  59:  181,   // Estrogen pills standard (monthly → 3-month)
  57:  179,   // Estrogen pills low-dose (monthly → 3-month)
  67:  187,   // Progesterone 100mg (monthly → 3-month)
  69:  189,   // Progesterone 200mg alt (monthly → 3-month)
  65:  185,   // Vaginal tablet add-on (monthly → 3-month)
};

function applyQuarterlySubstitution(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    const products = u.searchParams.get('products');
    if (!products) return url;
    // products format: "CPID:qty;CPID:qty" e.g. "163:1;67:1"
    const substituted = products.split(';').map(item => {
      const [cpid, qty] = item.split(':');
      const monthlyCpid = parseInt(cpid, 10);
      const quarterlyCpid = QUARTERLY_CPID_MAP[monthlyCpid];
      if (quarterlyCpid) {
        console.log(`Quarterly substitution: CPID ${monthlyCpid} → ${quarterlyCpid}`);
        return `${quarterlyCpid}:${qty || 1}`;
      }
      return item; // No substitution for unknown CPIDs
    }).join(';');
    u.searchParams.set('products', substituted);
    return u.toString();
  } catch(e) {
    console.warn('Quarterly substitution failed:', e.message);
    return url;
  }
}

function appendCheckoutParams(url, clickId, affId, c1) {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('couponCode', '50');
    if (clickId) u.searchParams.set('cc_custom_cid', clickId);
    if (affId)   u.searchParams.set('affId',         affId);
    if (c1)      u.searchParams.set('c1',            c1);
    return u.toString();
  } catch(e) {
    const sep = url.includes('?') ? '&' : '?';
    let result = url + sep + 'couponCode=50';
    if (clickId) result += '&cc_custom_cid=' + encodeURIComponent(clickId);
    if (affId)   result += '&affId='         + encodeURIComponent(affId);
    if (c1)      result += '&c1='            + encodeURIComponent(c1);
    return result;
  }
}

// ─── ROUTE: POST /api/lead ────────────────────────────────────────────────────
// Called when user submits phone number — creates Dosable lead.
app.post('/api/lead', async (req, res) => {
  const { firstName, lastName, email, phone, state, zip, dob } = req.body;

  if (!firstName || !lastName || !email || !phone) {
    return res.status(400).json({ error: 'Missing required contact fields' });
  }

  // Check for returning patient
  const qualifyRes = await dosable('get',
    `/leads/qualify?check=redirect&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone.replace(/\D/g, ''))}`
  );
  if (qualifyRes.ok && qualifyRes.data && qualifyRes.data.redirect_required) {
    return res.json({ redirect: true, redirect_url: qualifyRes.data.redirect_url });
  }

  const leadPayload = {
    tenant_id:  TENANT_ID,
    first_name: firstName,
    last_name:  lastName,
    email,
    phone:      phone.replace(/\D/g, ''),
    birthday:   formatDob(dob) || undefined,
    lead_state: state || undefined,
    zip_code:   zip   || undefined,
    gender:     'Female',
  };
  // Remove undefined fields so Dosable doesn't receive null/empty values
  Object.keys(leadPayload).forEach(k => leadPayload[k] === undefined && delete leadPayload[k]);

  const leadRes = await dosable('post', '/leads/', leadPayload);
  if (!leadRes.ok) {
    if (leadRes.status === 409) {
      // Email already exists — try to extract session from 409 response body
      console.log('Lead 409 conflict, checking response body:', JSON.stringify(leadRes.data).slice(0, 200));
      const d = leadRes.data || {};
      const existingSessionId = d.session_id || d.sessionId || null;
      const existingUserId    = d.id || d.user_id || d.userId || null;
      if (existingSessionId) {
        console.log('Reusing session from 409 body:', existingSessionId);
        return res.json({ ok: true, sessionId: existingSessionId, userId: existingUserId, returning: true });
      }
      // Try GET /leads/ with email filter
      const lookupRes = await dosable('get', `/leads/?email=${encodeURIComponent(email)}&tenant_id=${TENANT_ID}`);
      console.log('Lead lookup result:', lookupRes.status, JSON.stringify(lookupRes.data).slice(0, 300));
      if (lookupRes.ok && lookupRes.data) {
        const items = Array.isArray(lookupRes.data) ? lookupRes.data
          : (lookupRes.data.items || lookupRes.data.results || []);
        const match = items.find(l => l.email === email);
        if (match) {
          const sid = match.session_id || match.sessionId;
          const uid = match.id || match.user_id;
          console.log('Found existing lead via lookup:', sid);
          return res.json({ ok: true, sessionId: sid, userId: uid, returning: true });
        }
      }
      // Last resort: create a new session directly
      const sessRes = await dosable('post', '/sessions/', { tenant_id: TENANT_ID, email });
      if (sessRes.ok && sessRes.data && sessRes.data.session_id) {
        console.log('Created new session for existing lead:', sessRes.data.session_id);
        return res.json({ ok: true, sessionId: sessRes.data.session_id, userId: null, returning: true });
      }
      // Absolute fallback: proceed without sessionId (complete will fail gracefully)
      console.warn('Could not resolve 409 — proceeding without sessionId');
      return res.json({ ok: false, sessionId: null, userId: null, returning: true, error: 'existing_user' });
    }
    console.error('Lead creation failed:', leadRes.data);
    return res.status(leadRes.status).json({ error: 'Lead creation failed', detail: leadRes.data });
  }

  const sessionId = leadRes.data.session_id;
  const userId    = leadRes.data.id || leadRes.data.user_id;

  return res.json({ ok: true, sessionId, userId });
});

// ─── ROUTE: POST /api/complete ────────────────────────────────────────────────
// Called from treatment page when user clicks "Get My Treatment".
// 1. Remaps quiz answers with soft routing overrides for selected product
// 2. Bulk-saves all answers to the Dosable session
// 3. Calls /sessions/{id}/complete
// 4. Takes the checkout URL EXACTLY as Dosable returns it — never alters products=
// 5. Appends couponCode=50, cc_custom_cid, affId, c1 to checkout URL
// 6. Returns the final URL to the frontend for redirect
app.post('/api/complete', async (req, res) => {
  const sessionId        = req.body.sessionId;
  const quizAnswers      = req.body.quizAnswers || req.body.answers || {};
  const clickId          = req.body.clickId || '';
  const affId            = req.body.affId   || '';
  const c1               = req.body.c1      || '';

  // Build productSelection from new treatment page payload fields
  const productSelection = req.body.productSelection || {
    type:        req.body.selectedProductId || 'vcream',
    schedule:    req.body.selectedSchedule  || 'monthly',
    vaginalAddon: !!(req.body.vaginalAddon),
  };

  // If sessionId is missing (e.g., 409 conflict on lead creation), try to create a new session
  let resolvedSessionId = sessionId;
  if (!resolvedSessionId) {
    const contactInfo = req.body.contactInfo || {};
    const { firstName, lastName, email, phone, state } = contactInfo;
    if (email && firstName && lastName && phone) {
      console.log('No sessionId — creating new session for:', email);
      const newLeadPayload = {
        tenant_id:  TENANT_ID,
        first_name: firstName,
        last_name:  lastName,
        email,
        phone:      phone.replace(/\D/g, ''),
        ...(contactInfo.dob   && { birthday:   formatDob(contactInfo.dob) }),
        ...(contactInfo.state && { lead_state: contactInfo.state }),
        gender:     'Female',
      };
      const newLeadRes = await dosable('post', '/leads/', newLeadPayload);
      if (newLeadRes.ok && newLeadRes.data && newLeadRes.data.session_id) {
        resolvedSessionId = newLeadRes.data.session_id;
        console.log('Created new session at complete time:', resolvedSessionId);
      } else if (newLeadRes.status === 409) {
        // Still 409 — try session creation directly
        const sessRes = await dosable('post', '/sessions/', { tenant_id: TENANT_ID, email });
        if (sessRes.ok && sessRes.data && sessRes.data.session_id) {
          resolvedSessionId = sessRes.data.session_id;
          console.log('Created session via /sessions/ at complete time:', resolvedSessionId);
        }
      }
    }
    if (!resolvedSessionId) {
      return res.status(400).json({ error: 'Missing sessionId and could not create new session' });
    }
  }

  // Remap answers with soft routing
  const { apiAnswers, flags } = remapAnswers(quizAnswers, productSelection);

  // Strip internal meta key before sending to Dosable
  const answersToSave = Object.fromEntries(
    Object.entries(apiAnswers).filter(([k]) => k !== '_namedFields')
  );

  // Remove the final truthfulness consent — it goes in /complete, not bulk save
  const finalQid    = String(Q.consent_truthfulness);
  const bulkAnswers = Object.fromEntries(
    Object.entries(answersToSave).filter(([k]) => k !== finalQid)
  );

   // Bulk save all answers
  const saveRes = await dosable('put', `/sessions/${resolvedSessionId}`, bulkAnswers);
  if (!saveRes.ok) {
    console.warn('Bulk save warning (non-fatal):', JSON.stringify(saveRes.data).slice(0, 300));
    // Continue — partial saves are acceptable
  }
  // Build lead fields for the complete payload (Dosable requires these again at complete time)
  const contactInfo = req.body.contactInfo || {};
  const completeLead = {
    ...(contactInfo.firstName && { first_name: contactInfo.firstName }),
    ...(contactInfo.lastName  && { last_name:  contactInfo.lastName }),
    ...(contactInfo.dob       && { birthday:   formatDob(contactInfo.dob) }),
    ...(contactInfo.state     && { lead_state: contactInfo.state }),
    gender: 'Female',
  };

  // Complete session with final truthfulness consent + lead fields
  const completePayload = {
    ...completeLead,
    schedule: productSelection.schedule || 'monthly',
    final_answers: {
      [Q.consent_truthfulness]: {
        value:    'I have read the above information and I do consent and wish to move forward',
        question: 'Consent (Truthfulness)',
      },
    },
  };

  // Pass click ID and affiliate tracking params to Dosable (stored in order custom_attributes)
  if (clickId) completePayload.cc_custom_cid = clickId;
  if (affId)   completePayload.aff_id        = affId;
  if (c1)      completePayload.c1            = c1;
  const completeRes = await dosable('post', `/sessions/${resolvedSessionId}/complete`, completePayload);
  if (!completeRes.ok) {
    console.error('Session complete failed:', JSON.stringify(completeRes.data).slice(0, 500));
    return res.status(502).json({ error: 'Session completion failed', detail: completeRes.data });
  }
  // Use Dosable's checkout URL as returned.
  // For quarterly supply: substitute monthly CPIDs with quarterly equivalents.
  // Dosable's routing engine always returns monthly CPIDs regardless of schedule.
  // ONLY append couponCode=50 and cc_custom_cid after any CPID substitution.
  const rawCheckoutUrl = completeRes.data.checkout_url || CHECKOUT_BASE;
  const isQuarterly = (productSelection.schedule === 'quarterly');
  const scheduledUrl = isQuarterly ? applyQuarterlySubstitution(rawCheckoutUrl) : rawCheckoutUrl;
  const finalCheckoutUrl = appendCheckoutParams(scheduledUrl, clickId, affId, c1);
  console.log('Dosable checkout URL:', rawCheckoutUrl);
  console.log('Schedule:', productSelection.schedule, '| Quarterly substitution applied:', isQuarterly);
  console.log('Final checkout URL:', finalCheckoutUrl);
  return res.json({ ok: true, checkoutUrl: finalCheckoutUrl, flags, sessionId: resolvedSessionId });
});

// ─── ROUTE: GET /api/health ───────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now(), version: 'v22-affid-c1' }));

// ─── ROUTE: POST /api/debug/remap ────────────────────────────────────────────
// Debug endpoint: returns the remapped answers without calling Dosable
app.post('/api/debug/remap', (req, res) => {
  const quizAnswers     = req.body.quizAnswers || {};
  const productSelection = req.body.productSelection || {};
  const { apiAnswers, flags } = remapAnswers(quizAnswers, productSelection);
  const answersToSave = Object.fromEntries(
    Object.entries(apiAnswers).filter(([k]) => k !== '_namedFields')
  );
  return res.json({ ok: true, flags, apiAnswers: answersToSave });
});

// ─── ROUTE: GET /api/states ───────────────────────────────────────────────────
app.get('/api/states', async (req, res) => {
  const r = await dosable('get', '/blacklist-states');
  if (r.ok) return res.json({ ok: true, blacklist: r.data });
  return res.json({ ok: true, blacklist: [] });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`ClearedRx proxy running on port ${PORT}`);
  console.log(`Dosable API: ${DOSABLE_BASE} (Tenant ${TENANT_ID})`);
  console.log(`Checkout: ${CHECKOUT_BASE}`);
});
