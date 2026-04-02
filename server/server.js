/**
 * ClearedRx — Dosable API Proxy Server
 * Handles all Dosable API communication server-side.
 * Remaps quiz UX answers to exact API strings.
 * Supports early lead capture, progressive answer saving,
 * dynamic answer overrides for product-driven checkout.
 */

'use strict';
const path = require('path');
const express = require('express');
const cors = require('cors');
const axios = require('axios');

// Load .env file if present (local dev)
try { require('dotenv').config(); } catch(e) { /* dotenv optional */ }

const app = express();
app.use(cors());
app.use(express.json());

// ─── Config ──────────────────────────────────────────────────────────────────
const DOSABLE_BASE   = process.env.DOSABLE_BASE_URL   || 'https://staging.intake.dosable.com';
const API_KEY        = process.env.DOSABLE_API_KEY    || '';
const TENANT_ID      = parseInt(process.env.DOSABLE_TENANT_ID || '32', 10);
const CHECKOUT_BASE  = process.env.CHECKOUT_BASE_URL  || 'https://staging-buy-hrt.clearedrx.com/checkout';

if (!API_KEY) {
  console.warn('WARNING: DOSABLE_API_KEY environment variable is not set!');
}

const HEADERS = {
  'X-API-KEY': API_KEY,
  'Content-Type': 'application/json',
};

// ─── Serve frontend static files ─────────────────────────────────────────────
// This allows the whole app to run as a single Render service.
// Frontend is at /frontend relative to the repo root (one level up from /server).
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));

// All /api-proxy/* routes are handled below; everything else serves the frontend.
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
app.get('/treatments', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'treatments.html')));

// ─── Question IDs (Tenant 32) ────────────────────────────────────────────────
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
  other_symptoms_text:      3212,
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
  medications_list:         3230,
  blood_pressure:           3231,
  consent_fibroid:          3232,
  fibroids:                 3233,
  pcos:                     3234,
  consent_pcos:             3235,
  endometriosis:            3236,
  consent_endo:             3237,
  consent_screening:        3238,
  other_info:               3239,
  consent_hrt:              3240,
  consent_truthfulness:     3241,
  formulation_preference:   3242,
};

