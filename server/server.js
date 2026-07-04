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

// ─── Global Error Handlers (prevent silent crashes) ───────────────────────────
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});


const express  = require('express');
const axios    = require('axios');
const path     = require('path');
const cors     = require('cors');
const fs       = require('fs');
const { scheduleAbandonCheck, cancelAbandonCheck, stats: abandonStats } = require('./abandon-scheduler');

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
app.use(express.json({ limit: '1mb' }));

// ─── Config ───────────────────────────────────────────────────────────────────
const DOSABLE_BASE  = process.env.DOSABLE_BASE_URL  || 'https://intake.dosable.com';
const TENANT_ID     = parseInt(process.env.DOSABLE_TENANT_ID || '32', 10);
const API_KEY       = process.env.DOSABLE_API_KEY   || '169ded5e60f27843c1e110b34e6791ec3f0e8c9d619bb5cbffbfa1712ec03488';
const CHECKOUT_BASE = process.env.CHECKOUT_BASE_URL || 'https://buy-hrt.clearedrx.com/checkout';
const FRONTEND_DIR  = path.join(__dirname, '..', 'frontend');
const LOG_DIR       = path.join(__dirname, 'logs');
const GOOGLE_SHEET_WEBHOOK = process.env.GOOGLE_SHEET_WEBHOOK || 'https://script.google.com/macros/s/AKfycbw0UrinlGqhdU6E0Zn9RMbRO1Q0glvqzxnSDSomz3cNryAcWLFyluA2txVKyn3G2r9i3A/exec';
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch(e) {}

function logSubmission(version, data) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      v: version,
      email: data.email || '',
      sessionId: data.sessionId || '',
      clickId: data.clickId || '',
      product: data.product || '',
      checkoutUrl: data.checkoutUrl || '',
      state: data.state || '',
    };
    const logFile = path.join(LOG_DIR, 'submissions.jsonl');
    fs.appendFile(logFile, JSON.stringify(entry) + '\n', (err) => {
      if (err) console.warn('Log write failed:', err.message);
    });
  } catch(e) {
    console.warn('logSubmission error:', e.message);
  }
}


// ─── Google Sheet Webhook Logger ──────────────────────────────────────────────
// Fire-and-forget POST to Google Apps Script web app.
// Logs every quiz submission (complete or DQ) with full answer data.
function logToSheet(version, { quizAnswers, contactInfo, apiAnswers, sessionId, clickId, affId, c1, checkoutUrl, productName, lastStep, lastStepName, isDq, dqReason, submissionStatus }) {
  if (!GOOGLE_SHEET_WEBHOOK) return; // silently skip if not configured
  try {
    const a = quizAnswers || {};
    const ci = contactInfo || {};

    // ── Step name map (S1, S1A, etc.) ──
    const STEP_NAMES = {
      1: 'S1', 2: 'S2', 3: 'S3', 4: 'S4', 5: 'S5', 6: 'S6', 7: 'S7', 8: 'S8',
      9: 'S9', 10: 'S10', 11: 'S11', 12: 'S12', 13: 'S13', 14: 'S14', 15: 'S15',
      16: 'S16', 17: 'S17', 18: 'S18', 19: 'S19', 20: 'S20', 21: 'S21',
      22: 'S22', 23: 'S23', 24: 'S24', 25: 'S25', 26: 'S26',
      27: 'S27', 28: 'S28', 29: 'S29', 30: 'S30', 31: 'S31', 32: 'S32',
      33: 'S33', 34: 'S34', 35: 'S35', 36: 'S36', 37: 'S37',
      38: 'S12A', 39: 'S21A', 40: 'S24A', 41: 'S24B', 42: 'S24C',
      43: 'S20A', 46: 'S18B',
    };

    const safe = (v) => (v === undefined || v === null) ? '' : String(v);
    const safeApi = (qid) => {
      if (!apiAnswers || !apiAnswers[qid]) return '';
      const val = apiAnswers[qid].value;
      return Array.isArray(val) ? val.join(', ') : String(val);
    };

    // Compute flags from quiz answers (same logic as frontend/treatments)
    const hyst = (a['step-21'] === 'yes' || a['step-21'] === 'yes-uterus-removed' || a['step-21'] === 'yes-full-removal');
    const needsProg = !hyst;
    const adhesiveFlag = (a['adhesive-allergy'] === 'yes' || a['step-46'] === 'yes' || safe(a['allergies']).toLowerCase().indexOf('adhesive') !== -1);
    const nicotineFlag = (a['step-20'] === 'yes');
    const step16 = safe(a['step-16']);
    const bloodClots = step16.indexOf('blood-clots') !== -1;
    const nicotineOrClot = nicotineFlag || bloodClots;
    const transdermalSe = (a['transdermal-se'] === 'yes' || a['step-25'] === 'yes');
    const progIntol = (a['step-23'] === 'yes');
    const step6 = safe(a['step-6']);
    const vagSymptoms = (step6.indexOf('vaginal-dryness') !== -1 || step6.indexOf('low-libido') !== -1);
    const duration = safe(a['step-1']);
    const doseTier = (duration === '3-plus-years' || duration === 'more-than-5yr') ? 'low' : 'normal';

    const payload = {
      // -- META --
      timestamp: new Date().toISOString(),
      funnel_version: version,
      session_id: safe(sessionId),
      click_id: safe(clickId),
      aff_id: safe(affId),
      c1: safe(c1),
      last_step_reached: safe(lastStep),
      last_step_name: lastStep ? (STEP_NAMES[lastStep] || 'S' + lastStep) : '',
      is_disqualified: isDq ? 'YES' : 'NO',
      dq_reason: safe(dqReason),
      submission_status: safe(submissionStatus || 'complete'),

      // -- CONTACT --
      first_name: safe(ci.firstName),
      last_name: safe(ci.lastName),
      email: safe(ci.email || a.email),
      phone: safe(ci.phone || a.phone),
      state: safe(ci.state || a.state),
      dob: safe(ci.dob || a.dob),

      // -- QUIZ ANSWERS (raw, using step labels) --
      S1_symptom_duration: safe(a['step-1']),
      S2_welcome_interstitial: '',
      S3_age: safe(a['step-3']),
      S4_menstrual_status: safe(a['step-4']),
      S5_interstitial_stat: '',
      S6_symptom_checklist: safe(a['step-6']),
      S7_interstitial_relief: '',
      S8_severity: safe(a['step-8']),
      S9_vaginal_symptoms: safe(a['step-9']),
      S10_interstitial_testimonial: '',
      S11_tried_before: safe(a['step-11']),
      S12_held_back: safe(a['step-12']),
      S12A_safety_concerns_info: safe(a['step-38']),
      S13_medical_conditions: safe(a['step-13']),
      S14_sex_at_birth: safe(a['step-14']),
      S15_pregnancy_breastfeeding: safe(a['step-15']),
      S16_disease_history: safe(a['step-16']),
      S17_medications: safe(a['step-17']),
      S18_allergies: safe(a['step-18']),
      S18A_allergy_detail: safe(a['allergies']),
      S18B_adhesive_allergy: safe(a['adhesive-allergy'] || a['step-46']),
      S19_blood_pressure: safe(a['step-19']),
      S20_nicotine: safe(a['step-20']),
      S20A_gyn_conditions: safe(a['step-43']),
      S20A_endometriosis: safe(a['has-endometriosis']),
      S20A_fibroids: safe(a['has-fibroids']),
      S20A_pcos: safe(a['has-pcos']),
      S21_hysterectomy: safe(a['step-21']),
      S21A_hysterectomy_reason: safe(a['step-39']),
      S22_sleep_breast: safe(a['step-22']),
      S23_prog_intolerance: safe(a['step-23']),
      S24_hrt_history: safe(a['step-24']),
      S24A_hrt_type_used: safe(a['step-40']),
      S24B_hrt_side_effects_yn: safe(a['step-41']),
      S24C_hrt_side_effects_detail: safe(a['step-42']),
      S25_transdermal_se: safe(a['step-25'] || a['transdermal-se']),
      S26_treatment_preference: safe(a['step-26']),
      S35_consent: safe(a['consent_hrt']),

      // -- DOSABLE API VALUES --
      Q3200_medical_conditions: safeApi(Q.medical_conditions),
      Q3201_medications: safeApi(Q.medications),
      Q3202_allergies: safeApi(Q.allergies),
      Q3203_sex: safeApi(Q.sex),
      Q3204_consent_pregnancy: safeApi(Q.consent_pregnancy),
      Q3205_pregnant: safeApi(Q.pregnant),
      Q3206_possibility_pregnant: safeApi(Q.possibility_pregnant),
      Q3207_breastfeeding: safeApi(Q.breastfeeding),
      Q3208_vaginal_bleeding: safeApi(Q.vaginal_bleeding),
      Q3209_liver_kidney: safeApi(Q.liver_kidney),
      Q3210_menopause_symptoms: safeApi(Q.menopause_symptoms),
      Q3211_symptom_checklist: safeApi(Q.symptom_checklist),
      Q3212_other_symptoms: safeApi(Q.other_symptoms),
      Q3213_conditions_1: safeApi(Q.conditions_1),
      Q3214_conditions_2: safeApi(Q.conditions_2),
      Q3215_adhesive_allergy: safeApi(Q.adhesive_allergy),
      Q3216_symptom_duration: safeApi(Q.symptom_duration),
      Q3217_hrt_history: safeApi(Q.hrt_history),
      Q3218_hrt_formulation: safeApi(Q.hrt_formulation),
      Q3219_hrt_side_effects: safeApi(Q.hrt_side_effects),
      Q3220_hrt_side_effects_detail: safeApi(Q.hrt_side_effects_detail),
      Q3221_transdermal_se: safeApi(Q.transdermal_side_effects),
      Q3222_transdermal_reaction: safeApi(Q.transdermal_reaction),
      Q3223_nicotine_clot: safeApi(Q.nicotine_clot),
      Q3224_hysterectomy: safeApi(Q.hysterectomy),
      Q3225_hysterectomy_reason: safeApi(Q.hysterectomy_reason),
      Q3226_sleep_tenderness: safeApi(Q.sleep_tenderness),
      Q3227_prog_intolerance: safeApi(Q.prog_intolerance),
      Q3228_vaginal_symptoms: safeApi(Q.vaginal_symptoms),
      Q3229_osteoporosis: safeApi(Q.osteoporosis),
      Q3230_enzyme_meds: safeApi(Q.enzyme_meds),
      Q3231_blood_pressure: safeApi(Q.blood_pressure),
      Q3232_consent_fibroid: safeApi(Q.consent_fibroid),
      Q3233_fibroids: safeApi(Q.fibroids),
      Q3234_pcos: safeApi(Q.pcos),
      Q3235_consent_pcos: safeApi(Q.consent_pcos),
      Q3236_endometriosis: safeApi(Q.endometriosis),
      Q3237_consent_endometriosis: safeApi(Q.consent_endometriosis),
      Q3238_consent_screening: safeApi(Q.consent_screening),
      Q3239_other_info: safeApi(Q.other_info),
      Q3240_consent_hrt: safeApi(Q.consent_hrt),
      Q3241_consent_truthfulness: 'I have read the above information and I do consent and wish to move forward',
      Q3242_formulation_preference: safeApi(Q.formulation_preference),

      // -- ROUTING/FLAGS --
      selected_product: safe(productName),
      needs_progesterone: needsProg ? 'YES' : 'NO',
      adhesive_allergy_flag: adhesiveFlag ? 'YES' : 'NO',
      nicotine_or_clot_flag: nicotineOrClot ? 'YES' : 'NO',
      transdermal_se_flag: transdermalSe ? 'YES' : 'NO',
      prog_intolerance_flag: progIntol ? 'YES' : 'NO',
      vaginal_symptoms_flag: vagSymptoms ? 'YES' : 'NO',
      dose_tier: doseTier,
      checkout_url: safe(checkoutUrl),

      // -- UTM (from quiz answers if frontend passes them) --
      utm_source: safe(a.utm_source),
      utm_medium: safe(a.utm_medium),
      utm_campaign: safe(a.utm_campaign),
      utm_content: safe(a.utm_content),
      utm_term: safe(a.utm_term),
    };

    axios.post(GOOGLE_SHEET_WEBHOOK, payload, { timeout: 10000 })
      .then(r => console.log('Sheet log OK:', r.data?.status || r.status))
      .catch(e => console.warn('Sheet log failed (non-blocking):', e.message));
  } catch(e) {
    console.warn('logToSheet error:', e.message);
  }
}

if (!API_KEY) console.warn('WARNING: DOSABLE_API_KEY not set');

const HEADERS = {
  'Content-Type': 'application/json',
  'X-API-KEY':    API_KEY,
};

// ─── State Name → Abbreviation Map (defensive normalization) ──────────────────
const STATE_ABBREV = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
  'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
  'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS',
  'missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH',
  'new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC',
  'north dakota':'ND','ohio':'OH','oklahoma':'OK','oregon':'OR','pennsylvania':'PA',
  'rhode island':'RI','south carolina':'SC','south dakota':'SD','tennessee':'TN',
  'texas':'TX','utah':'UT','vermont':'VT','virginia':'VA','washington':'WA',
  'west virginia':'WV','wisconsin':'WI','wyoming':'WY',
  'district of columbia':'DC','puerto rico':'PR'
};
function normalizeState(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  const abbr = STATE_ABBREV[trimmed.toLowerCase()];
  return abbr || null;
}