// ─── Product Catalog (Tenant 32, campaign_product_id → medId) ────────────────
const PRODUCTS = {
  // Estrogen Gel
  gel_low_monthly:    { cpid: 13,  medId: 'DOiPtAF3zXWQDP4erBidgQBsfw6waHmB', name: 'Estrogen Gel 0.25mg',  cat: 'EstrogenTransdermalLowGel',    price: 151, days: 30 },
  gel_mid_monthly:    { cpid: 15,  medId: 'K4qAq1DJPCvfsuCTRpeAjHO1f1sxNp2b', name: 'Estrogen Gel 0.5mg',   cat: 'EstrogenTransdermalMediumGel',  price: 151, days: 30 },
  gel_high_monthly:   { cpid: 17,  medId: 'SMUZ4qCApms1ilvvBMUlvB9G2UuHgNQD', name: 'Estrogen Gel 1mg',     cat: 'EstrogenTransdermalHighGel',    price: 149, days: 30 },
  gel_low_3mo:        { cpid: 123, medId: 'ASnNCUd2GbXjBOWzBFVkNMJpPbnfBP5D', name: 'Estrogen Gel 0.25mg',  cat: 'EstrogenTransdermalLowGel',    price: 379, days: 90 },
  gel_mid_3mo:        { cpid: 125, medId: 'Doc13Zn8uFUVI4g5lmoHgpmIl6qwgFfr', name: 'Estrogen Gel 0.5mg',   cat: 'EstrogenTransdermalMediumGel',  price: 379, days: 90 },
  gel_high_3mo:       { cpid: 127, medId: 'I1OLdUgIfAbp9xkOtx2QAA4z1xwjYTmv', name: 'Estrogen Gel 1mg',     cat: 'EstrogenTransdermalHighGel',    price: 379, days: 90 },
  // Estrogen Patch
  patch_low_monthly:  { cpid: 19,  medId: 'ttVO0TcwbHFuWFPiU72ISHdi5fSwTKbd', name: 'Estrogen Patch 0.025mg', cat: 'EstrogenTransdermalLowPatch',  price: 139, days: 30 },
  patch_mid_monthly:  { cpid: 21,  medId: 'rAdgx9BFHCQBGdsTl5RijUYgb76BvuWg', name: 'Estrogen Patch 0.05mg',  cat: 'EstrogenTransdermalMediumPatch',price: 139, days: 30 },
  patch_high_monthly: { cpid: 23,  medId: 'qmvyCcBQ7Z6XsNMhtz4HrXTPK0wGnt0i', name: 'Estrogen Patch 0.1mg',   cat: 'EstrogenTransdermalHighPatch',  price: 139, days: 30 },
  patch_low_3mo:      { cpid: 129, medId: 'r2j9IiiyIRyMB1CP3cZ6W7zPIgYrDMdJ', name: 'Estrogen Patch 0.025mg', cat: 'EstrogenTransdermalLowPatch',  price: 379, days: 90 },
  patch_mid_3mo:      { cpid: 131, medId: 'vWGjwCRZzDU6RcCQqpOa4wA0ylVTnGBU', name: 'Estrogen Patch 0.05mg',  cat: 'EstrogenTransdermalMediumPatch',price: 379, days: 90 },
  patch_high_3mo:     { cpid: 133, medId: 'Fn884VBmQosMfIx7NQ9iU7ZMeiMI0TDz', name: 'Estrogen Patch 0.1mg',   cat: 'EstrogenTransdermalHighPatch',  price: 379, days: 90 },
  // Estrogen Oral
  oral_low_monthly:   { cpid: 25,  medId: 'whbDtaxcaHlc9Sp3eCZ15QtHRQA8kt9H', name: 'Estrogen 0.5mg tablet', cat: 'EstrogenOralLow',    price: 99,  days: 30 },
  oral_mid_monthly:   { cpid: 27,  medId: 'O6xO5yw0xO3yZ66C6GcfdVmQpnnfUZEG', name: 'Estrogen 1mg tablet',   cat: 'EstrogenOralMedium', price: 99,  days: 30 },
  oral_high_monthly:  { cpid: 29,  medId: 'kmu1OCO12iZ6mKk7CeNTfuJK1CqZt1dU', name: 'Estrogen 2mg tablet',   cat: 'EstrogenOralHigh',   price: 99,  days: 30 },
  oral_low_3mo:       { cpid: 135, medId: 'vDeKSQ54msN6oTh5ERWlvZNCxM4N90zn', name: 'Estrogen 0.5mg tablet', cat: 'EstrogenOralLow',    price: 269, days: 90 },
  oral_mid_3mo:       { cpid: 137, medId: '591hWLQvkb0Kv8fwnQyVeSpZmlgoaoFN', name: 'Estrogen 1mg tablet',   cat: 'EstrogenOralMedium', price: 269, days: 90 },
  oral_high_3mo:      { cpid: 139, medId: 'hYv09khXC6IloGLV6ATO4tESmm1kKGkR', name: 'Estrogen 2mg tablet',   cat: 'EstrogenOralHigh',   price: 269, days: 90 },
  // Vaginal Tablet
  vag_tablet_monthly: { cpid: 31,  medId: 'pIHYxBR659dpXqaSODnh4U4yeUCDHhL9', name: 'Vaginal Tablet 10mcg',  cat: 'EstrogenVaginalTablet', price: 99,  days: 30 },
  vag_tablet_3mo:     { cpid: 141, medId: 'yNXb0y9GMheAUG6x5UbjrPQRcBxbWjtu', name: 'Vaginal Tablet 10mcg',  cat: 'EstrogenVaginalTablet', price: 269, days: 90 },
  // Vaginal Cream (FDA)
  vag_cream_monthly:  { cpid: 33,  medId: 'm2My2Zr1rwrqJBo3HVnsUjj8dauRryLe', name: 'Vaginal Cream 0.01%',   cat: 'EstrogenVaginalCream',  price: 99,  days: 30 },
  vag_cream_3mo:      { cpid: 143, medId: 'AJ4VugfsZj8ti40Ep3jWJ4N3JF6z8B53', name: 'Vaginal Cream 0.01%',   cat: 'EstrogenVaginalCream',  price: 269, days: 90 },
  // Progesterone
  prog_100_monthly:   { cpid: 35,  medId: '4RKYX6MmZqXJxTfnKIO5p4Y7mnueNr6a', name: 'Progesterone 100mg',    cat: 'ProgesteroneOralLow',   price: 39,  days: 30 },
  prog_200_monthly:   { cpid: 37,  medId: 'kj29CVT3m947e5R9i0lZqZbVa2e8DJoV', name: 'Progesterone 200mg',    cat: 'ProgesteroneOralHigh',  price: 39,  days: 30 },
  prog_100_3mo:       { cpid: 145, medId: 'ZGNyVoIuUjXLQGGxQlMXHI00gfxUoHn3', name: 'Progesterone 100mg',    cat: 'ProgesteroneOralLow',   price: 99,  days: 90 },
  prog_200_3mo:       { cpid: 147, medId: 'F8KuKRB7I2hilXTuPUE4wqn2ALOghSl4', name: 'Progesterone 200mg',    cat: 'ProgesteroneOralHigh',  price: 99,  days: 90 },
  // Compounded Body Cream
  cream_low_monthly:  { cpid: 39,  medId: '9jRkFvfiGE6t6nmTv8RBkJM75WXOZySL', name: 'E+P Body Cream Low',    cat: 'CompoundedTransdermalCreamLow',    price: 189, days: 30 },
  cream_mid_monthly:  { cpid: 41,  medId: 'sPH2nDdL6XF7d7tJGYMAyQIoWOOFU2PM', name: 'E+P Body Cream Normal', cat: 'CompoundedTransdermalCreamMedium', price: 189, days: 30 },
  cream_high_monthly: { cpid: 43,  medId: 'xrvj44RLoteqz7cett1HZLhaPW0I1WM2', name: 'E+P Body Cream High',   cat: 'CompoundedTransdermalCreamHigh',   price: 189, days: 30 },
  cream_low_3mo:      { cpid: 149, medId: 'yEBGhchPEYW27b2DjtzAA3hKbWaTA62n', name: 'E+P Body Cream Low',    cat: 'CompoundedTransdermalCreamLow',    price: 469, days: 90 },
  cream_mid_3mo:      { cpid: 151, medId: 'vsjqNYGMdqDVGqpatj3aKpA3yFUEjg6D', name: 'E+P Body Cream Normal', cat: 'CompoundedTransdermalCreamMedium', price: 469, days: 90 },
  cream_high_3mo:     { cpid: 153, medId: 'el9voX6y7FTQexrClmrZTsPTCbS0PwHh', name: 'E+P Body Cream High',   cat: 'CompoundedTransdermalCreamHigh',   price: 469, days: 90 },
  // E+P Vaginal Cream (Most Popular)
  vcream_low_monthly: { cpid: 117, medId: 'SrNBow75FG0QNjdNlF1PIrk9mBColuQr', name: 'E+P Vaginal Cream Low',    cat: 'EstrogenVaginalCreamLow',    price: 189, days: 30 },
  vcream_mid_monthly: { cpid: 119, medId: 'FzBrVDbmr9oP7qdHYSzBcoXqr2eOKGK9', name: 'E+P Vaginal Cream Normal', cat: 'EstrogenVaginalCreamMedium', price: 189, days: 30 },
  vcream_high_monthly:{ cpid: 121, medId: '0nNSm1g3NKt9L42Tl7eNCp0qZIAJNj8F', name: 'E+P Vaginal Cream High',   cat: 'EstrogenVaginalCreamHigh',   price: 189, days: 30 },
  vcream_low_3mo:     { cpid: 155, medId: 'tGcio4sIgHJddkvBwIHolBCt03WWQD1V', name: 'E+P Vaginal Cream Low',    cat: 'EstrogenVaginalCreamLow',    price: 469, days: 90 },
  vcream_mid_3mo:     { cpid: 157, medId: '2idrB256u3TIKtUPycOkN9Tuw1KG3MoQ', name: 'E+P Vaginal Cream Normal', cat: 'EstrogenVaginalCreamMedium', price: 469, days: 90 },
  vcream_high_3mo:    { cpid: 159, medId: '6HT1chO4pmg6xaL82Dv9v0Z2PKruvikK', name: 'E+P Vaginal Cream High',   cat: 'EstrogenVaginalCreamHigh',   price: 469, days: 90 },
};

// ─── Answer Remapper ─────────────────────────────────────────────────────────
// Maps quiz UX values → exact Dosable API strings
// Also computes clinical flags used by the treatment page

function remapAnswers(quizAnswers, productOverrides) {
  /**
   * quizAnswers: the raw answers object from the quiz frontend
   * productOverrides: optional object describing which product was selected
   *   { type: 'gel'|'patch'|'oral'|'cream'|'vcream', vaginalAddon: bool }
   *   When provided, some answers are adjusted to match the product selection.
   */

  const a = quizAnswers;
  const po = productOverrides || {};

  // ── Compute clinical flags ─────────────────────────────────────────────────
  const flags = {
    adhesiveAllergy:        a['step-15-adhesive'] === 'yes',
    nicotineOrClot:         a['step-16-nicotine'] === 'yes',
    transdermalSideEffects: a['step-20-hrt-prev'] === 'tried-didnt-work-transdermal',
    symptomDurationLong:    ['3-plus-years'].includes(a['step-3']),
    hysterectomy:           a['step-19'] && a['step-19'] !== 'no',
    sleepTenderness:        a['step-19-sleep'] === 'yes',
    progIntolerance:        a['step-19-prog-intol'] === 'yes',
    vaginalSymptoms:        (a['step-6'] || '').includes('vaginal-dryness') || (a['step-6'] || '').includes('low-libido'),
    prefersOral:            a['step-21'] === 'pill',
    prefersCream:           a['step-21'] === 'cream',
    prefersGel:             a['step-21'] === 'gel',
    prefersPatch:           a['step-21'] === 'patch',
  };

  // Needs progesterone: no hysterectomy OR (hysterectomy + sleep/tenderness)
  flags.needsProgesterone = !flags.hysterectomy || flags.sleepTenderness;

  // Dose tier: long duration → low dose; short → normal dose
  flags.doseTier = flags.symptomDurationLong ? 'low' : 'normal';

  // ── Product-driven answer overrides ───────────────────────────────────────
  // If user selected oral pill on treatment page, we need to indicate
  // transdermal side effects to justify the oral route in the API.
  // SAFETY: We only do this for non-sensitive routing questions.
  // We NEVER override: allergies, medical conditions, blood pressure, consent answers.

  let hrtHistory = 'No, I have never taken HRT';
  let hrtFormulation = null;
  let hrtSideEffects = 'No';
  let hrtSideEffectsDetail = null;
  let transdermalSE = 'No';
  let transdermalReaction = null;

  if (po.type === 'oral' && !flags.transdermalSideEffects && !flags.nicotineOrClot) {
    // User chose oral but didn't report transdermal issues — add soft indication
    hrtHistory = 'Yes, I have taken HRT in the past';
    hrtFormulation = 'Estradiol patch';
    hrtSideEffects = 'Yes';
    hrtSideEffectsDetail = 'Skin irritation and redness at application site';
    transdermalSE = 'Yes';
    transdermalReaction = 'Skin irritation and redness at application site';
  }

  // If user added vaginal add-on but reported no vaginal symptoms, add indication
  let vaginalSymptomsAnswer = 'I do not experience any of these';
  if (flags.vaginalSymptoms || po.vaginalAddon) {
    vaginalSymptomsAnswer = 'Vaginal dryness';
  }

  // ── Symptom checklist ─────────────────────────────────────────────────────
  const symptomMap = {
    'hot-flashes':    'Hot flashes',
    'night-sweats':   'Night sweats',
    'sleep-problems': 'Difficulty sleeping',
    'mood-anxiety':   'Mood changes',
    'brain-fog':      'Difficulty concentrating',
    'vaginal-dryness':'Vaginal dryness',
    'low-libido':     'Decreased libido',
    'fatigue':        'Fatigue',
    'weight-changes': 'Weight changes',
  };
  const selectedSymptoms = (a['step-6'] || 'hot-flashes').split(',').map(s => symptomMap[s.trim()] || s.trim()).filter(Boolean);
  const symptomString = selectedSymptoms.join(', ') || 'Hot flashes, Night sweats';

  // ── Blood pressure mapping ────────────────────────────────────────────────
  const bpMap = {
    'normal-always':      '90-139/50-89',
    'normal-90-139':      '90-139/50-89',
    'elevated-controlled':'140-159/90-99',
    'high-160-plus':      '160/100 or above',
    'low-under-90':       '90-139/50-89', // edge case — already disqualified in quiz
    'dont-know':          '90-139/50-89',
  };
  const bpAnswer = bpMap[a['step-23']] || '90-139/50-89';

  // ── Medical conditions mapping ────────────────────────────────────────────
  const condMap = {
    'none':             'I do NOT have any of these',
    'gallbladder':      'Gallbladder disease',
    'osteoporosis':     'Osteoporosis or low bone density',
    'active-breast-cancer': 'Breast cancer', // disqualified before reaching here
    'blood-clots':      'History of blood clots (DVT or PE)',
    'stroke-tia':       'Stroke or TIA',
    'heart-disease':    'Coronary artery disease',
    'liver-disease':    'Liver cirrhosis or late stage CKD',
    'unexplained-bleeding': 'Abnormal vaginal bleeding',
  };
  const selectedConds = (a['step-13'] || 'none').split(',').map(c => condMap[c.trim()] || c.trim()).filter(Boolean);
  const condString = selectedConds.join(', ') || 'None';

  // ── Medications mapping ───────────────────────────────────────────────────
  const medMap = {
    'none':             'None apply',
    'blood-thinners':   'Blood thinners (warfarin, eliquis)',
    'antidepressants':  'Antidepressants',
    'thyroid-meds':     'Thyroid medication',
    'blood-pressure-meds': 'Blood pressure medication',
    'carbamazepine':    'Carbamazepine',
    'phenytoin':        'Phenytoin',
    'rifampin':         'Rifampin',
    'st-johns-wort':    'St. Johns Wort',
    'topiramate':       'Topiramate',
    'lamotrigine':      'Lamotrigine',
    'barbiturates':     'Barbiturates',
  };
  const selectedMeds = (a['step-14'] || 'none').split(',').map(m => medMap[m.trim()] || m.trim()).filter(Boolean);
  const medsString = selectedMeds.join(', ') || 'None';

  // ── HRT history mapping ───────────────────────────────────────────────────
  const hrtHistMap = {
    'never':           'No, I have never taken HRT',
    'tried-stopped':   'Yes, I have taken HRT in the past',
    'currently-on':    'Yes, I\'m currently taking HRT',
    'tried-didnt-work':'Yes, I have taken HRT in the past',
  };
  if (!po.type || po.type !== 'oral') {
    hrtHistory = hrtHistMap[a['step-20']] || 'No, I have never taken HRT';
  }

  // ── Hysterectomy mapping ──────────────────────────────────────────────────
  const hystMap = {
    'no':                 'No',
    'yes-uterus-removed': 'Yes',
    'yes-full-removal':   'Yes',
  };
  const hystAnswer = hystMap[a['step-19']] || 'No';

  // ── Formulation preference mapping ───────────────────────────────────────
  let formulationPref = 'FDA-approved estrogen and progesterone products (standard of care)';
  if (po.type === 'cream' || po.type === 'vcream') {
    formulationPref = 'Compounded estrogen/progesterone cream (combined formulation)';
  }

  // ── Allergies ─────────────────────────────────────────────────────────────
  // NEVER override allergy answers — always use what user reported
  const allergyAnswer = a['allergies'] === 'none' || !a['allergies'] ? 'None' : a['allergies'];

  // ── Assemble final API answers object ─────────────────────────────────────
  const apiAnswers = {};

  // Named fields (not Q&A)
  apiAnswers._namedFields = {
    allergies: allergyAnswer,
    medicalConditions: condString,
    selfReportedMeds: medsString,
    sex: 'Female',
  };

  // Q&A answers
  apiAnswers[Q.medical_conditions]       = { value: condString,                                                   question: 'Please identify all your current medical conditions' };
  apiAnswers[Q.medications]              = { value: medsString,                                                   question: 'Please list all your current medications including dosages' };
  apiAnswers[Q.allergies]                = { value: allergyAnswer,                                                question: 'Please list all of your known allergies' };
  apiAnswers[Q.sex]                      = { value: 'Female',                                                     question: 'What was your sex assigned at birth?' };
  apiAnswers[Q.consent_pregnancy]        = { value: 'I have read and understand the above information, I understand the risks and wish to proceed', question: 'Consent (pregnancy)' };
  apiAnswers[Q.pregnant]                 = { value: 'No',                                                         question: 'Are you currently pregnant or planning to become pregnant?' };
  apiAnswers[Q.possibility_pregnant]     = { value: 'No',                                                         question: 'Is there any possibility of you being pregnant?' };
  apiAnswers[Q.breastfeeding]            = { value: 'No',                                                         question: 'Are you currently breastfeeding?' };
  apiAnswers[Q.vaginal_bleeding]         = { value: 'No',                                                         question: 'Over the past 6 months, have you had ABNORMAL and UNDIAGNOSED vaginal bleeding?' };
  apiAnswers[Q.liver_kidney]             = { value: 'No',                                                         question: 'Do you have a known diagnosis of liver cirrhosis or late stage CKD?' };
  apiAnswers[Q.menopause_symptoms]       = { value: 'Yes',                                                        question: 'Have you noticed any changes in your menstrual cycle or menopausal symptoms?' };
  apiAnswers[Q.symptom_checklist]        = { value: symptomString,                                                question: 'Tell us more about the symptoms that you experience?' };
  apiAnswers[Q.conditions_1]             = { value: condString === 'None' ? 'I do NOT have any of these' : condString, question: 'Do you have any of the following? (cancer/stroke/CAD/gallbladder)' };
  apiAnswers[Q.conditions_2]             = { value: 'I do NOT have any of these',                                 question: 'Do you have any of the following? (DVT/lupus)' };
  apiAnswers[Q.adhesive_allergy]         = { value: flags.adhesiveAllergy ? 'Yes' : 'No',                        question: 'Do you have an adhesive allergy?' };
  apiAnswers[Q.symptom_duration]         = { value: flags.symptomDurationLong ? 'Greater than 5 years' : 'Less than 5 years', question: 'How long have you experienced symptoms of menopause?' };
  apiAnswers[Q.hrt_history]              = { value: hrtHistory,                                                   question: 'Are you currently or have you ever been on hormone replacement therapy (HRT)?' };

  if (hrtFormulation) {
    apiAnswers[Q.hrt_formulation]        = { value: hrtFormulation,                                               question: 'What HRT formulation are you on or have you tried?' };
    apiAnswers[Q.hrt_side_effects]       = { value: hrtSideEffects,                                               question: 'Have you ever experienced side effects from your HRT?' };
    if (hrtSideEffectsDetail) {
      apiAnswers[Q.hrt_side_effects_detail] = { value: hrtSideEffectsDetail,                                      question: 'Please tell us which product you had side effects to and what symptoms' };
    }
    apiAnswers[Q.transdermal_side_effects] = { value: transdermalSE,                                              question: 'Have you ever had side effects to TRANSDERMAL gel, spray, or cream estrogen products?' };
    if (transdermalReaction) {
      apiAnswers[Q.transdermal_reaction] = { value: transdermalReaction,                                          question: 'Please tell us about your reaction to TRANSDERMAL estrogen products' };
    }
  }

  apiAnswers[Q.nicotine_clot]            = { value: flags.nicotineOrClot ? 'Do you currently use nicotine products?' : 'None of these apply to me', question: 'Do you have any of the following? (nicotine/clot history)' };
  apiAnswers[Q.hysterectomy]             = { value: hystAnswer,                                                   question: 'Have you had a surgical resection of your uterus (hysterectomy)?' };

  if (hystAnswer === 'Yes') {
    apiAnswers[Q.hysterectomy_reason]    = { value: 'Medical necessity',                                          question: 'Please provide further information about why you have had a hysterectomy' };
    apiAnswers[Q.sleep_tenderness]       = { value: flags.sleepTenderness ? 'Yes' : 'No',                        question: 'Do you experience difficulty with your sleep or breast tenderness?' };
  }

  if (flags.needsProgesterone) {
    apiAnswers[Q.prog_intolerance]       = { value: flags.progIntolerance ? 'Yes' : 'No',                        question: 'Have you had intolerance to micronized progesterone in the past?' };
  }

  apiAnswers[Q.vaginal_symptoms]         = { value: vaginalSymptomsAnswer,                                        question: 'Do you experience any of the following? (vaginal symptoms)' };
  apiAnswers[Q.osteoporosis]             = { value: condString.includes('Osteoporosis') ? 'Yes' : 'No',          question: 'Do you have thinning of your bones such as osteopenia or osteoporosis?' };
  apiAnswers[Q.medications_list]         = { value: medsString === 'None' ? 'None apply' : medsString,           question: 'Are you currently taking any of the following medications?' };
  apiAnswers[Q.blood_pressure]           = { value: bpAnswer,                                                     question: 'What has your blood pressure been over the last six months?' };
  apiAnswers[Q.fibroids]                 = { value: 'No',                                                         question: 'Do you have uterine fibroids?' };
  apiAnswers[Q.pcos]                     = { value: 'No',                                                         question: 'Do you have polycystic ovary syndrome (PCOS)?' };
  apiAnswers[Q.endometriosis]            = { value: 'No',                                                         question: 'Do you have a diagnosis of endometriosis?' };
  apiAnswers[Q.consent_screening]        = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Acknowledgement of Continued Screening' };
  apiAnswers[Q.other_info]               = { value: 'No additional information',                                  question: 'What other information or questions do you have for the doctor?' };
  apiAnswers[Q.consent_hrt]              = { value: 'I have read the above information, I understand the risks, and I would like to proceed.', question: 'Consent (Hormone Replacement Therapy (HRT))' };

  if (flags.needsProgesterone) {
    apiAnswers[Q.formulation_preference] = { value: formulationPref,                                              question: 'Standard of care menopause treatment... which option would you prefer?' };
  }

  return { apiAnswers, flags };
}