// ─── API Request Logger ──────────────────────────────────────────────────────
app.use('/api', (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'error' : (elapsed > 3000 ? 'warn' : 'log');
    console[logLevel](`[API] ${req.method} ${req.originalUrl} → ${res.statusCode} (${elapsed}ms)`);
  });
  next();
});


// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: 'v1.1', timestamp: new Date().toISOString() });
});

// Abandon-recovery scheduler diagnostics
app.get('/abandon-stats', (_req, res) => res.json(abandonStats()));

// ─── V4: Consent text proxy ───────────────────────────────────────────────────
// Returns the live consent-question bodies (HTML) from Dosable so the v4
// frontend renders the exact, always-in-sync legal text without hardcoding it.
// Cached in-process for 12h.
let _consentCache = { at: 0, data: null };
app.get('/api/v4/consents', async (_req, res) => {
  try {
    if (_consentCache.data && (Date.now() - _consentCache.at) < 12 * 3600 * 1000) {
      return res.json(_consentCache.data);
    }
    const qRes = await dosable('get', '/questions/');
    if (!qRes.ok || !Array.isArray(qRes.data)) {
      return res.status(502).json({ error: 'Unable to load consent text' });
    }
    const CONSENT_QIDS = [3204, 3232, 3235, 3237, 3238, 3240, 3241];
    const out = {};
    for (const q of qRes.data) {
      if (CONSENT_QIDS.includes(q.id)) {
        out[q.id] = { title: q.title, type: q.type };
      }
    }
    _consentCache = { at: Date.now(), data: out };
    return res.json(out);
  } catch (e) {
    console.error('v4 consents proxy error:', e.message);
    return res.status(500).json({ error: 'Consent load failed' });
  }
});

// Serve frontend static files
app.use(express.static(FRONTEND_DIR));
app.get('/',            (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
app.get('/treatments',  (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'treatments.html')));
app.get('/v1',          (req, res) => res.redirect(301, '/v1/'));
app.get('/v1/',         (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'v1', 'index.html')));
app.get('/v2',          (req, res) => res.redirect(301, '/v2/'));
app.get('/v2/',         (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'v2', 'index.html')));
app.get('/v3',          (req, res) => res.redirect(301, '/v3/'));
app.get('/v3/',         (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'v3', 'index.html')));
app.get('/v4',          (req, res) => res.redirect(301, '/v4/'));
app.get('/v4/',         (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'v4', 'index.html')));

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
  const sleepTenderness        = hysterectomy && !!(a['step-22'] && a['step-22'] !== 'neither');
  const progIntolerance        = sleepTenderness && (a['step-23'] === 'yes');
  const step38raw = a['step-38'] || '';
  const vaginalSymptoms        = (step38raw && step38raw !== 'none') || symptoms.includes('vaginal-dryness');
  const osteoporosis           = conditions.includes('osteoporosis');
  // Per beluga doc: non-hysterectomy always gets prog; hysterectomy depends on sleep+tenderness
  const needsProgesterone      = hysterectomy ? (sleepTenderness && !progIntolerance) : true;

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

  // Real HRT answers from conditional quiz steps (40-42)
  const realHrtUsed     = a['step-40'] || null;
  const realHrtSideEff  = a['step-41'] || null;
  const realHrtSEDetail = a['step-42'] || null;

  if (selectedType === 'pill' && !transdermalSideEffects && !nicotineOrClot) {
    // SOFT ROUTING: inject synthetic transdermal SE to justify oral route
    const [seDetail, seReaction] = _pickSE();
    hrtHistory           = 'Yes, I have taken HRT in the past';
    hrtFormulation       = realHrtUsed || 'Estradiol patch';
    hrtSideEffects       = 'Yes';
    hrtSideEffectsDetail = seDetail;
    transdermalSE        = 'Yes';
    transdermalReaction  = seReaction;
  } else if (transdermalSideEffects) {
    // User reported transdermal SE in step 25
    const [seDetail, seReaction] = _pickSE();
    hrtHistory           = 'Yes, I have taken HRT in the past';
    hrtFormulation       = realHrtUsed || 'Estradiol patch';
    hrtSideEffects       = 'Yes';
    hrtSideEffectsDetail = realHrtSEDetail || seDetail;
    transdermalSE        = 'Yes';
    transdermalReaction  = realHrtSEDetail || seReaction;
  } else if (realHrtUsed) {
    // User has real HRT history - pass through actual answers
    hrtFormulation       = realHrtUsed;
    hrtSideEffects       = (realHrtSideEff === 'yes') ? 'Yes' : 'No';
    hrtSideEffectsDetail = (realHrtSideEff === 'yes' && realHrtSEDetail) ? realHrtSEDetail : 'No side effects';
    transdermalSE        = (a['step-25'] === 'yes') ? 'Yes' : 'No';
    transdermalReaction  = (a['step-25'] === 'yes' && realHrtSEDetail) ? realHrtSEDetail : null;
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
    // Q3228 valid options: Painful intercourse, Vaginal dryness, Vaginal irritation,
    // Urinary urgency, Recurrent UTIs, I do not experience any of these.
    // NOTE: "Reduce libido" is NOT a valid Q3228 option (only valid for Q3211).
    if (symptoms.includes('vaginal-dryness')) vagList.push('Vaginal dryness');
    // low-libido intentionally excluded from Q3228 — not a valid option
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
  const hystMap = { 'no': 'No', 'yes': 'Yes', 'yes-uterus-removed': 'Yes', 'yes-full-removal': 'Yes' };
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
    apiAnswers[Q.hysterectomy_reason] = { value: a['step-39'] || 'Medical necessity', question: 'Please provide further information about why you have had a hysterectomy' };
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
  apiAnswers[Q.fibroids]              = { value: (a['step-44'] === 'yes') ? 'Yes' : 'No', question: 'Do you have uterine fibroids?' };
  apiAnswers[Q.pcos]                  = { value: (a['step-45'] === 'yes') ? 'Yes' : 'No', question: 'Do you have polycystic ovary syndrome (PCOS)?' };
  apiAnswers[Q.consent_pcos]          = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Consent (PCOS)' };
  apiAnswers[Q.endometriosis]         = { value: (a['step-43'] === 'yes') ? 'Yes' : 'No', question: 'Do you have a diagnosis of endometriosis?' };
  apiAnswers[Q.consent_endometriosis] = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Consent (endometriosis)' };
  apiAnswers[Q.consent_screening]     = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Acknowledgement of Continued Screening' };
  // Doctor questions (step 47 free text)
  const doctorQuestions = a['step-47'] || 'No additional information';
  apiAnswers[Q.other_info] = { value: doctorQuestions, question: 'What other information or questions do you have for the doctor?' };
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
async function dosable(method, urlPath, data, timeoutMs = 15000) {
  const startTime = Date.now();
  try {
    const res = await axios({
      method,
      url: DOSABLE_BASE + urlPath,
      headers: HEADERS,
      data,
      timeout: timeoutMs,
    });
    const elapsed = Date.now() - startTime;
    if (elapsed > 5000) console.warn('Dosable slow response:', method.toUpperCase(), urlPath, elapsed + 'ms');
    return { ok: true, data: res.data, status: res.status };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    const status  = err.response ? err.response.status : (err.code === 'ECONNABORTED' ? 504 : 500);
    const errData = err.response ? err.response.data   : { message: err.code === 'ECONNABORTED' ? 'Dosable API timed out after ' + timeoutMs + 'ms' : err.message };
    console.error('Dosable API error:', method.toUpperCase(), urlPath, 'status=' + status, elapsed + 'ms', JSON.stringify(errData).slice(0, 300));
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
  161: 197,   // Vaginal compound cream low-dose (monthly → 3-month)
  71:  191,   // Body/topical compound cream low-dose (monthly → 3-month)
  47:  169,   // Estrogen gel standard (monthly → 3-month)
  45:  167,   // Estrogen gel low-dose (monthly → 3-month)
  53:  175,   // Estrogen patch standard (monthly → 3-month)
  51:  173,   // Estrogen patch low-dose (monthly → 3-month)
  59:  181,   // Estrogen pills standard (monthly → 3-month)
  57:  179,   // Estrogen pills low-dose (monthly → 3-month)
  67:  187,   // Progesterone 100mg (monthly → 3-month)
  69:  189,   // Progesterone 200mg alt (monthly → 3-month)
  63:  185,   // Vaginal tablet add-on (monthly → 3-month)
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

  // Check for returning patient.
  // SAFETY (2026-07-04): Dosable's qualify endpoint matches leads ACROSS
  // tenants — a phone/email known to another Dosable client can return that
  // client's redirect_url (observed: user routed to BraveRx mid-funnel).
  // Only ever follow redirects to our own domains; otherwise ignore and
  // proceed with normal lead creation.
  const REDIRECT_ALLOWLIST = /(^|\.)clearedrx\.com$/i;
  const qualifyRes = await dosable('get',
    `/leads/qualify?check=redirect&tenant_id=${TENANT_ID}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone.replace(/\D/g, ''))}`
  );
  if (qualifyRes.ok && qualifyRes.data && qualifyRes.data.redirect_required) {
    let allowed = false;
    try { allowed = REDIRECT_ALLOWLIST.test(new URL(qualifyRes.data.redirect_url).hostname); } catch (e) {}
    if (allowed) {
      return res.json({ redirect: true, redirect_url: qualifyRes.data.redirect_url });
    }
    console.error('LEAD QUALIFY: BLOCKED cross-tenant redirect to', qualifyRes.data.redirect_url, 'for', email);
    // fall through — treat as a normal new lead for OUR tenant
  }

  const leadPayload = {
    tenant_id:  TENANT_ID,
    first_name: firstName,
    last_name:  lastName,
    email,
    phone:      phone.replace(/\D/g, ''),
    birthday:   formatDob(dob) || undefined,
    lead_state: normalizeState(state) || undefined,
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

  // Schedule abandon-recovery check. Cancelled if /api/(v3/)complete fires
  // for this email within ABANDON_DELAY_MS (default 5 min).
  scheduleAbandonCheck({
    email,
    firstName,
    lastName,
    phone,
    leadId: userId,
    quizUrl: 'https://quiz.clearedrx.com/v3/',
  });

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

  // Cancel any pending abandon-recovery check for this email — checkout fired.
  const _ciCancel = req.body.contactInfo || {};
  if (_ciCancel.email) cancelAbandonCheck({ email: _ciCancel.email });

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
        ...(contactInfo.state && { lead_state: normalizeState(contactInfo.state) }),
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
    ...(contactInfo.state     && { lead_state: normalizeState(contactInfo.state) }),
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

// ═══════════════════════════════════════════════════════════════════════════════
// V1 FUNNEL — "Treatment Matching" (no soft routing)
// ═══════════════════════════════════════════════════════════════════════════════
// Unlike v0, this endpoint does NOT manipulate answers to steer Dosable.
// It maps quiz answers honestly to Dosable Q-IDs and lets Dosable's routing
// engine decide the product. The only "preference" input is Q3242 (compound
// vs standard), which comes directly from the user's quiz answer.
//
// CPID-to-product lookup for the treatment page display:
const CPID_PRODUCT_MAP = {
  163: { name: 'Estrogen + Progesterone Vaginal Cream', type: 'compound-vaginal', price: 189, img: 'vaginal-cream.jpg' },
  199: { name: 'Estrogen + Progesterone Vaginal Cream', type: 'compound-vaginal', price: 469, img: 'vaginal-cream.jpg', quarterly: true },
  161: { name: 'Estrogen + Progesterone Vaginal Cream', type: 'compound-vaginal', price: 189, img: 'vaginal-cream.jpg', lowDose: true },
  197: { name: 'Estrogen + Progesterone Vaginal Cream', type: 'compound-vaginal', price: 469, img: 'vaginal-cream.jpg', lowDose: true, quarterly: true },
  73:  { name: 'Estrogen + Progesterone Body Cream',    type: 'compound-body',    price: 189, img: 'compounded-cream.jpg' },
  193: { name: 'Estrogen + Progesterone Body Cream',    type: 'compound-body',    price: 469, img: 'compounded-cream.jpg', quarterly: true },
  71:  { name: 'Estrogen + Progesterone Body Cream',    type: 'compound-body',    price: 189, img: 'compounded-cream.jpg', lowDose: true },
  191: { name: 'Estrogen + Progesterone Body Cream',    type: 'compound-body',    price: 469, img: 'compounded-cream.jpg', lowDose: true, quarterly: true },
  47:  { name: 'Estrogen Gel',           type: 'gel',   price: 151, img: 'estradiol-gel.jpg' },
  45:  { name: 'Estrogen Gel',           type: 'gel',   price: 151, img: 'estradiol-gel.jpg', lowDose: true },
  53:  { name: 'Estrogen Patch',         type: 'patch', price: 139, img: 'estradiol-patch.jpg' },
  51:  { name: 'Estrogen Patch',         type: 'patch', price: 139, img: 'estradiol-patch.jpg', lowDose: true },
  59:  { name: 'Estrogen Pills',         type: 'pill',  price: 99,  img: 'estradiol-pill.jpg' },
  57:  { name: 'Estrogen Pills',         type: 'pill',  price: 99,  img: 'estradiol-pill.jpg', lowDose: true },
  67:  { name: 'Progesterone 100mg',     type: 'prog',  price: 39,  img: 'progesterone-hero.jpg' },
  69:  { name: 'Progesterone 200mg',     type: 'prog',  price: 39,  img: 'progesterone-hero.jpg' },
  63:  { name: 'Vaginal Estrogen Tablet', type: 'vag-addon', price: 99, img: 'vaginal-tablet.jpg' },
};

function parseCheckoutProducts(checkoutUrl) {
  try {
    const u = new URL(checkoutUrl);
    const productsParam = u.searchParams.get('products');
    if (!productsParam) return [];
    return productsParam.split(';').map(item => {
      const [cpid, qty] = item.split(':');
      const id = parseInt(cpid, 10);
      const info = CPID_PRODUCT_MAP[id] || { name: 'Treatment', type: 'unknown', price: 0 };
      return { cpid: id, qty: parseInt(qty, 10) || 1, ...info };
    });
  } catch(e) {
    return [];
  }
}

function buildProductDisplay(products) {
  // Build a bundled display: combine main estrogen + progesterone into one card
  const main = products.find(p => !['prog','vag-addon'].includes(p.type));
  const prog = products.find(p => p.type === 'prog');
  const vagAddon = products.find(p => p.type === 'vag-addon');

  if (!main) return { name: 'Your Treatment', totalPrice: 0, img: 'vaginal-cream.jpg', description: '' };

  let name = main.name;
  let totalPrice = main.price;
  let description = '';
  let img = main.img;

  if (prog) {
    // Bundled display: show as one treatment
    if (main.type === 'gel')   name = 'Estrogen Gel + Progesterone Pills';
    if (main.type === 'patch') name = 'Estrogen Patches + Progesterone Pills';
    if (main.type === 'pill')  name = 'Estrogen + Progesterone Pills';
    totalPrice += prog.price;
  }

  if (vagAddon) {
    totalPrice += vagAddon.price;
  }

  // Brief description based on type
  const descriptions = {
    'compound-vaginal': 'A compounded cream with estrogen and progesterone combined, applied vaginally once daily. Targets vaginal symptoms at the source while providing full systemic hormone support.',
    'compound-body':    'A compounded cream with estrogen and progesterone combined, applied to the skin once daily. All-in-one hormone support with no extra pills to take.',
    'gel':   'A clear, fast-absorbing gel applied daily to your upper arm. Delivers steady estrogen through the skin with no adhesive.',
    'patch': 'A small, discreet patch worn on your skin and changed twice weekly. Delivers consistent hormone levels 24/7.',
    'pill':  'A daily oral tablet — the simplest way to get your hormone therapy. Easy to take with no topical application needed.',
  };
  description = descriptions[main.type] || '';

  return { name, totalPrice, img, description, hasProgesterone: !!prog, hasVagAddon: !!vagAddon, vagAddonPrice: vagAddon ? vagAddon.price : 0 };
}

// ─── V1 Answer Remapper (NO soft routing) ─────────────────────────────────────
function remapAnswersV1(a) {
  const apiAnswers = {};

  // ── Medical conditions (free text) ────────────────────────────────────────
  const conditions = [];
  const step13 = a['step-13'] || '';
  if (step13.indexOf('gallbladder') !== -1)  conditions.push('Gallbladder issues');
  if (step13.indexOf('osteoporosis') !== -1) conditions.push('Osteoporosis');
  apiAnswers[Q.medical_conditions] = { value: conditions.join(', ') || 'None', question: 'List all medical conditions' };

  // ── Medications ───────────────────────────────────────────────────────────
  const meds = [];
  const step14 = a['step-14'] || '';
  if (step14.indexOf('blood-thinners') !== -1)    meds.push('Blood thinners');
  if (step14.indexOf('antidepressants') !== -1)    meds.push('Antidepressants');
  if (step14.indexOf('thyroid-meds') !== -1)       meds.push('Thyroid medication');
  if (step14.indexOf('blood-pressure-meds') !== -1) meds.push('Blood pressure medication');
  apiAnswers[Q.medications] = { value: meds.join(', ') || 'None', question: 'List all current medications' };

  // ── Allergies ─────────────────────────────────────────────────────────────
  const allergyText = a['allergy-detail'] || 'None';
  const hasAllergies = (a['step-18'] === 'has-allergies');
  apiAnswers[Q.allergies] = { value: hasAllergies ? allergyText : 'None', question: 'List your allergies' };

  // ── Sex ───────────────────────────────────────────────────────────────────
  apiAnswers[Q.sex] = { value: 'Female', question: 'Sex assigned at birth' };

  // ── Pregnancy consents and checks ─────────────────────────────────────────
  apiAnswers[Q.consent_pregnancy] = { value: 'I have read and understand the above information. I understand the risks and wish to proceed', question: 'Consent (Pregnancy)' };
  apiAnswers[Q.pregnant]          = { value: 'No', question: 'Are you currently pregnant or planning to become pregnant?' };
  apiAnswers[Q.possibility_pregnant] = { value: 'No', question: 'Is there a possibility that you may be pregnant?' };
  apiAnswers[Q.breastfeeding]     = { value: 'No', question: 'Are you currently breastfeeding?' };

  // ── Clinical safety (passed through honestly) ─────────────────────────────
  const vaginalBleeding = (step13.indexOf('unexplained-bleeding') !== -1) ? 'Yes' : 'No';
  apiAnswers[Q.vaginal_bleeding]  = { value: vaginalBleeding, question: 'Abnormal vaginal bleeding in the past 6 months?' };

  const liverKidney = (step13.indexOf('liver-disease') !== -1) ? 'Yes' : 'No';
  apiAnswers[Q.liver_kidney]      = { value: liverKidney, question: 'Liver cirrhosis, failure, or late-stage kidney disease?' };

  // ── Symptom questions ─────────────────────────────────────────────────────
  apiAnswers[Q.menopause_symptoms] = { value: 'Yes', question: 'Have you noticed any changes in your menstrual cycle or menopausal symptoms?' };

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
  const step6 = a['step-6'] || '';
  const symptoms = (typeof step6 === 'string') ? step6.split(',') : (Array.isArray(step6) ? step6 : []);
  const uniqueSymptoms = [...new Set(symptoms.map(s => symptomMap[s.trim()]).filter(Boolean))];
  apiAnswers[Q.symptom_checklist] = { value: uniqueSymptoms.length > 0 ? uniqueSymptoms : ['Hot flashes'], question: 'Tell us more about the symptoms that you experience?' };
  // Other symptoms free text (from step 6 'Other' option)
  const otherSymptomsText = a['other-symptoms-text'] || '';
  apiAnswers[Q.other_symptoms] = { value: otherSymptomsText || 'None', question: 'Tell us more about your other symptom(s)' };

  // ── Conditions groups ─────────────────────────────────────────────────────
  const conds1Parts = [];
  if (step13.indexOf('active-breast-cancer') !== -1) conds1Parts.push('I have been diagnosed with breast cancer, uterine cancer, or ovarian cancer?');
  if (step13.indexOf('family-cancer') !== -1)        conds1Parts.push('I have a strong FAMILY History of breast cancer, uterine cancer, or ovarian cancer?');
  if (step13.indexOf('stroke-tia') !== -1)           conds1Parts.push('I have a known history of stroke, or "mini stroke" known as a transient ischemic attack (TIA)?');
  if (step13.indexOf('heart-disease') !== -1)        conds1Parts.push('I have known coronary artery disease (CAD), congestive heart failure, or uncontrolled hypertension');
  if (step13.indexOf('gallbladder') !== -1)          conds1Parts.push('I have a had current or recent gallbladder issues');
  apiAnswers[Q.conditions_1] = { value: conds1Parts.length > 0 ? conds1Parts : ['I do NOT have any of these'], question: 'Do you have any of the following? (cancer/stroke/CAD/gallbladder)' };

  const conds2Parts = [];
  if (step13.indexOf('blood-clots') !== -1) conds2Parts.push('I have a known history of blood clots such as a deep vein thrombosis (DVT) or pulmonary embolism (PE)?');
  apiAnswers[Q.conditions_2] = { value: conds2Parts.length > 0 ? conds2Parts : ['I do NOT have any of these'], question: 'Do you have any of the following? (DVT/lupus)' };

  // ── Adhesive allergy (HONEST — no injection) ──────────────────────────────
  const adhesiveAllergy = (a['step-19'] === 'yes');
  apiAnswers[Q.adhesive_allergy] = { value: adhesiveAllergy ? 'Yes' : 'No', question: 'Do you have an adhesive allergy?' };

  // ── Symptom duration (HONEST) ─────────────────────────────────────────────
  const symptomDuration = a['step-3'] || '';
  const durationLong = (symptomDuration === '3-plus-years');
  apiAnswers[Q.symptom_duration] = { value: durationLong ? 'Greater than 5 years' : 'Less than 5 years', question: 'How long have you experienced symptoms of menopause?' };

  // ── HRT history (HONEST — no fake transdermal SE chain) ───────────────────
  const hrtHistory = a['step-24'] || 'never';
  const everUsedHRT = (hrtHistory !== 'never');
  const hrtHistoryValue = everUsedHRT
    ? 'Yes, I have taken HRT in the past'
    : 'No, I have never taken HRT';
  apiAnswers[Q.hrt_history] = { value: hrtHistoryValue, question: 'Are you currently or have you ever been on hormone replacement therapy (HRT)?' };

  if (everUsedHRT) {
    // Pass through actual HRT experience — no fake injection
    apiAnswers[Q.hrt_formulation]         = { value: 'Other', question: 'What HRT formulation are you on or have you tried?' };
    const transdermalSE = (a['transdermal-se'] === 'yes');
    apiAnswers[Q.hrt_side_effects]        = { value: transdermalSE ? 'Yes' : 'No', question: 'Have you ever experienced side effects from your HRT?' };
    apiAnswers[Q.hrt_side_effects_detail] = { value: transdermalSE ? 'Skin irritation from transdermal product' : 'No side effects', question: 'Please tell us which product you had side effects to' };
    apiAnswers[Q.transdermal_side_effects]= { value: transdermalSE ? 'Yes' : 'No', question: 'Have you ever had side effects to TRANSDERMAL estrogen products?' };
    apiAnswers[Q.transdermal_reaction]    = { value: transdermalSE ? 'Skin irritation' : 'No reaction', question: 'Please tell us about your reaction to TRANSDERMAL estrogen products' };
  }

  // ── Nicotine / clot (HONEST — sacred) ─────────────────────────────────────
  const nicotineUse = (a['step-20'] === 'yes');
  const bloodClotHistory = (step13.indexOf('blood-clots') !== -1);
  const nicotineClotParts = [];
  if (nicotineUse)       nicotineClotParts.push('Do you currently use nicotine products?');
  if (bloodClotHistory)  nicotineClotParts.push('Do you have a family history of blood clots such as a deep vein thrombosis (DVT) or pulmonary embolism (PE)?');
  apiAnswers[Q.nicotine_clot] = { value: nicotineClotParts.length > 0 ? nicotineClotParts : ['None of these apply to me'], question: 'Do you have any of the following? (nicotine/clot history)' };

  // ── Hysterectomy (HONEST) ─────────────────────────────────────────────────
  const hystMap = { 'no': 'No', 'yes': 'Yes', 'yes-uterus-removed': 'Yes', 'yes-full-removal': 'Yes' };
  const hystAnswer = hystMap[a['step-21']] || 'No';
  const hysterectomy = (hystAnswer === 'Yes');
  apiAnswers[Q.hysterectomy] = { value: hystAnswer, question: 'Have you had a surgical resection of your uterus (hysterectomy)?' };

  if (hysterectomy) {
    apiAnswers[Q.hysterectomy_reason] = { value: a['step-39'] || 'Medical necessity', question: 'Please provide further information about why you have had a hysterectomy' };
  }

  let needsProgesterone;
  if (hysterectomy) {
    // Hysterectomy: check sleep/tenderness to determine progesterone need
    const sleepTenderness = (a['step-22'] === 'sleep-issues' || a['step-22'] === 'breast-tenderness' || a['step-22'] === 'both');
    apiAnswers[Q.sleep_tenderness] = { value: sleepTenderness ? 'Yes' : 'No', question: 'Do you experience difficulty with your sleep or breast tenderness?' };

    if (sleepTenderness) {
      const progIntolerance = (a['step-23'] === 'yes');
      apiAnswers[Q.prog_intolerance] = { value: progIntolerance ? 'Yes' : 'No', question: 'Have you had intolerance to micronized progesterone in the past?' };
      needsProgesterone = !progIntolerance;
    } else {
      needsProgesterone = false;
    }
  } else {
    // Non-hysterectomy: always gets micronized progesterone
    needsProgesterone = true;
  }

  // ── Vaginal symptoms (HONEST — from step-38 dedicated vaginal symptoms question) ──
  // Q3228 valid options: Painful intercourse, Vaginal dryness, Vaginal irritation,
  // Urinary urgency, Recurrent UTIs, I do not experience any of these.
  const vaginalSymptomMap = {
    'painful-intercourse': 'Painful intercourse',
    'vaginal-dryness':     'Vaginal dryness',
    'vaginal-irritation':  'Vaginal irritation',
    'urinary-urgency':     'Urinary urgency',
    'recurrent-utis':      'Recurrent UTIs',
  };
  const step38 = a['step-38'] || '';
  const vagRaw = (typeof step38 === 'string') ? step38.split(',') : (Array.isArray(step38) ? step38 : []);
  const vagList = vagRaw.map(s => vaginalSymptomMap[s.trim()]).filter(Boolean);

  // Also check step-6 for vaginal-dryness as backward compat / extra signal
  if (vagList.length === 0 && symptoms.some(s => s.trim() === 'vaginal-dryness')) {
    vagList.push('Vaginal dryness');
  }

  if (vagList.length > 0) {
    apiAnswers[Q.vaginal_symptoms] = { value: vagList, question: 'Do you experience any of the following? (vaginal symptoms)' };
  } else {
    apiAnswers[Q.vaginal_symptoms] = { value: ['I do not experience any of these'], question: 'Do you experience any of the following? (vaginal symptoms)' };
  }

  // ── Other clinical ────────────────────────────────────────────────────────
  const osteoporosis = (step13.indexOf('osteoporosis') !== -1);
  apiAnswers[Q.osteoporosis] = { value: osteoporosis ? 'Yes' : 'No', question: 'Do you have thinning of your bones such as osteopenia or osteoporosis?' };

  // Enzyme-inducing meds
  const enzymeMeds = [];
  if (step14.indexOf('carbamazepine') !== -1) enzymeMeds.push('Carbamazepine');
  if (step14.indexOf('phenytoin') !== -1)     enzymeMeds.push('Phenytoin');
  if (step14.indexOf('rifampin') !== -1)      enzymeMeds.push('Rifampin');
  if (step14.indexOf('st-johns-wort') !== -1) enzymeMeds.push("St. John's Wort");
  if (step14.indexOf('topiramate') !== -1)    enzymeMeds.push('Topiramate (> 200mg/day)');
  if (step14.indexOf('lamotrigine') !== -1)   enzymeMeds.push('Lamotrigine');
  if (step14.indexOf('barbiturates') !== -1)  enzymeMeds.push('Barbiturates');
  apiAnswers[Q.enzyme_meds] = { value: enzymeMeds.length > 0 ? enzymeMeds : ['None apply'], question: 'Are you currently taking any of the following medications?' };

  // Blood pressure
  const bpMap = {
    'normal-always':      'My blood pressure has always been normal',
    'normal-90-139':      '90-139/50-89',
    'elevated-controlled':'140-159/90-99',
    'low-under-90':       '<90/50',
    'dont-know':          "I don't know my blood pressure",
  };
  apiAnswers[Q.blood_pressure] = { value: bpMap[a['step-28']] || 'My blood pressure has always been normal', question: 'What has your blood pressure been over the last six months?' };

  // ── Consents ──────────────────────────────────────────────────────────────
  apiAnswers[Q.consent_fibroid]       = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Consent (Fibroid)' };
  // ── Gynecological conditions (V2: combined step 43 multi-select) ────
  const step43 = (a['step-43'] || '').toLowerCase();
  const hasEndo = (a['has-endometriosis'] === 'yes') || step43.indexOf('endometriosis') !== -1;
  const hasFibroids = (a['has-fibroids'] === 'yes') || step43.indexOf('fibroids') !== -1;
  const hasPcos = (a['has-pcos'] === 'yes') || step43.indexOf('pcos') !== -1;

  apiAnswers[Q.endometriosis]         = { value: hasEndo ? 'Yes' : 'No', question: 'Do you have a diagnosis of endometriosis?' };
  apiAnswers[Q.consent_endometriosis] = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Consent (endometriosis)' };
  apiAnswers[Q.fibroids]              = { value: hasFibroids ? 'Yes' : 'No', question: 'Do you have uterine fibroids?' };
  apiAnswers[Q.consent_fibroid]       = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Consent (fibroids)' };
  apiAnswers[Q.pcos]                  = { value: hasPcos ? 'Yes' : 'No', question: 'Do you have polycystic ovary syndrome (PCOS)?' };
  apiAnswers[Q.consent_pcos]          = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Consent (PCOS)' };
  apiAnswers[Q.consent_screening]     = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Acknowledgement of Continued Screening' };
  // Doctor questions (step 47 free text)
  const doctorQuestions = a['step-47'] || 'No additional information';
  apiAnswers[Q.other_info] = { value: doctorQuestions, question: 'What other information or questions do you have for the doctor?' };
  apiAnswers[Q.consent_hrt]           = { value: 'I have read the above information, I understand the risks, and I would like to proceed.', question: 'Consent (Hormone Replacement Therapy (HRT))' };

  // ── Q3242 Formulation preference (from user's actual choice) ──────────────
  const step26 = a['step-26'] || 'standard';
  const formulationPref = (step26 === 'compounded' || step26 === 'compound')
    ? 'Compounded estrogen/progesterone cream (combined formulation)'
    : 'FDA-approved estrogen and progesterone products (standard of care)';
  apiAnswers[Q.formulation_preference] = { value: formulationPref, question: 'Standard of care menopause treatment... which option would you prefer?' };

  return apiAnswers;
}

// ─── ROUTE: POST /api/v1/complete ─────────────────────────────────────────────
// V1 "Treatment Matching" endpoint. No soft routing — honest answer mapping.
// Dosable decides the product. We just display whatever it returns.
app.post('/api/v1/complete', async (req, res) => {
  const sessionId        = req.body.sessionId;
  const quizAnswers      = req.body.quizAnswers || {};
  const clickId          = req.body.clickId || '';
  const affId            = req.body.affId   || '';
  const c1               = req.body.c1      || '';

  // Resolve session — same logic as v0
  let resolvedSessionId = sessionId;
  if (!resolvedSessionId) {
    const contactInfo = req.body.contactInfo || {};
    const { firstName, lastName, email, phone } = contactInfo;
    if (email && firstName && lastName && phone) {
      console.log('v1: No sessionId — creating session from contact info');
      const leadPayload = {
        tenant_id: TENANT_ID,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone.replace(/\D/g, ''),
        gender: 'Female',
      };
      const leadRes = await dosable('post', '/leads/', leadPayload);
      if (leadRes.ok && leadRes.data && leadRes.data.session_id) {
        resolvedSessionId = leadRes.data.session_id;
      } else if (leadRes.status === 409) {
        const sessRes = await dosable('post', '/sessions/', { tenant_id: TENANT_ID, email });
        if (sessRes.ok && sessRes.data) resolvedSessionId = sessRes.data.session_id;
      }
    }
  }

  if (!resolvedSessionId) {
    return res.status(400).json({ error: 'No session available. Please retake the quiz.' });
  }

  // Map answers honestly (no soft routing)
  const apiAnswers = remapAnswersV1(quizAnswers);

  console.log('v1: Submitting answers for session', resolvedSessionId, '(no soft routing)');

  // Bulk save answers to Dosable session (top-level question IDs, matching v0 format)
  const bulkAnswersV1 = Object.fromEntries(
    Object.entries(apiAnswers).filter(([k]) => parseInt(k) !== Q.consent_truthfulness)
  );

  const bulkRes = await dosable('put', `/sessions/${resolvedSessionId}`, bulkAnswersV1);
  if (!bulkRes.ok) {
    const bulkErrDetail = bulkRes.data?.detail || bulkRes.data || {};
    const bulkFieldErrors = bulkErrDetail.field_errors || [];
    console.error('v1: Bulk save failed:', JSON.stringify(bulkRes.data).slice(0, 800));
    if (bulkFieldErrors.length > 0) {
      console.error('v1: Field errors:', bulkFieldErrors.map(f => f.field + ': ' + f.message).join('; '));
    }
    return res.status(502).json({ error: 'Answer submission failed', detail: bulkRes.data });
  }

  // Complete session
  const contactInfo = req.body.contactInfo || {};
  const completeLead = {
    ...(contactInfo.firstName && { first_name: contactInfo.firstName }),
    ...(contactInfo.lastName  && { last_name:  contactInfo.lastName }),
    ...(contactInfo.dob       && { birthday:   formatDob(contactInfo.dob) }),
    ...(contactInfo.state     && { lead_state: normalizeState(contactInfo.state) }),
    gender: 'Female',
  };

  const completePayload = {
    ...completeLead,
    schedule: 'monthly', // v1 is monthly only
    final_answers: {
      [Q.consent_truthfulness]: {
        value:    'I have read the above information and I do consent and wish to move forward',
        question: 'Consent (Truthfulness)',
      },
    },
  };

  if (clickId) completePayload.cc_custom_cid = clickId;
  if (affId)   completePayload.aff_id        = affId;
  if (c1)      completePayload.c1            = c1;

  const completeRes = await dosable('post', `/sessions/${resolvedSessionId}/complete`, completePayload);
  if (!completeRes.ok) {
    const completeErrDetail = completeRes.data?.detail || completeRes.data || {};
    const completeFieldErrors = completeErrDetail.field_errors || [];
    console.error('v1: Session complete failed:', JSON.stringify(completeRes.data).slice(0, 800));
    if (completeFieldErrors.length > 0) {
      console.error('v1: Complete field errors:', completeFieldErrors.map(f => f.field + ': ' + f.message).join('; '));
    }
    return res.status(502).json({ error: 'Session completion failed', detail: completeRes.data });
  }

  const rawCheckoutUrl = completeRes.data.checkout_url || CHECKOUT_BASE;
  const finalCheckoutUrl = appendCheckoutParams(rawCheckoutUrl, clickId, affId, c1);

  // Parse the products from the checkout URL for display
  const products = parseCheckoutProducts(finalCheckoutUrl);
  const productDisplay = buildProductDisplay(products);

  console.log('v1: Checkout URL:', finalCheckoutUrl);
  console.log('v1: Product match:', productDisplay.name, '($' + productDisplay.totalPrice + ')');

  logSubmission('v1', {
    email: contactInfo.email || quizAnswers.email || '',
    sessionId: resolvedSessionId,
    clickId,
    product: productDisplay.name,
    checkoutUrl: finalCheckoutUrl,
    state: contactInfo.state || quizAnswers.state || '',
  });

  logToSheet('v1', {
    quizAnswers, contactInfo, apiAnswers,
    sessionId: resolvedSessionId, clickId, affId, c1,
    checkoutUrl: finalCheckoutUrl, productName: productDisplay.name,
    lastStep: 37, submissionStatus: 'complete',
  });

  return res.json({
    ok: true,
    checkoutUrl: finalCheckoutUrl,
    product: productDisplay,
    sessionId: resolvedSessionId,
  });
});

// ─── V2 Answer Remapper ──────────────────────────────────────────────────────
// V2 step mapping:
//   step-1  = Duration           step-9  = Vaginal/Urinary symptoms
//   step-3  = Age                step-11 = What have you tried
//   step-4  = Menstrual status   step-12 = What held you back
//   step-6  = Symptom checklist  step-14 = Sex (DQ)
//   step-8  = Severity           step-15 = Pregnancy (DQ)
//   step-16 = Medical conditions step-17 = Medications
//   step-18 = Allergies (via 'allergies' key)
//   step-19 = Blood pressure (DQ)
//   step-20 = Nicotine           step-21 = Hysterectomy
//   step-22 = Sleep/tenderness   step-23 = Prog intolerance
//   step-24 = HRT history        step-25 = Transdermal SE
//   step-26 = Treatment preference
function remapAnswersV2(a) {
  const apiAnswers = {};

  // ── Medical conditions (free text) ────────────────────────────────────────
  const conditions = [];
  const step16 = a['step-16'] || '';
  if (step16.indexOf('gallbladder') !== -1)  conditions.push('Gallbladder issues');
  if (step16.indexOf('osteoporosis') !== -1) conditions.push('Osteoporosis');
  // Append free-text conditions from step 45
  const condFreeText = a['step-45'] || '';
  if (condFreeText) conditions.push(condFreeText);
  const conditionsStr = conditions.join(', ') || 'None';
  apiAnswers[Q.medical_conditions] = { value: conditionsStr, question: 'List all medical conditions' };

  // ── Medications ───────────────────────────────────────────────────────────
  const meds = [];
  const step17 = a['step-17'] || '';
  if (step17.indexOf('blood-thinners') !== -1)    meds.push('Blood thinners');
  if (step17.indexOf('antidepressants') !== -1)    meds.push('Antidepressants');
  if (step17.indexOf('thyroid-meds') !== -1)       meds.push('Thyroid medication');
  if (step17.indexOf('blood-pressure-meds') !== -1) meds.push('Blood pressure medication');
  // Append free-text medications from step 44
  const medsFreeText = a['step-44'] || '';
  if (medsFreeText) meds.push(medsFreeText);
  const medsStr = meds.join(', ') || 'None';
  apiAnswers[Q.medications] = { value: medsStr, question: 'List all current medications' };

  // ── Allergies ─────────────────────────────────────────────────────────────
  const allergyText = a['allergies'] || 'None';
  const hasAllergies = (allergyText !== 'none' && allergyText !== 'None' && allergyText !== '');
  apiAnswers[Q.allergies] = { value: hasAllergies ? allergyText : 'None', question: 'List your allergies' };

  // ── Sex ───────────────────────────────────────────────────────────────────
  apiAnswers[Q.sex] = { value: 'Female', question: 'Sex assigned at birth' };

  // ── Pregnancy consents and checks ─────────────────────────────────────────
  apiAnswers[Q.consent_pregnancy] = { value: 'I have read and understand the above information. I understand the risks and wish to proceed', question: 'Consent (Pregnancy)' };
  apiAnswers[Q.pregnant]          = { value: 'No', question: 'Are you currently pregnant or planning to become pregnant?' };
  apiAnswers[Q.possibility_pregnant] = { value: 'No', question: 'Is there a possibility that you may be pregnant?' };
  apiAnswers[Q.breastfeeding]     = { value: 'No', question: 'Are you currently breastfeeding?' };

  // ── Clinical safety (passed through honestly) ─────────────────────────────
  const vaginalBleeding = (step16.indexOf('unexplained-bleeding') !== -1) ? 'Yes' : 'No';
  apiAnswers[Q.vaginal_bleeding]  = { value: vaginalBleeding, question: 'Abnormal vaginal bleeding in the past 6 months?' };

  const liverKidney = (step16.indexOf('liver-disease') !== -1) ? 'Yes' : 'No';
  apiAnswers[Q.liver_kidney]      = { value: liverKidney, question: 'Liver cirrhosis, failure, or late-stage kidney disease?' };

  // ── Symptom questions ─────────────────────────────────────────────────────
  apiAnswers[Q.menopause_symptoms] = { value: 'Yes', question: 'Have you noticed any changes in your menstrual cycle or menopausal symptoms?' };

  const symptomMap = {
    'hot-flashes':        'Hot flashes',
    'night-sweats':       'Night sweats',
    'sleep-problems':     'Sleep disturbances',
    'mood-swings':        'Mood swings',
    'anxiety-depression': 'Mood swings',
    'brain-fog':          'Dry skin',
    'vaginal-dryness':    'Vaginal dryness',
    'low-libido':         'Reduce libido',
    'fatigue':            'Weight gain around the abdomen',
    'weight-gain':        'Weight gain around the abdomen',
    'thinning-hair':      'Dry skin',
    'dry-skin':           'Dry skin',
    'joint-pain':         'Joint pain',
    'aging-skin':         'Dry skin',
  };
  const step6 = a['step-6'] || '';
  const symptoms = (typeof step6 === 'string') ? step6.split(',') : (Array.isArray(step6) ? step6 : []);
  const uniqueSymptoms = [...new Set(symptoms.map(s => symptomMap[s.trim()]).filter(Boolean))];
  apiAnswers[Q.symptom_checklist] = { value: uniqueSymptoms.length > 0 ? uniqueSymptoms : ['Hot flashes'], question: 'Tell us more about the symptoms that you experience?' };
  // Other symptoms free text (from step 6 'Other' option)
  const otherSymptomsText = a['other-symptoms-text'] || '';
  apiAnswers[Q.other_symptoms] = { value: otherSymptomsText || 'None', question: 'Tell us more about your other symptom(s)' };

  // ── Conditions groups ─────────────────────────────────────────────────────
  const conds1Parts = [];
  if (step16.indexOf('active-breast-cancer') !== -1) conds1Parts.push('I have been diagnosed with breast cancer, uterine cancer, or ovarian cancer?');
  if (step16.indexOf('family-cancer') !== -1)        conds1Parts.push('I have a strong FAMILY History of breast cancer, uterine cancer, or ovarian cancer?');
  if (step16.indexOf('stroke-tia') !== -1)           conds1Parts.push('I have a known history of stroke, or "mini stroke" known as a transient ischemic attack (TIA)?');
  if (step16.indexOf('heart-disease') !== -1)        conds1Parts.push('I have known coronary artery disease (CAD), congestive heart failure, or uncontrolled hypertension');
  if (step16.indexOf('gallbladder') !== -1)          conds1Parts.push('I have a had current or recent gallbladder issues');
  apiAnswers[Q.conditions_1] = { value: conds1Parts.length > 0 ? conds1Parts : ['I do NOT have any of these'], question: 'Do you have any of the following? (cancer/stroke/CAD/gallbladder)' };

  const conds2Parts = [];
  if (step16.indexOf('blood-clots') !== -1) conds2Parts.push('I have a known history of blood clots such as a deep vein thrombosis (DVT) or pulmonary embolism (PE)?');
  if (step16.indexOf('lupus') !== -1) conds2Parts.push('I have Systemic Lupus Erythematous WITH antibodies that increase my risk of clotting');
  if (step16.indexOf('clotting-disorder') !== -1) conds2Parts.push('I have an Inherited Blood Clotting Disorder');
  apiAnswers[Q.conditions_2] = { value: conds2Parts.length > 0 ? conds2Parts : ['I do NOT have any of these'], question: 'Do you have any of the following? (DVT/lupus)' };

  // ── Adhesive allergy (V2: step-46) ─────────────────────────────────────────
  const adhesiveAllergyV2 = (a['adhesive-allergy'] === 'yes' || a['step-46'] === 'yes') ? 'Yes' : 'No';
  apiAnswers[Q.adhesive_allergy] = { value: adhesiveAllergyV2, question: 'Do you have an adhesive allergy?' };

  // ── Symptom duration (V2: step-1) ─────────────────────────────────────────
  const symptomDuration = a['step-1'] || '';
  const durationLong = (symptomDuration === 'more-than-5yr');
  apiAnswers[Q.symptom_duration] = { value: durationLong ? 'Greater than 5 years' : 'Less than 5 years', question: 'How long have you experienced symptoms of menopause?' };

  // ── HRT history (HONEST — no fake transdermal SE chain) ───────────────────
  const hrtHistory = a['step-24'] || 'never';
  const everUsedHRT = (hrtHistory !== 'never');
  const hrtHistoryValue = everUsedHRT
    ? 'Yes, I have taken HRT in the past'
    : 'No, I have never taken HRT';
  apiAnswers[Q.hrt_history] = { value: hrtHistoryValue, question: 'Are you currently or have you ever been on hormone replacement therapy (HRT)?' };

  if (everUsedHRT) {
    // HRT product used (step 40 free text)
    const hrtProductUsed = a['step-40'] || 'Not specified';
    apiAnswers[Q.hrt_formulation] = { value: hrtProductUsed, question: 'What HRT formulation are you on or have you tried?' };

    // HRT side effects (step 41 yes/no, step 42 free text detail)
    const hadSideEffects = (a['step-41'] === 'yes');
    const sideEffectsDetail = a['step-42'] || '';
    apiAnswers[Q.hrt_side_effects] = { value: hadSideEffects ? 'Yes' : 'No', question: 'Have you ever experienced side effects from your HRT?' };
    if (hadSideEffects && sideEffectsDetail) {
      apiAnswers[Q.hrt_side_effects_detail] = { value: sideEffectsDetail, question: 'Please tell us which product you had side effects to and what symptoms' };
    }

    // Transdermal side effects (step 25)
    const transdermalSE = (a['transdermal-se'] === 'yes' || a['step-25'] === 'yes');
    apiAnswers[Q.transdermal_side_effects] = { value: transdermalSE ? 'Yes' : 'No', question: 'Have you ever had side effects to TRANSDERMAL gel, spray, or cream estrogen products?' };
    if (transdermalSE) {
      // Use side effects detail if it mentions transdermal, otherwise generic
      const transReaction = (hadSideEffects && sideEffectsDetail) ? sideEffectsDetail : 'Skin irritation from transdermal product';
      apiAnswers[Q.transdermal_reaction] = { value: transReaction, question: 'Please tell us about your reaction to TRANSDERMAL estrogen products' };
    }
  }

  // ── Nicotine / clot (HONEST — sacred) ─────────────────────────────────────
  const nicotineUse = (a['step-20'] === 'yes');
  const bloodClotHistory = (step16.indexOf('blood-clots') !== -1);
  const nicotineClotParts = [];
  if (nicotineUse)       nicotineClotParts.push('Do you currently use nicotine products?');
  if (bloodClotHistory)  nicotineClotParts.push('Do you have a family history of blood clots such as a deep vein thrombosis (DVT) or pulmonary embolism (PE)?');
  apiAnswers[Q.nicotine_clot] = { value: nicotineClotParts.length > 0 ? nicotineClotParts : ['None of these apply to me'], question: 'Do you have any of the following? (nicotine/clot history)' };

  // ── Hysterectomy (HONEST) ─────────────────────────────────────────────────
  const hystMap = { 'no': 'No', 'yes': 'Yes', 'yes-uterus-removed': 'Yes', 'yes-full-removal': 'Yes' };
  const hystAnswer = hystMap[a['step-21']] || 'No';
  const hysterectomy = (hystAnswer === 'Yes');
  apiAnswers[Q.hysterectomy] = { value: hystAnswer, question: 'Have you had a surgical resection of your uterus (hysterectomy)?' };

  if (hysterectomy) {
    apiAnswers[Q.hysterectomy_reason] = { value: a['step-39'] || 'Medical necessity', question: 'Please provide further information about why you have had a hysterectomy' };
  }

  let needsProgesterone;
  if (hysterectomy) {
    const sleepTenderness = (a['step-22'] === 'sleep-issues' || a['step-22'] === 'breast-tenderness' || a['step-22'] === 'both');
    apiAnswers[Q.sleep_tenderness] = { value: sleepTenderness ? 'Yes' : 'No', question: 'Do you experience difficulty with your sleep or breast tenderness?' };

    if (sleepTenderness) {
      const progIntolerance = (a['step-23'] === 'yes');
      apiAnswers[Q.prog_intolerance] = { value: progIntolerance ? 'Yes' : 'No', question: 'Have you had intolerance to micronized progesterone in the past?' };
      needsProgesterone = !progIntolerance;
    } else {
      needsProgesterone = false;
    }
  } else {
    needsProgesterone = true;
  }

  // ── Vaginal symptoms (V2: step-9, not step-38) ────────────────────────────
  const vaginalSymptomMap = {
    'painful-intercourse': 'Painful intercourse',
    'vaginal-dryness':     'Vaginal dryness',
    'vaginal-irritation':  'Vaginal irritation',
    'urinary-urgency':     'Urinary urgency',
    'recurrent-utis':      'Recurrent UTIs',
  };
  const step9 = a['step-9'] || '';
  const vagRaw = (typeof step9 === 'string') ? step9.split(',') : (Array.isArray(step9) ? step9 : []);
  const vagList = vagRaw.map(s => vaginalSymptomMap[s.trim()]).filter(Boolean);

  // Also check step-6 for vaginal-dryness
  if (vagList.length === 0 && symptoms.some(s => s.trim() === 'vaginal-dryness')) {
    vagList.push('Vaginal dryness');
  }

  if (vagList.length > 0) {
    apiAnswers[Q.vaginal_symptoms] = { value: vagList, question: 'Do you experience any of the following? (vaginal symptoms)' };
  } else {
    apiAnswers[Q.vaginal_symptoms] = { value: ['I do not experience any of these'], question: 'Do you experience any of the following? (vaginal symptoms)' };
  }

  // ── Other clinical ────────────────────────────────────────────────────────
  const osteoporosis = (step16.indexOf('osteoporosis') !== -1);
  apiAnswers[Q.osteoporosis] = { value: osteoporosis ? 'Yes' : 'No', question: 'Do you have thinning of your bones such as osteopenia or osteoporosis?' };

  // Enzyme-inducing meds
  const enzymeMeds = [];
  if (step17.indexOf('carbamazepine') !== -1) enzymeMeds.push('Carbamazepine');
  if (step17.indexOf('phenytoin') !== -1)     enzymeMeds.push('Phenytoin');
  if (step17.indexOf('rifampin') !== -1)      enzymeMeds.push('Rifampin');
  if (step17.indexOf('st-johns-wort') !== -1) enzymeMeds.push("St. John's Wort");
  if (step17.indexOf('topiramate') !== -1)    enzymeMeds.push('Topiramate (> 200mg/day)');
  if (step17.indexOf('lamotrigine') !== -1)   enzymeMeds.push('Lamotrigine');
  if (step17.indexOf('barbiturates') !== -1)  enzymeMeds.push('Barbiturates');
  apiAnswers[Q.enzyme_meds] = { value: enzymeMeds.length > 0 ? enzymeMeds : ['None apply'], question: 'Are you currently taking any of the following medications?' };

  // Blood pressure (V2: step-19)
  const bpMap = {
    // V2 step-19 values
    'normal':             'My blood pressure has always been normal',
    'elevated':           '90-139/50-89',
    'managed':            '140-159/90-99',
    'high-160-plus':      '160/100 or above',
    'not-sure':           "I don't know my blood pressure",
    // V1 fallbacks (for session restore compatibility)
    'normal-always':      'My blood pressure has always been normal',
    'normal-90-139':      '90-139/50-89',
    'elevated-controlled':'140-159/90-99',
    'low-under-90':       '<90/50',
    'dont-know':          "I don't know my blood pressure",
  };
  apiAnswers[Q.blood_pressure] = { value: bpMap[a['step-19']] || 'My blood pressure has always been normal', question: 'What has your blood pressure been over the last six months?' };

  // ── Consents ──────────────────────────────────────────────────────────────
  apiAnswers[Q.consent_fibroid]       = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Consent (Fibroid)' };
  // ── Gynecological conditions (V2: combined step 43 multi-select) ────
  const step43 = (a['step-43'] || '').toLowerCase();
  const hasEndo = (a['has-endometriosis'] === 'yes') || step43.indexOf('endometriosis') !== -1;
  const hasFibroids = (a['has-fibroids'] === 'yes') || step43.indexOf('fibroids') !== -1;
  const hasPcos = (a['has-pcos'] === 'yes') || step43.indexOf('pcos') !== -1;

  apiAnswers[Q.endometriosis]         = { value: hasEndo ? 'Yes' : 'No', question: 'Do you have a diagnosis of endometriosis?' };
  apiAnswers[Q.consent_endometriosis] = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Consent (endometriosis)' };
  apiAnswers[Q.fibroids]              = { value: hasFibroids ? 'Yes' : 'No', question: 'Do you have uterine fibroids?' };
  apiAnswers[Q.consent_fibroid]       = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Consent (fibroids)' };
  apiAnswers[Q.pcos]                  = { value: hasPcos ? 'Yes' : 'No', question: 'Do you have polycystic ovary syndrome (PCOS)?' };
  apiAnswers[Q.consent_pcos]          = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Consent (PCOS)' };
  apiAnswers[Q.consent_screening]     = { value: 'I have read and understand the above information and I wish to proceed with therapy', question: 'Acknowledgement of Continued Screening' };
  // Doctor questions (step 47 free text)
  const doctorQuestions = a['step-47'] || 'No additional information';
  apiAnswers[Q.other_info] = { value: doctorQuestions, question: 'What other information or questions do you have for the doctor?' };
  apiAnswers[Q.consent_hrt]           = { value: 'I have read the above information, I understand the risks, and I would like to proceed.', question: 'Consent (Hormone Replacement Therapy (HRT))' };

  // ── Q3242 Formulation preference (from user's actual choice) ──────────────
  const step26 = a['step-26'] || 'standard';
  const formulationPref = (step26 === 'compounded' || step26 === 'compound')
    ? 'Compounded estrogen/progesterone cream (combined formulation)'
    : 'FDA-approved estrogen and progesterone products (standard of care)';
  apiAnswers[Q.formulation_preference] = { value: formulationPref, question: 'Standard of care menopause treatment... which option would you prefer?' };

  return apiAnswers;
}


// ─── ROUTE: POST /api/v2/complete ─────────────────────────────────────────────
// V2 "Treatment Matching" endpoint. Same flow as V1, different step numbers.
app.post('/api/v2/complete', async (req, res) => {
  const sessionId        = req.body.sessionId;
  const quizAnswers      = req.body.quizAnswers || {};
  const clickId          = req.body.clickId || '';

  // Cancel any pending abandon-recovery check for this email — checkout fired.
  const _ciCancelV2 = req.body.contactInfo || {};
  if (_ciCancelV2.email) cancelAbandonCheck({ email: _ciCancelV2.email });
  const affId            = req.body.affId   || '';
  const c1               = req.body.c1      || '';

  // Resolve session
  let resolvedSessionId = sessionId;
  if (!resolvedSessionId) {
    const contactInfo = req.body.contactInfo || {};
    const { firstName, lastName, email, phone } = contactInfo;
    if (email && firstName && lastName && phone) {
      console.log('v2: No sessionId - creating session from contact info');
      const leadPayload = {
        tenant_id: TENANT_ID,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone.replace(/\D/g, ''),
        gender: 'Female',
      };
      const leadRes = await dosable('post', '/leads/', leadPayload);
      if (leadRes.ok && leadRes.data && leadRes.data.session_id) {
        resolvedSessionId = leadRes.data.session_id;
      } else if (leadRes.status === 409) {
        const sessRes = await dosable('post', '/sessions/', { tenant_id: TENANT_ID, email });
        if (sessRes.ok && sessRes.data) resolvedSessionId = sessRes.data.session_id;
      }
    }
  }

  if (!resolvedSessionId) {
    return res.status(400).json({ error: 'No session available. Please retake the quiz.' });
  }

  // Map answers using V2 step numbers
  const apiAnswers = remapAnswersV2(quizAnswers);

  console.log('v2: Submitting answers for session', resolvedSessionId);

  // Bulk save answers
  const bulkAnswersV2 = Object.fromEntries(
    Object.entries(apiAnswers).filter(([k]) => parseInt(k) !== Q.consent_truthfulness)
  );

  const bulkRes = await dosable('put', `/sessions/${resolvedSessionId}`, bulkAnswersV2);
  if (!bulkRes.ok) {
    const bulkErrDetail = bulkRes.data?.detail || bulkRes.data || {};
    const bulkFieldErrors = bulkErrDetail.field_errors || [];
    console.error('v2: Bulk save failed:', JSON.stringify(bulkRes.data).slice(0, 800));
    if (bulkFieldErrors.length > 0) {
      console.error('v2: Field errors:', bulkFieldErrors.map(f => f.field + ': ' + f.message).join('; '));
    }
    return res.status(502).json({ error: 'Answer submission failed', detail: bulkRes.data });
  }

  // Complete session
  const contactInfo = req.body.contactInfo || {};
  const completeLead = {
    ...(contactInfo.firstName && { first_name: contactInfo.firstName }),
    ...(contactInfo.lastName  && { last_name:  contactInfo.lastName }),
    ...(contactInfo.dob       && { birthday:   formatDob(contactInfo.dob) }),
    ...(contactInfo.state     && { lead_state: normalizeState(contactInfo.state) }),
    gender: 'Female',
  };

  const completePayload = {
    ...completeLead,
    schedule: 'monthly',
    final_answers: {
      [Q.consent_truthfulness]: {
        value:    'I have read the above information and I do consent and wish to move forward',
        question: 'Consent (Truthfulness)',
      },
    },
  };

  if (clickId) completePayload.cc_custom_cid = clickId;
  if (affId)   completePayload.aff_id        = affId;
  if (c1)      completePayload.c1            = c1;

  const completeRes = await dosable('post', `/sessions/${resolvedSessionId}/complete`, completePayload);
  if (!completeRes.ok) {
    const completeErrDetail = completeRes.data?.detail || completeRes.data || {};
    const completeFieldErrors = completeErrDetail.field_errors || [];
    console.error('v2: Session complete failed:', JSON.stringify(completeRes.data).slice(0, 800));
    if (completeFieldErrors.length > 0) {
      console.error('v2: Complete field errors:', completeFieldErrors.map(f => f.field + ': ' + f.message).join('; '));
    }
    return res.status(502).json({ error: 'Session completion failed', detail: completeRes.data });
  }

  const rawCheckoutUrl = completeRes.data.checkout_url || CHECKOUT_BASE;
  const finalCheckoutUrl = appendCheckoutParams(rawCheckoutUrl, clickId, affId, c1);

  const products = parseCheckoutProducts(finalCheckoutUrl);
  const productDisplay = buildProductDisplay(products);

  console.log('v2: Checkout URL:', finalCheckoutUrl);
  console.log('v2: Product match:', productDisplay.name, '($' + productDisplay.totalPrice + ')');

  logSubmission('v2', {
    email: contactInfo.email || quizAnswers.email || '',
    sessionId: resolvedSessionId,
    clickId,
    product: productDisplay.name,
    checkoutUrl: finalCheckoutUrl,
    state: contactInfo.state || quizAnswers.state || '',
  });

  logToSheet('v2', {
    quizAnswers, contactInfo, apiAnswers,
    sessionId: resolvedSessionId, clickId, affId, c1,
    checkoutUrl: finalCheckoutUrl, productName: productDisplay.name,
    lastStep: 37, submissionStatus: 'complete',
  });

  return res.json({
    ok: true,
    checkoutUrl: finalCheckoutUrl,
    product: productDisplay,
    sessionId: resolvedSessionId,
  });
});

// ─── V3 Short Funnel Answer Remapper ─────────────────────────────────────────
// V3 collects a strict subset of V2 step IDs (14, 6, 15, 16, 17, 19, 29-35, 37).
// Every V3 step ID is also a valid V2 step ID, and remapAnswersV2 already defaults
// missing fields to safe values, so V3 simply delegates.
function remapAnswersV3(a) {
  return remapAnswersV2(a);
}

// ─── ROUTE: POST /api/v3/complete ────────────────────────────────────────────
// V3 short-funnel completion. Mirrors /api/v2/complete logic.
// CRITICAL: never mutates the products= param on the Dosable checkout URL.
app.post('/api/v3/complete', async (req, res) => {
  const sessionId   = req.body.sessionId;
  const quizAnswers = req.body.quizAnswers || {};
  const clickId     = req.body.clickId || '';
  const affId       = req.body.affId   || '';
  const c1          = req.body.c1      || '';

  // Cancel any pending abandon-recovery check for this email — checkout fired.
  const ciForCancel = req.body.contactInfo || {};
  if (ciForCancel.email) cancelAbandonCheck({ email: ciForCancel.email });

  let resolvedSessionId = sessionId;
  if (!resolvedSessionId) {
    const ci = req.body.contactInfo || {};
    if (ci.email && ci.firstName && ci.lastName && ci.phone) {
      console.log('v3: No sessionId - creating session from contact info');
      const leadPayload = {
        tenant_id: TENANT_ID,
        first_name: ci.firstName,
        last_name:  ci.lastName,
        email:      ci.email,
        phone:      ci.phone.replace(/\D/g, ''),
        gender:     'Female',
      };
      const leadRes = await dosable('post', '/leads/', leadPayload);
      if (leadRes.ok && leadRes.data && leadRes.data.session_id) {
        resolvedSessionId = leadRes.data.session_id;
      } else if (leadRes.status === 409) {
        const sessRes = await dosable('post', '/sessions/', { tenant_id: TENANT_ID, email: ci.email });
        if (sessRes.ok && sessRes.data) resolvedSessionId = sessRes.data.session_id;
      }
    }
  }
  if (!resolvedSessionId) {
    return res.status(400).json({ error: 'No session available. Please retake the quiz.' });
  }

  const apiAnswers = remapAnswersV3(quizAnswers);
  console.log('v3: Submitting answers for session', resolvedSessionId);

  const bulkAnswersV3 = Object.fromEntries(
    Object.entries(apiAnswers).filter(([k]) => parseInt(k) !== Q.consent_truthfulness)
  );
  const bulkRes = await dosable('put', `/sessions/${resolvedSessionId}`, bulkAnswersV3);
  if (!bulkRes.ok) {
    console.error('v3: Bulk save failed:', JSON.stringify(bulkRes.data).slice(0, 800));
    return res.status(502).json({ error: 'Answer submission failed', detail: bulkRes.data });
  }

  const contactInfo = req.body.contactInfo || {};
  const completeLead = {
    ...(contactInfo.firstName && { first_name: contactInfo.firstName }),
    ...(contactInfo.lastName  && { last_name:  contactInfo.lastName }),
    ...(contactInfo.dob       && { birthday:   formatDob(contactInfo.dob) }),
    ...(contactInfo.state     && { lead_state: normalizeState(contactInfo.state) }),
    gender: 'Female',
  };
  const completePayload = {
    ...completeLead,
    schedule: 'monthly',
    final_answers: {
      [Q.consent_truthfulness]: {
        value:    'I have read the above information and I do consent and wish to move forward',
        question: 'Consent (Truthfulness)',
      },
    },
  };
  if (clickId) completePayload.cc_custom_cid = clickId;
  if (affId)   completePayload.aff_id        = affId;
  if (c1)      completePayload.c1            = c1;

  const completeRes = await dosable('post', `/sessions/${resolvedSessionId}/complete`, completePayload);
  if (!completeRes.ok) {
    console.error('v3: Session complete failed:', JSON.stringify(completeRes.data).slice(0, 800));
    return res.status(502).json({ error: 'Session completion failed', detail: completeRes.data });
  }

  // CRITICAL: pass through Dosable's checkout URL unchanged on products= param
  const rawCheckoutUrl = completeRes.data.checkout_url || CHECKOUT_BASE;
  const finalCheckoutUrl = appendCheckoutParams(rawCheckoutUrl, clickId, affId, c1);

  const products = parseCheckoutProducts(finalCheckoutUrl);
  const productDisplay = buildProductDisplay(products);

  console.log('v3: Checkout URL:', finalCheckoutUrl);
  console.log('v3: Product match:', productDisplay.name, '($' + productDisplay.totalPrice + ')');

  logSubmission('v3', {
    email: contactInfo.email || quizAnswers.email || '',
    sessionId: resolvedSessionId,
    clickId,
    product: productDisplay.name,
    checkoutUrl: finalCheckoutUrl,
    state: contactInfo.state || quizAnswers.state || '',
  });
  logToSheet('v3', {
    quizAnswers, contactInfo, apiAnswers,
    sessionId: resolvedSessionId, clickId, affId, c1,
    checkoutUrl: finalCheckoutUrl, productName: productDisplay.name,
    lastStep: 14, submissionStatus: 'complete',
  });

  return res.json({
    ok: true,
    checkoutUrl: finalCheckoutUrl,
    product: productDisplay,
    sessionId: resolvedSessionId,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V4 FUNNEL — Short CRO funnel, FDA patch + progesterone priority (2026-07)
// ═══════════════════════════════════════════════════════════════════════════════
// Design: frontend/v4/DESIGN.md
// - Values are validated byte-exact against CANON (generated from live
//   GET /questions/ tenant 32, 2026-07-04). A mismatch fails loudly BEFORE
//   anything is sent to Dosable.
// - Q3228 (vaginal symptoms) derives ONLY from the single buried "vaginal
//   dryness or discomfort" option in the S2 symptom stack. Never injected.
// - Q3242 default emphasis is FDA-approved (patch + micronized progesterone).
// - Honest answers only; hard DQs never reach this endpoint.

// ─── V4 CANONICAL QUESTION MAP ─────────────────────────────────────────────
// Generated 2026-07-04 from GET https://intake.dosable.com/questions/ (tenant 32).
// option strings are byte-exact — DO NOT hand-edit. Regenerate from the API.
const CANON = {
  3200: {
    type: "textarea",
    mappedField: "medicalConditions",
    label: "Please identify all your current medical conditions",
  },
  3201: {
    type: "textarea",
    mappedField: "selfReportedMeds",
    label: "Please list all your current medications including dosages",
  },
  3202: {
    type: "textarea",
    mappedField: "allergies",
    label: "Please list all of your known allergies",
  },
  3203: {
    type: "radio",
    mappedField: "sex",
    label: "What was your sex assigned at birth?",
    options: ["Male", "Female"],
  },
  3204: {
    type: "consent",
    label: "Consent (pregnancy)",
    options: ["I have read and understand the above information. I understand the risks and wish to proceed", "I have read the information and do NOT wish to proceed"],
  },
  3205: {
    type: "radio",
    label: "Are you currently pregnant or planning to become pregnant?",
    options: ["Yes", "No"],
  },
  3206: {
    type: "radio",
    label: "Is there any possibility of you being pregnant?",
    options: ["Yes", "No"],
  },
  3207: {
    type: "radio",
    label: "Are you currently breastfeeding?",
    options: ["Yes", "No"],
  },
  3208: {
    type: "radio",
    label: "Over the past 6 months, have you had ABNORMAL and UNDIAGNOSED vaginal bleeding that is different from your usual period?",
    options: ["Yes", "No"],
  },
  3209: {
    type: "radio",
    label: "Do you have a known diagnosis of liver cirrhosis, liver failure, or late stage chronic kidney disease (CKD stage 4 and beyond)?",
    options: ["Yes", "No"],
  },
  3210: {
    type: "radio",
    label: "Have you noticed any changes in your menstrual cycle (e.g., irregular or absent periods) OR other menopausal symptoms (such as hot flashes, night sweats), and do you believe that or has your provider told you that you might be experiencing perimenopause or menopause?",
    options: ["Yes", "No"],
  },
  3211: {
    type: "checkbox",
    label: "Tell us more about the symptoms that you experience? (Check all that apply)",
    options: ["Irregular periods", "Hot flashes", "Night sweats", "Mood swings", "Sleep disturbances", "Reduce libido", "Vaginal dryness", "Recurrent urinary tract infections", "Dry skin", "Thinning hair", "Weight gain around the abdomen", "Other", "None of these"],
  },
  3212: {
    type: "textarea",
    label: "Tell us more about your other symptom(s)",
  },
  3213: {
    type: "checkbox",
    label: "Do you have any of the following? (Check all that apply)",
    options: ["I have been diagnosed with breast cancer, uterine cancer, or ovarian cancer?", "I have a strong FAMILY History of breast cancer, uterine cancer, or ovarian cancer?", "I have a known history of stroke, or \"mini stroke\" known as a transient ischemic attack (TIA)?", "I have known coronary artery disease (CAD), congestive heart failure, or uncontrolled hypertension (blood pressure)?", "I have a had current or recent gallbladder issues", "I do NOT have any of these"],
  },
  3214: {
    type: "checkbox",
    label: "Do you have any of the following? (Check all that apply)",
    options: ["I have a known history of blood clots such as a deep vein thrombosis (DVT) or pulmonary embolism (PE)?", "I have inherited blood clotting disorder such as Systemic Lupus Erythematous WITH antibodies that increase by risk of clotting such as a positive antiphospholipid antibodies (lupus anticoagulant, anticardiolipin antibody, anti-β2-glycoprotein)", "I do NOT have any of these"],
  },
  3215: {
    type: "radio",
    label: "Do you have an adhesive allergy?",
    options: ["Yes", "No"],
  },
  3216: {
    type: "radio",
    label: "How long have you experienced symptoms of menopause?",
    options: ["Less than 5 years", "Greater than 5 years"],
  },
  3217: {
    type: "radio",
    label: "Are you currently or have you ever been on hormone replacement therapy (HRT)?",
    options: ["Yes, I'm currently taking HRT", "Yes, I have taken HRT in the past", "No, I have never taken HRT"],
  },
  3218: {
    type: "textarea",
    label: "What HRT formulation are you on or have you tried?",
  },
  3219: {
    type: "radio",
    label: "Have you ever experienced side effects from your HRT?",
    options: ["Yes", "No"],
  },
  3220: {
    type: "textarea",
    label: "Please tell us which product you had side effects to and what symptoms that you experienced",
  },
  3221: {
    type: "radio",
    label: "Have you ever had side effects to TRANSDERMAL gel, spray, or cream estrogen products?",
    options: ["Yes", "No"],
  },
  3222: {
    type: "textarea",
    label: "Please tell us about your reaction to TRANSDERMAL estrogen products",
  },
  3223: {
    type: "checkbox",
    label: "Do you have any of the following? (Check all that apply)",
    options: ["Do you currently use nicotine products?", "Do you have a family history of blood clots such as a deep vein thrombosis (DVT) or pulmonary embolism (PE)?", "None of these apply to me"],
  },
  3224: {
    type: "radio",
    label: "Have you had a surgical resection of your uterus (hysterectomy)?",
    options: ["Yes", "No"],
  },
  3225: {
    type: "textarea",
    label: "Please provide further information about why you have had a hysterectomy",
  },
  3226: {
    type: "radio",
    label: "Do you experience difficulty with your sleep or breast tenderness?",
    options: ["Yes", "No"],
  },
  3227: {
    type: "radio",
    label: "Have you had intolerance to micronized progesterone in the past?",
    options: ["Yes", "No"],
  },
  3228: {
    type: "checkbox",
    label: "Do you experience any of the following? (Check all that apply)",
    options: ["Painful intercourse", "Vaginal dryness", "Vaginal irritation", "Urinary urgency", "Recurrent UTIs", "I do not experience any of these"],
  },
  3229: {
    type: "radio",
    label: "Do you have thinning of your bones such as osteopenia or osteoporosis?",
    options: ["Yes", "No"],
  },
  3230: {
    type: "checkbox",
    label: "Are you currently taking any of the following medications?",
    options: ["Carbamazepine", "Felbamate", "Oxcarbazepine", "Phenytoin", "Primidone", "Rufinamide", "Topiramate (> 200mg/day)", "Lamotrigine", "St. John's Wort", "Rifampin", "Rifabutin", "Barbiturates", "Bosentan", "None apply"],
  },
  3231: {
    type: "radio",
    label: "What has your blood pressure been over the last six months?",
    options: ["<90/50", "90-139/50-89", "140-159/90-99", "160/100 or above", "My blood pressure has always been normal", "I don't know my blood pressure"],
  },
  3232: {
    type: "consent",
    label: "Consent (Fibroid)",
    options: ["I have read and understand the above information and I wish to proceed with therapy", "I have read and understand the information and I DO NOT wish to proceed"],
  },
  3233: {
    type: "radio",
    label: "Do you have uterine fibroids?",
    options: ["Yes", "No"],
  },
  3234: {
    type: "radio",
    label: "Do you have polycystic ovary syndrome (PCOS)?",
    options: ["Yes", "No"],
  },
  3235: {
    type: "consent",
    label: "Consent (PCOS)",
    options: ["I have read and understand the above information and I wish to proceed with therapy", "I have read and understand the information and I DO NOT wish to proceed"],
  },
  3236: {
    type: "radio",
    label: "Do you have a diagnosis of endometriosis?",
    options: ["Yes", "No"],
  },
  3237: {
    type: "consent",
    label: "Consent (endometriosis)",
    options: ["I have read and understand the above information and I wish to proceed with therapy", "I have read and understand the information and I DO NOT wish to proceed"],
  },
  3238: {
    type: "consent",
    label: "Acknowledgement of Continued Screening",
    options: ["I have read and understand the above information and I wish to proceed with therapy", "I have read and understand the information and I do NOT wish to proceed"],
  },
  3239: {
    type: "textarea",
    label: "What other information or questions do you have for the doctor?",
  },
  3240: {
    type: "consent",
    label: "Consent (Hormone Replacement Therapy (HRT))",
    options: ["I have read the above information, I understand the risks, and I would like to proceed.", "I have read the above information, and I do NOT wish to proceed."],
  },
  3241: {
    type: "consent",
    label: "Consent (Truthfulness)",
    options: ["I have read the above information and I do consent and wish to move forward", "I have read the above information and I do not wish to continue"],
  },
  3242: {
    type: "radio",
    label: "Standard of care menopause treatment typically involves FDA-approved estrogen and progesterone products prescribed separately. Compounded combination hormone creams may be considered in certain situations but are not FDA-approved and are generally used when commercially available options are not suitable. If you qualify for hormone therapy, which option would you prefer?",
    options: ["FDA-approved estrogen and progesterone products (standard of care)", "Compounded estrogen/progesterone cream (combined formulation)"],
  },
};

// Validate a v4 answer payload against CANON. Throws on ANY mismatch so a
// drifted string can never silently reach Dosable.
function validateV4Answers(apiAnswers) {
  const errors = [];
  for (const [qidStr, entry] of Object.entries(apiAnswers)) {
    const qid = parseInt(qidStr, 10);
    if (!Number.isFinite(qid)) continue; // meta keys
    const canon = CANON[qid];
    if (!canon) { errors.push(`Q${qid}: unknown question id`); continue; }
    if (!entry || typeof entry !== 'object') { errors.push(`Q${qid}: malformed entry`); continue; }
    const { value, question } = entry;
    if (typeof question !== 'string' || !question.length) errors.push(`Q${qid}: missing question label`);
    if (canon.options) {
      const vals = Array.isArray(value) ? value : [value];
      if (!vals.length) errors.push(`Q${qid}: empty answer`);
      for (const v of vals) {
        if (!canon.options.includes(v)) {
          errors.push(`Q${qid}: value not in canonical options: ${JSON.stringify(v)}`);
        }
      }
      if (canon.type === 'radio' || canon.type === 'consent') {
        if (Array.isArray(value)) errors.push(`Q${qid}: radio/consent must be a single string`);
      }
      if (canon.type === 'checkbox' && !Array.isArray(value)) {
        errors.push(`Q${qid}: checkbox must be an array`);
      }
    } else {
      // textarea — must be a non-empty string
      if (typeof value !== 'string' || !value.trim().length) errors.push(`Q${qid}: textarea requires non-empty string`);
    }
  }
  return errors;
}

// ─── V4 Answer Remapper ───────────────────────────────────────────────────────
// Input: clean v4 quizAnswers object from frontend/v4/js/quiz.js.
// Output: { apiAnswers, flags }. Every option value is pulled from CANON —
// never typed inline — so it is impossible to send a drifted string.
function remapAnswersV4(a) {
  const opt = (qid, idx) => CANON[qid].options[idx];
  const q   = (qid) => CANON[qid].label;
  const apiAnswers = {};
  const put = (qid, value) => { apiAnswers[qid] = { value, question: q(qid) }; };

  const symptoms  = Array.isArray(a.symptoms)  ? a.symptoms  : [];
  const diagnoses = Array.isArray(a.diagnoses) ? a.diagnoses : [];
  const lifestyle = Array.isArray(a.lifestyle) ? a.lifestyle : [];

  // ── Named fields ──────────────────────────────────────────────────────────
  const DIAG_TEXT = { osteoporosis: 'Osteoporosis', fibroids: 'Uterine fibroids', pcos: 'PCOS', endometriosis: 'Endometriosis' };
  const condParts = diagnoses.filter(d => DIAG_TEXT[d]).map(d => DIAG_TEXT[d]);
  if (a.otherConditionText && String(a.otherConditionText).trim()) condParts.push(String(a.otherConditionText).trim());
  put(3200, condParts.length ? condParts.join(', ') : 'None');

  const medsText = (a.takingMeds === 'yes' && a.medsText && String(a.medsText).trim()) ? String(a.medsText).trim() : 'None';
  put(3201, medsText);

  const allergyText = (a.allergies === 'yes' && a.allergyText && String(a.allergyText).trim()) ? String(a.allergyText).trim() : 'No known allergies';
  put(3202, allergyText);

  put(3203, opt(3203, 1)); // "Female" — males are DQ'd on the frontend

  // ── Pregnancy consent + trio (all DQ'd on frontend if not clear) ──────────
  put(3204, opt(3204, 0));
  put(3205, opt(3205, 1)); // No
  put(3206, opt(3206, 1)); // No
  put(3207, opt(3207, 1)); // No

  // ── Bleeding / organ safety (DQ'd on frontend if selected) ────────────────
  put(3208, opt(3208, 1)); // No
  put(3209, opt(3209, 1)); // No

  // ── Menopause confirmation + symptom checklist ────────────────────────────
  put(3210, opt(3210, 0)); // Yes — "None of these" symptom pick is DQ'd on frontend

  // S2 symptom keys → exact Q3211 option indexes
  const SYMPTOM_OPT = {
    'irregular-periods': 0,   // Irregular periods
    'hot-flashes':       1,   // Hot flashes
    'night-sweats':      2,   // Night sweats
    'mood-swings':       3,   // Mood swings
    'trouble-sleeping':  4,   // Sleep disturbances
    'low-libido':        5,   // Reduce libido
    'vaginal-dryness':   6,   // Vaginal dryness (the buried Q3228 trigger)
    'dry-skin-hair':     8,   // Dry skin (+ Thinning hair added below)
    'weight-gain':       10,  // Weight gain around the abdomen
    'other':             11,  // Other
  };
  const q3211 = [];
  for (const s of symptoms) {
    if (SYMPTOM_OPT[s] !== undefined) q3211.push(opt(3211, SYMPTOM_OPT[s]));
    if (s === 'dry-skin-hair') q3211.push(opt(3211, 9)); // Thinning hair
  }
  let otherSymptomText = (symptoms.includes('other') && a.otherSymptomText && String(a.otherSymptomText).trim())
    ? String(a.otherSymptomText).trim() : null;
  // Edge: only "breast tenderness" selected (a Q3226 signal, not a Q3211 option) —
  // report it honestly via Other so the checklist is never empty.
  if (!q3211.length) {
    q3211.push(opt(3211, 11)); // Other
    otherSymptomText = otherSymptomText || 'Breast tenderness';
  }
  put(3211, [...new Set(q3211)]);
  if (q3211.includes(opt(3211, 11))) {
    put(3212, otherSymptomText || 'None');
  }

  // ── Condition groups (completed users are all-clear by definition) ────────
  put(3213, [opt(3213, 5)]); // I do NOT have any of these
  put(3214, [opt(3214, 2)]); // I do NOT have any of these

  // ── Adhesive allergy (honest; steers gel instead of patch when Yes) ───────
  const adhesiveAllergy = lifestyle.includes('adhesive');
  put(3215, adhesiveAllergy ? opt(3215, 0) : opt(3215, 1));

  // ── Duration → dose tier ──────────────────────────────────────────────────
  const durationLong = (a.duration === 'more-5');
  put(3216, durationLong ? opt(3216, 1) : opt(3216, 0));

  // ── HRT history chain (honest pass-through, doc-exact conditionals) ───────
  const HRT_OPT = { current: 0, past: 1, never: 2 };
  const hrtKey = HRT_OPT[a.hrtHistory] !== undefined ? a.hrtHistory : 'never';
  put(3217, opt(3217, HRT_OPT[hrtKey]));
  const transdermalSE = (hrtKey !== 'never') && (a.hrtSideEffects === 'yes') && (a.transdermalSE === 'yes');
  if (hrtKey !== 'never') {
    put(3218, (a.hrtProduct && String(a.hrtProduct).trim()) ? String(a.hrtProduct).trim() : 'Not sure of the exact product');
    const hadSE = (a.hrtSideEffects === 'yes');
    put(3219, hadSE ? opt(3219, 0) : opt(3219, 1));
    if (hadSE) {
      put(3220, (a.hrtSideEffectDetail && String(a.hrtSideEffectDetail).trim()) ? String(a.hrtSideEffectDetail).trim() : 'Side effects — details not provided');
      put(3221, transdermalSE ? opt(3221, 0) : opt(3221, 1));
      if (transdermalSE) {
        put(3222, (a.transdermalDetail && String(a.transdermalDetail).trim()) ? String(a.transdermalDetail).trim() : 'Skin reaction to transdermal estrogen product');
      }
    }
  }

  // ── Nicotine / family clots (honest; both route transdermal = patch) ──────
  const nicotine    = lifestyle.includes('nicotine');
  const familyClots = lifestyle.includes('family-clots');
  const q3223 = [];
  if (nicotine)    q3223.push(opt(3223, 0));
  if (familyClots) q3223.push(opt(3223, 1));
  if (!q3223.length) q3223.push(opt(3223, 2));
  put(3223, q3223);

  // ── Hysterectomy chain ────────────────────────────────────────────────────
  const hysterectomy = (a.hysterectomy === 'yes');
  put(3224, hysterectomy ? opt(3224, 0) : opt(3224, 1));
  if (hysterectomy) {
    put(3225, (a.hysterectomyReason && String(a.hysterectomyReason).trim()) ? String(a.hysterectomyReason).trim() : 'Medical necessity');
  }

  // ── Sleep / breast tenderness → progesterone signal ───────────────────────
  // Required question for ALL patients (black in Beluga doc).
  const sleepTenderness = symptoms.includes('trouble-sleeping') || symptoms.includes('breast-tenderness');
  put(3226, sleepTenderness ? opt(3226, 0) : opt(3226, 1));

  // Q3227 conditional: Beluga doc — "No >>> SKIP following conditional question".
  const progIntolerance = lifestyle.includes('prog-reaction');
  if (sleepTenderness) {
    put(3227, progIntolerance ? opt(3227, 0) : opt(3227, 1));
  }

  // ── Vaginal symptoms — ONLY from the single buried S2 option ──────────────
  const vaginalSymptoms = symptoms.includes('vaginal-dryness');
  put(3228, vaginalSymptoms ? [opt(3228, 1)] : [opt(3228, 5)]);

  // ── Osteoporosis / enzyme meds / BP ───────────────────────────────────────
  put(3229, diagnoses.includes('osteoporosis') ? opt(3229, 0) : opt(3229, 1));
  put(3230, [opt(3230, 13)]); // "None apply" — any enzyme med is DQ'd on frontend

  const BP_OPT = { 'low': 0, '90-139': 1, '140-159': 2, 'normal-always': 4, 'dont-know': 5 }; // 160+ is DQ
  put(3231, opt(3231, BP_OPT[a.bloodPressure] !== undefined ? BP_OPT[a.bloodPressure] : 4));

  // ── Gyn conditions + consents (consents always proceed; decliners DQ'd) ───
  const fibroids = diagnoses.includes('fibroids');
  const pcos     = diagnoses.includes('pcos');
  const endo     = diagnoses.includes('endometriosis');
  put(3233, fibroids ? opt(3233, 0) : opt(3233, 1));
  put(3232, opt(3232, 0));
  put(3234, pcos ? opt(3234, 0) : opt(3234, 1));
  put(3235, opt(3235, 0));
  put(3236, endo ? opt(3236, 0) : opt(3236, 1));
  put(3237, opt(3237, 0));
  put(3238, opt(3238, 0));

  // ── Doctor note / final consents / preference ─────────────────────────────
  put(3239, (a.doctorNote && String(a.doctorNote).trim()) ? String(a.doctorNote).trim() : 'No additional information');
  put(3240, opt(3240, 0));
  put(3241, opt(3241, 0)); // submitted via final_answers on /complete

  // Q3242 — the routing key. Default funnel outcome: FDA-approved (patch + prog).
  const wantsCompounded = (a.preference === 'compounded');
  put(3242, wantsCompounded ? opt(3242, 1) : opt(3242, 0));

  const flags = {
    adhesiveAllergy, nicotine, familyClots, transdermalSE,
    hysterectomy, sleepTenderness, progIntolerance, vaginalSymptoms,
    durationLong, wantsCompounded,
    doseTier: durationLong ? 'low' : 'normal',
    needsProgesterone: hysterectomy ? (sleepTenderness && !progIntolerance) : true,
  };

  return { apiAnswers, flags };
}

// ─── ROUTE: POST /api/v4/complete ────────────────────────────────────────────
// CRITICAL: never mutates the products= param on the Dosable checkout URL.
app.post('/api/v4/complete', async (req, res) => {
  const sessionId   = req.body.sessionId;
  const quizAnswers = req.body.quizAnswers || {};
  const clickId     = req.body.clickId || '';
  const affId       = req.body.affId   || '';
  const c1          = req.body.c1      || '';
  const contactInfo = req.body.contactInfo || {};

  // Cancel any pending abandon-recovery check for this email — checkout fired.
  if (contactInfo.email) cancelAbandonCheck({ email: contactInfo.email });

  // Session resolution (lead-first, production-proven).
  // NOTE (known edge): Dosable dedupes leads (e.g. by phone) and returns the
  // SAME session for a returning taker, so conditional answers from a prior
  // run can linger when the new payload legitimately omits them (Beluga skip
  // rules). Fresh-minted /sessions/ can't complete (bare-user validation), so
  // we accept this pre-existing v1/v2/v3 behavior for repeat takers.
  let resolvedSessionId = sessionId;
  if (!resolvedSessionId) {
    const ci = contactInfo;
    if (ci.email && ci.firstName && ci.lastName && ci.phone) {
      console.log('v4: No sessionId - creating session from contact info');
      // Full lead payload (mirrors /api/lead) — Dosable's completion validator
      // requires the LEAD RECORD itself to carry these fields; a minimal lead
      // cannot be completed even if /complete supplies them.
      const leadPayload = {
        tenant_id:  TENANT_ID,
        first_name: ci.firstName,
        last_name:  ci.lastName,
        email:      ci.email,
        phone:      ci.phone.replace(/\D/g, ''),
        birthday:   formatDob(ci.dob) || undefined,
        lead_state: normalizeState(ci.state) || undefined,
        zip_code:   '00000',
        gender:     'Female',
      };
      Object.keys(leadPayload).forEach(k => leadPayload[k] === undefined && delete leadPayload[k]);
      const leadRes = await dosable('post', '/leads/', leadPayload);
      if (leadRes.ok && leadRes.data && leadRes.data.session_id) {
        resolvedSessionId = leadRes.data.session_id;
      } else if (leadRes.status === 409) {
        const sessRes = await dosable('post', '/sessions/', { tenant_id: TENANT_ID, email: ci.email });
        if (sessRes.ok && sessRes.data) resolvedSessionId = sessRes.data.session_id;
      }
    }
  }
  if (!resolvedSessionId) {
    return res.status(400).json({ error: 'No session available. Please retake the quiz.' });
  }

  const { apiAnswers, flags } = remapAnswersV4(quizAnswers);

  // Byte-exact validation against the canonical live question set.
  const validationErrors = validateV4Answers(apiAnswers);
  if (validationErrors.length) {
    console.error('v4: CANONICAL VALIDATION FAILED — NOT submitting to Dosable:\n  ' + validationErrors.join('\n  '));
    return res.status(500).json({ error: 'Internal answer-mapping error. Please contact support.', detail: validationErrors });
  }

  console.log('v4: Submitting answers for session', resolvedSessionId, 'flags:', JSON.stringify(flags));

  const bulkAnswersV4 = Object.fromEntries(
    Object.entries(apiAnswers).filter(([k]) => parseInt(k) !== Q.consent_truthfulness)
  );
  const bulkRes = await dosable('put', `/sessions/${resolvedSessionId}`, bulkAnswersV4);
  if (!bulkRes.ok) {
    console.error('v4: Bulk save failed:', JSON.stringify(bulkRes.data).slice(0, 800));
    return res.status(502).json({ error: 'Answer submission failed', detail: bulkRes.data });
  }

  const completeLead = {
    ...(contactInfo.firstName && { first_name: contactInfo.firstName }),
    ...(contactInfo.lastName  && { last_name:  contactInfo.lastName }),
    ...(contactInfo.dob       && { birthday:   formatDob(contactInfo.dob) }),
    ...(contactInfo.state     && { lead_state: normalizeState(contactInfo.state) }),
    gender: 'Female',
  };
  const completePayload = {
    ...completeLead,
    schedule: 'monthly',
    final_answers: {
      [Q.consent_truthfulness]: apiAnswers[Q.consent_truthfulness],
    },
  };
  if (clickId) completePayload.cc_custom_cid = clickId;
  if (affId)   completePayload.aff_id        = affId;
  if (c1)      completePayload.c1            = c1;

  const completeRes = await dosable('post', `/sessions/${resolvedSessionId}/complete`, completePayload);
  if (!completeRes.ok) {
    console.error('v4: Session complete failed:', JSON.stringify(completeRes.data).slice(0, 800));
    return res.status(502).json({ error: 'Session completion failed', detail: completeRes.data });
  }

  // CRITICAL: pass through Dosable's checkout URL unchanged on products= param
  const rawCheckoutUrl = completeRes.data.checkout_url || CHECKOUT_BASE;
  const finalCheckoutUrl = appendCheckoutParams(rawCheckoutUrl, clickId, affId, c1);

  const products = parseCheckoutProducts(finalCheckoutUrl);
  const productDisplay = buildProductDisplay(products);

  console.log('v4: Checkout URL:', finalCheckoutUrl);
  console.log('v4: Product match:', productDisplay.name, '($' + productDisplay.totalPrice + ')');

  logSubmission('v4', {
    email: contactInfo.email || '',
    sessionId: resolvedSessionId,
    clickId,
    product: productDisplay.name,
    checkoutUrl: finalCheckoutUrl,
    state: contactInfo.state || '',
  });
  logToSheet('v4', {
    quizAnswers, contactInfo, apiAnswers,
    sessionId: resolvedSessionId, clickId, affId, c1,
    checkoutUrl: finalCheckoutUrl, productName: productDisplay.name,
    lastStep: 20, submissionStatus: 'complete',
  });

  return res.json({
    ok: true,
    checkoutUrl: finalCheckoutUrl,
    product: productDisplay,
    flags,
    sessionId: resolvedSessionId,
  });
});