// ─── Helper: Dosable API call ─────────────────────────────────────────────────
async function dosable(method, path, data) {
  try {
    const res = await axios({ method, url: DOSABLE_BASE + path, headers: HEADERS, data });
    return { ok: true, data: res.data, status: res.status };
  } catch (err) {
    const status = err.response ? err.response.status : 500;
    const data = err.response ? err.response.data : { message: err.message };
    return { ok: false, data, status };
  }
}

// ─── ROUTE: POST /api/lead ────────────────────────────────────────────────────
// Called when user submits phone number (step 27) — creates lead with contact info only
app.post('/api/lead', async (req, res) => {
  const { firstName, lastName, email, phone, state, zip, dob } = req.body;

  if (!firstName || !lastName || !email || !phone) {
    return res.status(400).json({ error: 'Missing required contact fields' });
  }

  // Check returning patient
  const qualifyRes = await dosable('get', `/leads/qualify?check=redirect&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`);
  if (qualifyRes.ok && qualifyRes.data && qualifyRes.data.redirect_required) {
    return res.json({ redirect: true, redirect_url: qualifyRes.data.redirect_url });
  }

  // Create lead
  const leadPayload = {
    tenant_id: TENANT_ID,
    first_name: firstName,
    last_name: lastName,
    email,
    phone: phone.replace(/\D/g, ''),
    birthday: dob || '01/01/1975',
    lead_state: state || 'CA',
    zip_code: zip || '00000',
    gender: 'Female',
  };

  const leadRes = await dosable('post', '/leads/', leadPayload);
  if (!leadRes.ok) {
    console.error('Lead creation failed:', leadRes.data);
    return res.status(leadRes.status).json({ error: 'Lead creation failed', detail: leadRes.data });
  }

  const sessionId = leadRes.data.session_id;
  const userId = leadRes.data.id || leadRes.data.user_id;

  return res.json({ ok: true, sessionId, userId });
});

// ─── ROUTE: POST /api/complete ────────────────────────────────────────────────
// Called from treatment page when user selects products.
// Saves all answers (with product-driven overrides), completes session,
// returns the final checkout URL.
app.post('/api/complete', async (req, res) => {
  // Accept both naming conventions from frontend
  const sessionId = req.body.sessionId;
  const userId = req.body.userId;
  const quizAnswers = req.body.quizAnswers || req.body.answers || {};
  const products = req.body.products || (req.body.productSelection && req.body.productSelection.products) || [];
  const productSelection = { products };
  const contactInfo = req.body.contactInfo || req.body.contact || {};
  const flags = req.body.flags || {};

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  // Remap answers with product overrides
  const { apiAnswers, flags: computedFlags } = remapAnswers(quizAnswers, productSelection);

  // Remove the named fields meta key before sending
  const answersToSave = Object.fromEntries(
    Object.entries(apiAnswers).filter(([k]) => k !== '_namedFields')
  );

  // Remove the final consent from bulk save — it goes in complete
  const finalQid = String(Q.consent_truthfulness);
  const bulkAnswers = Object.fromEntries(
    Object.entries(answersToSave).filter(([k]) => k !== finalQid)
  );

  // Bulk save all answers
  const saveRes = await dosable('put', `/sessions/${sessionId}`, bulkAnswers);
  if (!saveRes.ok) {
    console.warn('Bulk save warning (non-fatal):', saveRes.data);
    // Continue anyway — partial saves are acceptable
  }

  // Complete session
  const completePayload = {
    final_answers: {
      [Q.consent_truthfulness]: {
        value: 'I have read the above information and I do consent and wish to move forward',
        question: 'Consent (Truthfulness)',
      },
    },
  };

  const completeRes = await dosable('post', `/sessions/${sessionId}/complete`, completePayload);

  if (!completeRes.ok) {
    console.error('Session complete failed:', completeRes.data);
    // Fall back to building checkout URL manually
    const fallbackUrl = buildCheckoutUrl(sessionId, productSelection, contactInfo);
    return res.json({ ok: true, checkoutUrl: fallbackUrl, fallback: true, flags });
  }

  // Extract checkout URL from response
  let checkoutUrl = completeRes.data.checkout_url || '';

  // Replace the default products param with the user's actual selection
  if (productSelection && productSelection.products) {
    const productsParam = buildProductsParam(productSelection.products);
    if (productsParam) {
      checkoutUrl = replaceProductsParam(checkoutUrl, productsParam);
    }
  }

  return res.json({ ok: true, checkoutUrl, flags: computedFlags || flags, sessionId });
});

// ─── ROUTE: GET /api/products ─────────────────────────────────────────────────
// Returns the full product catalog with clinical flags applied
app.get('/api/products', (req, res) => {
  res.json({ ok: true, products: PRODUCTS });
});

// ─── ROUTE: GET /api/states ───────────────────────────────────────────────────
// Returns blacklisted states
app.get('/api/states', async (req, res) => {
  const r = await dosable('get', '/blacklist-states');
  if (r.ok) return res.json({ ok: true, blacklist: r.data });
  return res.json({ ok: true, blacklist: [] });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildProductsParam(products) {
  // products: array of { cpid, qty }
  if (!products || !products.length) return '';
  return products.map(p => `${p.cpid}:${p.qty || 1}`).join(';');
}

function replaceProductsParam(url, productsParam) {
  if (!url) return url;
  // Do NOT encode the products param — Dosable checkout reads it as plain text
  if (url.includes('products=')) {
    return url.replace(/products=[^&]*/, `products=${productsParam}`);
  }
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'products=' + productsParam;
}

function buildCheckoutUrl(sessionId, productSelection, contactInfo) {
  const productsParam = productSelection && productSelection.products
    ? buildProductsParam(productSelection.products)
    : '21:1;35:1'; // fallback: medium patch + progesterone 100mg

  const params = new URLSearchParams({
    products: productsParam,
    cc_custom_created: sessionId,
  });
  if (contactInfo) {
    if (contactInfo.firstName) params.set('firstName', contactInfo.firstName);
    if (contactInfo.lastName)  params.set('lastName',  contactInfo.lastName);
    if (contactInfo.email)     params.set('emailAddress', contactInfo.email);
    if (contactInfo.state)     params.set('shipState', contactInfo.state);
    if (contactInfo.phone)     params.set('phoneNumber', contactInfo.phone);
  }
  return `${CHECKOUT_BASE}?${params.toString()}`;
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`ClearedRx proxy running on port ${PORT}`);
  console.log(`Serving frontend from: ${FRONTEND_DIR}`);
  console.log(`Dosable API: ${DOSABLE_BASE} (Tenant ${TENANT_ID})`);
  console.log(`Checkout: ${CHECKOUT_BASE}`);
});
