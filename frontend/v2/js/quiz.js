/*
   ClearedRx Quiz Funnel — quiz.js V2
   ============================================================
   STEP MAP (37 steps):
    1  Duration (single-select, auto-advance)
    2  Interstitial: Normalization
    3  Age (single-select, auto-advance)
    4  Menstrual status (single-select, auto-advance)
    5  Interstitial: Educational #1 (estrogen science)
    6  Symptom checklist (multi-select, 14 options, 2-col grid)
    7  Interstitial: Personalized symptom acknowledgment (dynamic)
    8  Severity (single-select, auto-advance)
    9  Vaginal & urinary symptoms (multi-select)
   10  Interstitial: Educational #2 (HRT gold standard)
   11  What have you tried (single-select, auto-advance)
   12  What held you back (single-select, auto-advance)
   13  Interstitial: Privacy
   14  Sex assigned at birth (DQ)
   15  Pregnancy/breastfeeding (DQ)
   16  Medical conditions (multi-select, DQ)
   17  Current medications (multi-select, DQ)
   18  Allergies (yes/no + text)
   19  Blood pressure (DQ)
   20  Nicotine (single-select)
   21  Hysterectomy (routing)
   22  Sleep/breast tenderness (conditional)
   23  Progesterone intolerance (conditional)
   24  HRT history (single-select)
   25  Transdermal side effects (conditional)
   26  Treatment preference (compound vs standard)
   27  Interstitial: Personalized relief timeline (dynamic)
   28  Interstitial: Testimonial
   29  Interstitial: 87% stat
   30  State
   31  DOB
   32  Name
   33  Email
   34  Phone + lead capture
   35  Informed consent
   36  Great candidate
   37  Loading -> redirect
   ============================================================ */

(function() {
  'use strict';

  var TOTAL_STEPS = 47;
  var STEP_ORDER = [2,1,3,4,6,7,8,9,10,11,12,38,13,14,15,16,45,17,44,18,46,19,20,43,21,39,22,23,24,40,41,42,25,26,27,28,29,30,31,32,33,34,47,35,36,37];
  var currentStep = 2;
  var answers     = {};

  var PROXY_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : 'https://crx-server-hzyh.onrender.com';

  var sessionId    = null;
  var userId       = null;
  var leadCaptured = false;

  /* ── Symptom explanations for personalized interstitial ─────────────── */
  var SYMPTOM_EXPLAIN = {
    'thinning-hair':       'Hair thinning accelerates when estrogen drops \u2014 estrogen is what keeps hair in its growth phase.',
    'dry-skin':            'Estrogen drives collagen and oil production. When it declines, skin loses moisture and elasticity.',
    'aging-skin':          'Collagen production drops ~30% in the first 5 years of menopause, accelerating visible aging.',
    'brain-fog':           'Estrogen is a key neurotransmitter regulator. When it declines, concentration, memory, and clarity suffer.',
    'joint-pain':          'Estrogen has natural anti-inflammatory properties. Without it, joint stiffness and aches become common.',
    'anxiety-depression':  'Estrogen and progesterone directly affect serotonin and GABA \u2014 your brain\u2019s calming chemicals.',
    'mood-swings':         'Fluctuating hormone levels cause rapid shifts in brain chemistry, leading to unpredictable mood changes.',
    'sleep-problems':      'Progesterone promotes deep sleep, and estrogen regulates body temperature \u2014 both decline in menopause.',
    'fatigue':             'When your hormones are out of balance, your body works harder to maintain basic functions, draining energy.',
    'low-libido':          'Desire is hormonally driven. Declining estrogen and testosterone directly reduce arousal and interest.',
    'weight-gain':         'Estrogen helps regulate metabolism and fat distribution. Its decline shifts fat storage to the midsection.',
    'hot-flashes':         'Your brain\u2019s thermostat becomes hypersensitive to small temperature changes when estrogen is low.',
    'night-sweats':        'Night sweats are hot flashes that strike during sleep, disrupting your body\u2019s ability to rest and recover.',
    'vaginal-dryness':     'Vaginal tissue depends on estrogen for moisture and elasticity. Declining levels cause dryness and discomfort.',
  };

  // Priority order: show surprising/educational ones first
  var EXPLAIN_PRIORITY = [
    'thinning-hair','dry-skin','aging-skin','joint-pain','brain-fog',
    'anxiety-depression','sleep-problems','fatigue','mood-swings',
    'weight-gain','low-libido','vaginal-dryness','hot-flashes','night-sweats'
  ];

  /* ── Relief timeline symptom mapping ────────────────────────────────── */
  var TIMELINE_MAP = {
    early: { // Week 1-2
      symptoms: ['hot-flashes','night-sweats','sleep-problems','anxiety-depression','mood-swings'],
      labels: {
        'hot-flashes': 'Hot flash frequency begins to decrease',
        'night-sweats': 'Night sweats become less intense',
        'sleep-problems': 'Sleep quality starts to improve',
        'anxiety-depression': 'Mood begins to stabilize',
        'mood-swings': 'Emotional swings start to even out',
      }
    },
    building: { // Week 3-4
      symptoms: ['brain-fog','fatigue','low-libido','weight-gain','vaginal-dryness'],
      labels: {
        'brain-fog': 'Brain fog begins to lift, focus returns',
        'fatigue': 'Energy levels noticeably improve',
        'low-libido': 'Desire and arousal begin to return',
        'weight-gain': 'Metabolism starts to rebalance',
        'vaginal-dryness': 'Vaginal moisture and comfort improve',
      }
    },
    full: { // Month 2-3
      symptoms: ['thinning-hair','dry-skin','aging-skin','joint-pain'],
      labels: {
        'thinning-hair': 'Hair shedding slows as follicles respond to estrogen',
        'dry-skin': 'Skin hydration and texture improve',
        'aging-skin': 'Collagen production increases, skin firms up',
        'joint-pain': 'Joint stiffness and aches reduce',
      }
    }
  };


  var SEVERITY_VALIDATION = {
    mild: 'Even mild symptoms deserve attention \u2014 early treatment prevents them from getting worse.',
    moderate: 'You don\u2019t have to keep pushing through this. Treatment can help.',
    significant: 'We hear this a lot. The good news: these symptoms respond very well to treatment.',
    severe: 'You\u2019ve been dealing with a lot. Relief is closer than you think.',
  };

  var DURATION_LABELS = {
    'less-than-6mo': 'a few months',
    '6mo-to-2yr': 'up to 2 years',
    '2-to-5yr': '2\u20135 years',
    'more-than-5yr': 'over 5 years',
    'not-sure': 'some time now',
  };

  /* ── DQ messages ────────────────────────────────────────────────────── */
  var DISQUALIFY_REASON = null;

  var DQ_MESSAGES = {
    'active-breast-cancer':  { headline: 'Your safety comes first.', body: 'A history of active breast cancer means HRT is not clinically appropriate at this time. We strongly recommend speaking with your oncologist or a specialist who can review your full medical history.' },
    'family-cancer':         { headline: 'Your safety comes first.', body: 'A personal or family history of hormone-sensitive cancers means our physicians cannot safely prescribe HRT. Please consult with your primary care physician or OB-GYN for personalized guidance.' },
    'blood-clots':           { headline: 'Your safety comes first.', body: 'A history of blood clots or deep vein thrombosis means HRT carries significant risks that our physicians cannot manage remotely. Please speak with a specialist who can review your full history.' },
    'stroke-tia':            { headline: 'Your safety comes first.', body: 'A history of stroke or TIA means HRT is not appropriate at this time. We recommend speaking with your neurologist or primary care physician.' },
    'heart-disease':         { headline: 'Your safety comes first.', body: 'A history of heart disease means HRT requires in-person specialist oversight. Please consult with your cardiologist or primary care physician.' },
    'unexplained-bleeding':  { headline: 'We need you to see a doctor first.', body: 'Unexplained vaginal bleeding needs to be evaluated by a physician before starting HRT. Please see your OB-GYN \u2014 this is an important first step.' },
    'liver-disease':         { headline: 'Your safety comes first.', body: 'Active liver disease affects how your body processes hormones, making HRT unsafe without specialist oversight. Please speak with your hepatologist or primary care physician.' },
    'carbamazepine':         { headline: 'A medication interaction was detected.', body: 'One of your current medications interacts with HRT in a way that requires in-person specialist management. Please speak with your prescribing physician before starting hormone therapy.' },
    'phenytoin':             { headline: 'A medication interaction was detected.', body: 'One of your current medications interacts with HRT in a way that requires in-person specialist management. Please speak with your prescribing physician before starting hormone therapy.' },
    'rifampin':              { headline: 'A medication interaction was detected.', body: 'One of your current medications interacts with HRT in a way that requires in-person specialist management. Please speak with your prescribing physician before starting hormone therapy.' },
    'st-johns-wort':         { headline: 'A supplement interaction was detected.', body: "St. John\u2019s Wort significantly reduces the effectiveness of hormone therapy. Please speak with your physician about alternatives before starting HRT." },
    'topiramate':            { headline: 'A medication interaction was detected.', body: 'One of your current medications interacts with HRT in a way that requires in-person specialist management. Please speak with your prescribing physician before starting hormone therapy.' },
    'lamotrigine':           { headline: 'A medication interaction was detected.', body: 'One of your current medications interacts with HRT in a way that requires in-person specialist management. Please speak with your prescribing physician before starting hormone therapy.' },
    'barbiturates':          { headline: 'A medication interaction was detected.', body: 'One of your current medications interacts with HRT in a way that requires in-person specialist management. Please speak with your prescribing physician before starting hormone therapy.' },
    'pregnant':              { headline: 'HRT is not appropriate during pregnancy.', body: 'Hormone replacement therapy is not safe during pregnancy. Please speak with your OB-GYN for appropriate prenatal care and support.' },
    'breastfeeding':         { headline: 'HRT is not appropriate while breastfeeding.', body: 'Hormone replacement therapy is not recommended while breastfeeding. Please speak with your OB-GYN once you have finished breastfeeding.' },
    'male':                  { headline: 'This program is designed for women.', body: "ClearedRx\u2019s HRT program is specifically designed for women experiencing menopause or perimenopause. If you were looking for a different type of hormone therapy, please visit our main site." },
    'lupus':                  { headline: 'Your safety comes first.', body: 'Lupus with clotting antibodies significantly increases the risk of blood clots with HRT. Our physicians cannot safely prescribe hormone therapy remotely in this case. Please speak with your rheumatologist or primary care physician.' },
    'clotting-disorder':       { headline: 'Your safety comes first.', body: 'An inherited blood clotting disorder means HRT carries significant risks that require in-person specialist management. Please speak with a hematologist or your primary care physician.' },
    'high-160-plus':         { headline: 'Your blood pressure needs attention first.', body: 'A blood pressure reading of 160+ systolic means HRT is not safe to prescribe remotely. Please see your primary care physician to get your blood pressure managed before starting hormone therapy.' },
  };

  var DISQUALIFY = {
    'step-14': ['male'],
    'step-15': ['pregnant','breastfeeding'],
    'step-16': ['active-breast-cancer','family-cancer','blood-clots','stroke-tia',
                'heart-disease','unexplained-bleeding','liver-disease','lupus','clotting-disorder'],
    'step-17': ['carbamazepine','phenytoin','rifampin','st-johns-wort',
                'topiramate','lamotrigine','barbiturates'],
    'step-19': ['high-160-plus'],
  };

  /* ── Init ────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function() {
    // Capture URL tracking params
    var urlParams = new URLSearchParams(window.location.search);
    var urlCoupon = urlParams.get('couponCode');
    var urlCid    = urlParams.get('cc_custom_cid');
    var urlAffId  = urlParams.get('affId');
    var urlC1     = urlParams.get('c1');
    if (urlCoupon) sessionStorage.setItem('crx_coupon',         urlCoupon);
    if (urlCid)    sessionStorage.setItem('crx_cc_custom_cid',  urlCid);
    if (urlAffId)  sessionStorage.setItem('crx_aff_id',         urlAffId);
    if (urlC1)     sessionStorage.setItem('crx_c1',             urlC1);

    // Restore session
    var saved = sessionStorage.getItem('crx_session');
    if (saved) {
      try {
        var s = JSON.parse(saved);
        if (s.answers)    answers = s.answers;
        if (s.sessionId)  sessionId = s.sessionId;
        if (s.userId)     userId = s.userId;
        if (s.step)       currentStep = s.step;
        if (s.leadCaptured) leadCaptured = true;
      } catch(e) {}
    }

    bindOptions();
    bindGynStep();
    bindNextButtons();
    bindAllergyFlow();
    bindContactNextButtons();
    bindPrefCards();
    bindSymptomCounter();

    showStep(currentStep);
  });

  /* ── Session persistence ─────────────────────────────────────────────── */
  function saveSession() {
    sessionStorage.setItem('crx_session', JSON.stringify({
      step: currentStep,
      answers: answers,
      sessionId: sessionId,
      userId: userId,
      leadCaptured: leadCaptured,
    }));
  }

  /* ── Progress bar ────────────────────────────────────────────────────── */
  function updateProgress(step) {
    var fill = document.getElementById('progressFill');
    var stepIdx = STEP_ORDER.indexOf(step);
    if (stepIdx < 0) stepIdx = 0;
    var pct = Math.round((stepIdx / (STEP_ORDER.length - 1)) * 100);
    if (fill) fill.style.width = pct + '%';
  }

  /* ── Show step ───────────────────────────────────────────────────────── */
  function showStep(n) {
    currentStep = n;
    saveSession();
    updateProgress(n);

    // Back button visibility
    var backBtn = document.getElementById('quizBackBtn');
    if (backBtn) { if (n <= 2) backBtn.classList.remove('visible'); else backBtn.classList.add('visible'); }

    // Remove active from ALL steps first (prevents stale steps on session restore)
    var allSteps = document.querySelectorAll('.quiz-step.active');
    for (var i = 0; i < allSteps.length; i++) {
      allSteps[i].classList.remove('active', 'exit');
    }

    var el = document.getElementById('step-' + n);
    if (!el) return;

    // Populate dynamic interstitials before showing
    if (n === 7) populateSymptomInterstitial();
    if (n === 27) populateReliefTimeline();
    if (n === 26) populateStep26();
    if (n === 36) populateGreatCandidate();

    el.classList.add('active');
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Auto-show next button for multi-select steps if selections exist
    var nextBtn = el.querySelector('.quiz-next-btn');
    if (nextBtn && el.querySelector('.multi')) {
      var hasSelected = el.querySelectorAll('.option-btn.selected').length > 0;
      if (hasSelected) nextBtn.classList.add('visible');
    }
  }

  /* ── Navigation: getNextStep ─────────────────────────────────────────── */
  function getNextStep(from) {
    // Step 2 (normalization interstitial) -> 1 (duration) -> 3 (age)
    if (from === 2) return 1;
    if (from === 1) return 3;

    // Step 12 = barriers: safety-concerns -> 38 (reassurance), else -> 13
    if (from === 12) {
      return (answers['step-12'] === 'safety-concerns') ? 38 : 13;
    }
    // Step 38 (safety reassurance) -> 13
    if (from === 38) return 13;

    // Step 16 (conditions) -> 45 (free-text conditions) or 17 (meds)
    if (from === 16) {
      var conds = answers['step-16'] || 'none';
      return (conds !== 'none') ? 45 : 17;
    }
    // Step 45 (conditions free text) -> 17
    if (from === 45) return 17;
    // Step 17 (meds) -> 44 (free-text meds) or 18 (allergies)
    if (from === 17) {
      var meds = answers['step-17'] || 'not-on-any-medications';
      return (meds !== 'not-on-any-medications') ? 44 : 18;
    }
    // Step 44 (meds free text) -> 18
    if (from === 44) return 18;
    // Step 18 (allergies) -> 46 (adhesive allergy)
    if (from === 18) return 46;
    // Step 46 (adhesive allergy) -> 19 (blood pressure)
    if (from === 46) return 19;
    // Step 20 (nicotine) -> 43 (gynecological history: combined endo/fibroids/PCOS)
    if (from === 20) return 43;
    // Step 43 (gynecological history) -> 21 (hysterectomy)
    if (from === 43) return 21;

    // Step 21 = hysterectomy: YES -> 39 (hyst reason), NO -> 24 (skip sleep/breast)
    if (from === 21) {
      return (answers['step-21'] === 'yes') ? 39 : 24;
    }
    // Step 39 (hyst reason) -> 22 (sleep/breast)
    if (from === 39) return 22;
    // Step 22 = sleep/breast: neither -> 24, else -> 23
    if (from === 22) {
      return (answers['step-22'] === 'neither') ? 24 : 23;
    }
    // Step 23 -> 24
    if (from === 23) return 24;
    // Step 24 = HRT history: never -> skip HRT loop, go to 26
    if (from === 24) {
      return (answers['step-24'] === 'never') ? 26 : 40;
    }
    // Step 40 (HRT type used) -> 41 (side effects y/n)
    if (from === 40) return 41;
    // Step 41 (HRT side effects y/n): yes -> 42 (detail), no -> 25
    if (from === 41) {
      return (answers['step-41'] === 'yes') ? 42 : 25;
    }
    // Step 42 (side effects detail) -> 25 (transdermal SE)
    if (from === 42) return 25;
    // Step 25 -> 26
    if (from === 25) return 26;
    // Step 26 (treatment pref) -> 27 (relief timeline)
    if (from === 26) return 27;
    // Step 34 (phone) -> 47 (doctor questions)
    if (from === 34) return 47;
    // Step 47 (doctor questions) -> 35 (consent)
    if (from === 47) return 35;

    // Default: next step
    return from + 1;
  }

  /* ── Navigation: getPrevStep ─────────────────────────────────────────── */
  function getPrevStep(from) {
    // Step 1 (duration) -> 2 (normalization)
    if (from === 1) return 2;
    // Step 3 (age) -> 1 (duration)
    if (from === 3) return 1;
    // Step 38 -> 12
    if (from === 38) return 12;
    // Step 13 -> 38 (if safety-concerns) or 12
    if (from === 13) {
      return (answers['step-12'] === 'safety-concerns') ? 38 : 12;
    }
    // Step 45 (conditions free text) <- 16
    if (from === 45) return 16;
    // Step 17 <- 45 or 16
    if (from === 17) {
      var conds = answers['step-16'] || 'none';
      return (conds !== 'none') ? 45 : 16;
    }
    // Step 44 (meds free text) <- 17
    if (from === 44) return 17;
    // Step 18 <- 44 or 17
    if (from === 18) {
      var meds = answers['step-17'] || 'not-on-any-medications';
      return (meds !== 'not-on-any-medications') ? 44 : 17;
    }
    // Step 46 (adhesive allergy) <- 18
    if (from === 46) return 18;
    // Step 19 (blood pressure) <- 46
    if (from === 19) return 46;
    // Gynecological block back nav
    if (from === 43) return 20;
    if (from === 21) return 43;
    // Step 39 (hyst reason) <- 21
    if (from === 39) return 21;
    // Step 22 <- 39 (if hysterectomy=yes) or 21
    if (from === 22) {
      return (answers['step-21'] === 'yes') ? 39 : 21;
    }
    // Step 24 -> depends on hysterectomy path
    if (from === 24) {
      if (answers['step-21'] === 'yes') {
        var st = answers['step-22'] || '';
        if (st === 'neither') return 22;
        return 23;
      }
      return 21;
    }
    // Step 47 (doctor questions) <- 34
    if (from === 47) return 34;
    // Step 35 <- 47
    if (from === 35) return 47;
    // HRT conditional loop back nav
    if (from === 40) return 24;
    if (from === 41) return 40;
    if (from === 42) return 41;
    if (from === 25) {
      return (answers['step-41'] === 'yes') ? 42 : 41;
    }
    // Step 26 -> 25 or 24
    if (from === 26) {
      return (answers['step-24'] !== 'never') ? 25 : 24;
    }
    // Default: previous step
    return from - 1;
  }

  /* ── Advance ─────────────────────────────────────────────────────────── */
  function advance() {
    var next = getNextStep(currentStep);
    if (next > TOTAL_STEPS) return;
    var cur = document.getElementById('step-' + currentStep);
    if (cur) {
      cur.classList.add('exit');
      setTimeout(function() {
        cur.classList.remove('active', 'exit');
        showStep(next);
      }, 220);
    } else {
      showStep(next);
    }
  }

  /* ── Record answer ───────────────────────────────────────────────────── */
  function recordAnswer(key, value) {
    answers[key] = value;
    saveSession();
  }

  /* ── Back button ─────────────────────────────────────────────────────── */
  function bindBackButton() {
    var btn = document.getElementById('quizBackBtn');
    if (!btn) return;
    btn.addEventListener('click', function() {
      if (currentStep <= 1) return;
      var prev = getPrevStep(currentStep);
      if (prev < 1) prev = 1;
      var cur = document.getElementById('step-' + currentStep);
      if (cur) cur.classList.remove('active');
      showStep(prev);
    });
  }
  bindBackButton();

  /* ── Single-select option buttons ────────────────────────────────────── */
  function bindOptions() {
    document.querySelectorAll('.quiz-step').forEach(function(stepEl) {
      var optionsList = stepEl.querySelector('.options-list, .options-grid');
      if (!optionsList) return;
      var isMulti = optionsList.classList.contains('multi');

      stepEl.querySelectorAll('.option-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          if (isMulti) {
            // Multi-select: toggle, handle "none" exclusivity
            if (btn.dataset.value === 'none' || btn.dataset.value === 'not-on-any-medications') {
              stepEl.querySelectorAll('.option-btn').forEach(function(b) { b.classList.remove('selected'); });
              btn.classList.add('selected');
            } else {
              stepEl.querySelectorAll('.option-btn[data-value="none"], .option-btn[data-value="not-on-any-medications"]').forEach(function(b) { b.classList.remove('selected'); });
              btn.classList.toggle('selected');
            }
            // Show/hide next button
            var nextBtn = stepEl.querySelector('.quiz-next-btn');
            var anySelected = stepEl.querySelectorAll('.option-btn.selected').length > 0;
            if (nextBtn) {
              if (anySelected) nextBtn.classList.add('visible');
              else nextBtn.classList.remove('visible');
            }
            // Update symptom counter for step 6
            if (stepEl.id === 'step-6') updateSymptomCount();
          } else {
            // Single-select: record + advance
            stepEl.querySelectorAll('.option-btn').forEach(function(b) { b.classList.remove('selected'); });
            btn.classList.add('selected');

            // Record special answers
            if (stepEl.id === 'step-20') recordAnswer('nicotine-use', btn.dataset.value);
            if (stepEl.id === 'step-25') recordAnswer('transdermal-se', btn.dataset.value);
            if (stepEl.id === 'step-46') recordAnswer('adhesive-allergy', btn.dataset.value);

            recordAnswer(stepEl.id, btn.dataset.value);

            // Severity validation message (step 8)
            if (stepEl.id === 'step-8' && SEVERITY_VALIDATION[btn.dataset.value]) {
              var sevEl = document.getElementById('severity-validation');
              if (sevEl) {
                sevEl.textContent = SEVERITY_VALIDATION[btn.dataset.value];
                sevEl.classList.add('visible');
              }
              // Delay advance to let user read the message
              setTimeout(advance, 1200);
              return;
            }

            // DQ check for single-select
            if (DISQUALIFY[stepEl.id] && DISQUALIFY[stepEl.id].indexOf(btn.dataset.value) !== -1) {
              setTimeout(function() { showDisqualify(btn.dataset.value); }, 320);
              return;
            }
            setTimeout(advance, 320);
          }
        });
      });
    });
  }

  /* ── Multi-select next buttons ───────────────────────────────────────── */
  function bindNextButtons() {
    var skipIds = ['step-30-next-state','step-31-next-dob','step-32-next-name',
                   'step-33-next-email','step-34-next-phone',
                   'step-18-allergy-next','step-35-next','step-43-next'];
    document.querySelectorAll('.quiz-next-btn').forEach(function(btn) {
      if (skipIds.indexOf(btn.id) !== -1) return;
      btn.addEventListener('click', function() {
        var stepEl = btn.closest('.quiz-step');
        if (!stepEl) { advance(); return; }
        var vals = [];
        stepEl.querySelectorAll('.option-btn.selected').forEach(function(s) { vals.push(s.dataset.value); });
        // DQ check
        if (DISQUALIFY[stepEl.id]) {
          for (var i = 0; i < vals.length; i++) {
            if (DISQUALIFY[stepEl.id].indexOf(vals[i]) !== -1) {
              showDisqualify(vals[i]);
              return;
            }
          }
        }
        recordAnswer(stepEl.id, vals.join(','));
        // Capture "Other" symptom free text for step-6
        if (stepEl.id === 'step-6') {
          var otherText = document.getElementById('other-symptom-text');
          if (otherText && otherText.value.trim()) {
            answers['other-symptoms-text'] = otherText.value.trim();
          }
        }
        advance();
      });
    });
  }


  /* ── Gynecological conditions (step 43) consent logic ────────────── */
  function bindGynStep() {
    var gynStep = document.getElementById('step-43');
    if (!gynStep) return;
    var consentWrap = document.getElementById('gyn-consents');
    var consentEndo = document.getElementById('consent-endo');
    var consentFib = document.getElementById('consent-fibroids');
    var consentPcos = document.getElementById('consent-pcos');
    var nextBtn = document.getElementById('step-43-next');

    // Update consent visibility based on selections
    function updateGynConsents() {
      var selected = gynStep.querySelectorAll('.option-btn.selected');
      var vals = [];
      for (var i = 0; i < selected.length; i++) vals.push(selected[i].dataset.value);
      var hasEndo = vals.indexOf('endometriosis') !== -1;
      var hasFib = vals.indexOf('fibroids') !== -1;
      var hasPcos = vals.indexOf('pcos') !== -1;
      var anyCondition = hasEndo || hasFib || hasPcos;

      if (consentWrap) consentWrap.style.display = anyCondition ? 'flex' : 'none';
      if (consentEndo) consentEndo.style.display = hasEndo ? 'block' : 'none';
      if (consentFib) consentFib.style.display = hasFib ? 'block' : 'none';
      if (consentPcos) consentPcos.style.display = hasPcos ? 'block' : 'none';

      // Show next button if any selection made
      if (nextBtn) {
        if (vals.length > 0) nextBtn.classList.add('visible');
        else nextBtn.classList.remove('visible');
      }
    }

    // Listen for clicks on step 43 option buttons
    gynStep.querySelectorAll('.option-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        // "None" is exclusive — deselect everything else
        if (btn.dataset.value === 'none') {
          gynStep.querySelectorAll('.option-btn').forEach(function(b) { b.classList.remove('selected'); });
          btn.classList.add('selected');
        } else {
          // Deselect "none" if picking a condition
          var noneBtn = gynStep.querySelector('[data-value="none"]');
          if (noneBtn) noneBtn.classList.remove('selected');
        }
        updateGynConsents();
      });
    });

    // Next button records answer and advances
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        var selected = gynStep.querySelectorAll('.option-btn.selected');
        var vals = [];
        for (var i = 0; i < selected.length; i++) vals.push(selected[i].dataset.value);
        recordAnswer('step-43', vals.join(','));
        // Also record individual keys for server mapping
        recordAnswer('has-endometriosis', vals.indexOf('endometriosis') !== -1 ? 'yes' : 'no');
        recordAnswer('has-fibroids', vals.indexOf('fibroids') !== -1 ? 'yes' : 'no');
        recordAnswer('has-pcos', vals.indexOf('pcos') !== -1 ? 'yes' : 'no');
        advance();
      });
    }
  }

  /* ── Allergy flow ────────────────────────────────────────────────────── */
  function bindAllergyFlow() {
    var noBtn       = document.getElementById('allergy-no-btn');
    var yesBtn      = document.getElementById('allergy-yes-btn');
    var textWrap    = document.getElementById('allergy-text-wrap');
    var allergyNext = document.getElementById('step-18-allergy-next');
    var allergyInput = document.getElementById('allergy-input');

    if (noBtn) {
      noBtn.addEventListener('click', function() {
        if (yesBtn) yesBtn.classList.remove('selected');
        noBtn.classList.add('selected');
        if (textWrap) textWrap.classList.remove('visible');
        recordAnswer('allergies', 'none');
        setTimeout(advance, 320);
      });
    }
    if (yesBtn) {
      yesBtn.addEventListener('click', function() {
        if (noBtn) noBtn.classList.remove('selected');
        yesBtn.classList.add('selected');
        if (textWrap) textWrap.classList.add('visible');
        if (allergyInput) allergyInput.focus();
      });
    }
    if (allergyNext) {
      allergyNext.addEventListener('click', function() {
        var val = allergyInput ? allergyInput.value.trim() : '';
        recordAnswer('allergies', val || 'yes-unspecified');
        advance();
      });
    }
  }

  /* ── Preference cards ────────────────────────────────────────────────── */
  function bindPrefCards() {
    document.querySelectorAll('.pref-card').forEach(function(card) {
      card.addEventListener('click', function() {
        document.querySelectorAll('.pref-card').forEach(function(c) { c.classList.remove('selected'); });
        card.classList.add('selected');
        var stepEl = card.closest('.quiz-step');
        if (stepEl) recordAnswer(stepEl.id, card.dataset.value);
        setTimeout(advance, 400);
      });
    });
  }

  /* ── Symptom counter ─────────────────────────────────────────────────── */
  function bindSymptomCounter() {
    // Initial state
    updateSymptomCount();
  }

  function updateSymptomCount() {
    var el = document.getElementById('symptom-count');
    if (!el) return;
    // Show/hide "Other" textarea
    var otherWrap = document.getElementById('other-symptom-wrap');
    var otherSelected = document.querySelector('#step-6 .option-btn.selected[data-value="other"]');
    if (otherWrap) otherWrap.style.display = otherSelected ? 'block' : 'none';
    var count = document.querySelectorAll('#step-6 .option-btn.selected').length;
    if (count >= 3) {
      el.textContent = "You\u2019ve identified " + count + " symptoms linked to hormone decline.";
      el.classList.add('visible');
    } else {
      el.classList.remove('visible');
    }
  }

  /* ── Personalized symptom interstitial (step 7) ──────────────────────── */
  function populateSymptomInterstitial() {
    var selected = [];
    document.querySelectorAll('#step-6 .option-btn.selected').forEach(function(b) {
      selected.push(b.dataset.value);
    });
    var count = selected.length;

    var headlineEl = document.getElementById('symptom-interstitial-headline');
    var bodyEl = document.getElementById('symptom-interstitial-body');
    if (!headlineEl || !bodyEl) return;

    if (count === 0) {
      headlineEl.textContent = "Let\u2019s find the right treatment for you.";
      bodyEl.innerHTML = '<p>Even without specific symptoms selected, hormone therapy may help you feel more like yourself.</p>';
      return;
    }

    headlineEl.textContent = 'The ' + count + ' symptom' + (count > 1 ? 's' : '') + ' you selected ' + (count > 1 ? 'are' : 'is') + ' directly connected to declining estrogen and progesterone.';

    // Pick top 3 surprising explanations
    var explanations = [];
    for (var i = 0; i < EXPLAIN_PRIORITY.length && explanations.length < 3; i++) {
      var key = EXPLAIN_PRIORITY[i];
      if (selected.indexOf(key) !== -1 && SYMPTOM_EXPLAIN[key]) {
        explanations.push('<div class="explain-item"><strong>' + formatSymptomLabel(key) + ':</strong> ' + SYMPTOM_EXPLAIN[key] + '</div>');
      }
    }

    if (explanations.length > 0) {
      bodyEl.innerHTML = explanations.join('');
    } else {
      bodyEl.innerHTML = '<p>Your symptoms are a direct result of hormonal changes \u2014 and they\u2019re highly treatable with the right approach.</p>';
    }
  }

  function formatSymptomLabel(key) {
    var labels = {
      'hot-flashes': 'Hot flashes', 'night-sweats': 'Night sweats', 'sleep-problems': 'Sleep problems',
      'mood-swings': 'Mood swings', 'anxiety-depression': 'Anxiety & depression', 'brain-fog': 'Brain fog',
      'fatigue': 'Fatigue', 'low-libido': 'Low libido', 'vaginal-dryness': 'Vaginal dryness',
      'weight-gain': 'Weight gain', 'thinning-hair': 'Thinning hair', 'dry-skin': 'Dry skin',
      'joint-pain': 'Joint pain', 'aging-skin': 'Aging skin',
    };
    return labels[key] || key;
  }

  /* ── Personalized relief timeline (step 27) ──────────────────────────── */
  function populateReliefTimeline() {
    var selected = (answers['step-6'] || '').split(',').filter(function(s) { return s; });
    var el = document.getElementById('relief-timeline-content');
    var durationEl = document.getElementById('relief-duration-callback');
    if (!el) return;

    var phases = [
      { title: 'Week 1\u20132: Early changes', map: TIMELINE_MAP.early },
      { title: 'Week 3\u20134: Building momentum', map: TIMELINE_MAP.building },
      { title: 'Month 2\u20133: Full relief', map: TIMELINE_MAP.full },
    ];

    var html = '';
    phases.forEach(function(phase) {
      var items = [];
      phase.map.symptoms.forEach(function(sym) {
        if (selected.indexOf(sym) !== -1 && phase.map.labels[sym]) {
          items.push(phase.map.labels[sym]);
        }
      });
      // Always show each phase, use generic text if no specific matches
      if (items.length === 0) {
        if (phase === phases[0]) items.push('Your body begins adjusting to restored hormone levels');
        else if (phase === phases[1]) items.push('Symptom relief becomes more noticeable day by day');
        else items.push('Full symptom improvement as hormone balance stabilizes');
      }
      html += '<div class="relief-phase">';
      html += '<div class="relief-phase-label">' + phase.title + '</div>';
      html += '<div class="relief-phase-items">';
      items.forEach(function(item) {
        html += '<div class="relief-phase-item">' + item + '</div>';
      });
      html += '</div></div>';
    });

    el.innerHTML = html;

    // Duration callback
    if (durationEl) {
      var dur = answers['step-1'] || '';
      var durLabel = DURATION_LABELS[dur] || 'some time';
      durationEl.textContent = 'After dealing with symptoms for ' + durLabel + ', most women say they wish they\u2019d started sooner.';
    }
  }

  /* ── Personalize Great Candidate screen (step 36) ────────────────── */
  function populateGreatCandidate() {
    var headEl = document.getElementById('great-candidate-headline');
    var bodyEl = document.getElementById('great-candidate-body');
    if (!headEl || !bodyEl) return;
    var name = answers['firstName'] || '';
    if (name) {
      headEl.textContent = name + ', you\u2019re a strong candidate for HRT.';
    }
    // Reference their top symptom and severity
    var selected = (answers['step-6'] || '').split(',').filter(function(s) { return s; });
    var severity = answers['step-8'] || '';
    var sevLabel = { mild: 'noticeable', moderate: 'moderate', significant: 'significant', severe: 'severe' };
    var sevText = sevLabel[severity] || '';
    if (selected.length > 0 && sevText) {
      bodyEl.textContent = 'Your ' + sevText + ' symptoms are highly treatable. Most women see meaningful improvement within 2\u20134 weeks of starting their personalized plan.';
    }
  }

  /* ── Step 26 dynamic recommendation (compound vs estrogen-only) ────── */
  function populateStep26() {
    var headEl = document.getElementById('step-26-headline');
    var subEl  = document.getElementById('step-26-sub');
    var cardCompound = document.getElementById('step-26-card-compound');
    var cardFda      = document.getElementById('step-26-card-fda');
    if (!headEl || !subEl || !cardCompound || !cardFda) return;

    // Replicate the exact needsProgesterone logic from buildPayload
    var hystAnswer = answers['step-21'] || 'no';
    var hysterectomy = (hystAnswer !== 'no');
    var needsProg = true;
    if (hysterectomy) {
      var sleepAns = answers['step-22'] || '';
      var hasSleepTenderness = (sleepAns === 'sleep-issues' || sleepAns === 'breast-tenderness' || sleepAns === 'both');
      if (!hasSleepTenderness) {
        needsProg = false;
      } else if (answers['step-23'] === 'yes') {
        needsProg = false;
      }
    }

    if (needsProg) {
      // Default: recommend compound cream (E+P)
      headEl.textContent = 'Based on your profile, we recommend our custom compound cream';
      subEl.textContent  = 'You can also choose standard FDA-approved options if you prefer.';

      cardCompound.style.display = '';
      cardCompound.className = 'pref-card recommended';
      cardCompound.querySelector('.pref-card-badge').style.display = '';
      cardCompound.querySelector('.pref-card-title').textContent = 'Custom Compound Cream';
      cardCompound.querySelector('.pref-card-body').textContent  = 'Estrogen + progesterone in one daily application. Compounded specifically for you by a licensed pharmacy.';

      cardFda.className = 'pref-card';
      cardFda.querySelector('.pref-card-title').textContent = 'Standard FDA-Approved Options';
      cardFda.querySelector('.pref-card-body').textContent  = 'Patches, gels, or pills. Established, widely prescribed treatments.';
      // Remove badge if it was added from the other path
      var fdaBadge = cardFda.querySelector('.pref-card-badge');
      if (fdaBadge) fdaBadge.style.display = 'none';
    } else {
      // No progesterone: recommend standard estrogen-only
      headEl.textContent = 'Based on your profile, we recommend a standard estrogen treatment';
      subEl.textContent  = 'Since you don’t need progesterone, FDA-approved estrogen therapy is the ideal choice.';

      // Swap: FDA card becomes recommended (shown first visually)
      cardFda.className = 'pref-card recommended';
      // Ensure badge exists on FDA card
      var fdaBadge = cardFda.querySelector('.pref-card-badge');
      if (!fdaBadge) {
        fdaBadge = document.createElement('div');
        fdaBadge.className = 'pref-card-badge';
        cardFda.insertBefore(fdaBadge, cardFda.firstChild);
      }
      fdaBadge.textContent = 'Recommended';
      fdaBadge.style.display = '';
      cardFda.querySelector('.pref-card-title').textContent = 'Standard Estrogen Therapy';
      cardFda.querySelector('.pref-card-body').textContent  = 'Patches, gels, or pills. FDA-approved, widely prescribed estrogen-only treatments tailored to your needs.';

      // Hide compound cream card entirely — it contains progesterone they don’t need
      cardCompound.style.display = 'none';
    }
  }

    /* ── Contact field next buttons ──────────────────────────────────────── */
  function bindContactNextButtons() {
    // State
    var stateBtn = document.getElementById('step-30-next-state');
    var stateSelect = document.getElementById('state-select');
    if (stateBtn && stateSelect) {
      stateBtn.addEventListener('click', function() {
        var val = stateSelect.value;
        if (!val) { stateSelect.focus(); return; }
        recordAnswer('state', val);
        advance();
      });
    }

    // DOB
    var dobBtn = document.getElementById('step-31-next-dob');
    var dobInput = document.getElementById('dob-input');
    var dobError = document.getElementById('dob-error');
    if (dobBtn && dobInput) {
      // Auto-format MM/DD/YYYY
      dobInput.addEventListener('input', function() {
        var v = dobInput.value.replace(/[^\d]/g, '');
        if (v.length > 2) v = v.slice(0,2) + '/' + v.slice(2);
        if (v.length > 5) v = v.slice(0,5) + '/' + v.slice(5);
        if (v.length > 10) v = v.slice(0,10);
        dobInput.value = v;
      });
      dobBtn.addEventListener('click', function() {
        var val = dobInput.value.trim();
        var parts = val.split('/');
        if (parts.length !== 3 || parts[2].length !== 4) {
          if (dobError) { dobError.textContent = 'Please enter a valid date (MM/DD/YYYY)'; dobError.style.display = 'block'; }
          dobInput.focus();
          return;
        }
        var month = parseInt(parts[0],10), day = parseInt(parts[1],10), year = parseInt(parts[2],10);
        if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1920 || year > 2010) {
          if (dobError) { dobError.textContent = 'Please enter a valid date of birth'; dobError.style.display = 'block'; }
          dobInput.focus();
          return;
        }
        if (dobError) dobError.style.display = 'none';
        recordAnswer('dob', val);
        advance();
      });
    }

    // Name
    var nameBtn = document.getElementById('step-32-next-name');
    var firstInput = document.getElementById('first-name-input');
    var lastInput = document.getElementById('last-name-input');
    if (nameBtn && firstInput && lastInput) {
      nameBtn.addEventListener('click', function() {
        var first = firstInput.value.trim();
        var last = lastInput.value.trim();
        if (!first) { firstInput.focus(); return; }
        if (!last) { lastInput.focus(); return; }
        recordAnswer('firstName', first);
        recordAnswer('lastName', last);
        sessionStorage.setItem('crx_first_name', first);
        advance();
      });
    }

    // Email
    var emailBtn = document.getElementById('step-33-next-email');
    var emailInput = document.getElementById('email-input');
    if (emailBtn && emailInput) {
      emailBtn.addEventListener('click', function() {
        var val = emailInput.value.trim();
        if (!val || val.indexOf('@') === -1 || val.indexOf('.') === -1) { emailInput.focus(); return; }
        recordAnswer('email', val);
        advance();
      });
    }

    // Phone + lead capture
    var phoneBtn = document.getElementById('step-34-next-phone');
    var phoneInput = document.getElementById('phone-input');
    if (phoneBtn && phoneInput) {
      phoneInput.addEventListener('input', function() {
        var v = phoneInput.value.replace(/[^\d]/g, '');
        if (v.length > 0) v = '(' + v;
        if (v.length > 4) v = v.slice(0,4) + ') ' + v.slice(4);
        if (v.length > 9) v = v.slice(0,9) + '-' + v.slice(9);
        if (v.length > 14) v = v.slice(0,14);
        phoneInput.value = v;
      });
      phoneBtn.addEventListener('click', function() {
        var val = phoneInput.value.replace(/[^\d]/g, '');
        if (val.length < 10) { phoneInput.focus(); return; }
        recordAnswer('phone', phoneInput.value.trim());
        if (!leadCaptured) {
          captureLead(function() { advance(); });
        } else {
          advance();
        }
      });
    }

    // Consent is now a single button handled by global consentAndContinue()
  }

  /* ── Lead capture ────────────────────────────────────────────────────── */
  function captureLead(callback) {
    var btn = document.getElementById('step-34-next-phone');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }

    var payload = {
      firstName: answers['firstName'] || '',
      lastName:  answers['lastName']  || '',
      email:     answers['email']     || '',
      phone:     answers['phone']     || '',
      state:     answers['state']     || '',
      zip:       '00000',
      dob:       answers['dob']       || '',
    };

    fetch(PROXY_BASE + '/api/lead', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (btn) { btn.disabled = false; btn.textContent = 'Continue \u2192'; }
      if (data.redirect && data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }
      if (data.ok && data.sessionId) {
        sessionId    = data.sessionId;
        userId       = data.userId;
        leadCaptured = true;
        saveSession();
      }
      if (callback) callback();
    })
    .catch(function(err) {
      console.warn('Lead capture failed (non-blocking):', err);
      if (btn) { btn.disabled = false; btn.textContent = 'Continue \u2192'; }
      if (callback) callback();
    });
  }

  /* ── DQ screen ───────────────────────────────────────────────────────── */
  function showDisqualify(reason) {
    DISQUALIFY_REASON = reason;
    var screen = document.getElementById('disqualify-screen');
    if (!screen) return;
    var msg = DQ_MESSAGES[reason] || { headline: 'We\u2019re unable to proceed.', body: 'Based on your answers, our physicians are unable to safely prescribe HRT at this time.' };
    var h = screen.querySelector('.disqualify-headline');
    var b = screen.querySelector('.disqualify-body');
    if (h) h.textContent = msg.headline;
    if (b) b.textContent = msg.body;
    screen.style.display = 'flex';
  }

  /* ── Final submission ────────────────────────────────────────────────── */
  function startFinalSubmission() {
    var flags = buildClinicalFlags();
    sessionStorage.setItem('crx_flags', JSON.stringify(flags));
    sessionStorage.setItem('crx_answers', JSON.stringify(answers));

    var customCid = sessionStorage.getItem('crx_cc_custom_cid') || '';
    var affId     = sessionStorage.getItem('crx_aff_id')        || '';
    var c1        = sessionStorage.getItem('crx_c1')            || '';

    var loadingBar    = document.getElementById('loading-bar');
    var loadingStatus = document.getElementById('loading-status');
    var loadingContent = document.getElementById('loading-content');
    var loadingSuccess = document.getElementById('loading-success');
    var statusMessages = [
      'Reviewing your symptoms\u2026',
      'Matching treatment to your profile\u2026',
      'Consulting physician protocols\u2026',
      'Finalizing your match\u2026'
    ];
    var msgIndex = 0;
    if (loadingBar) loadingBar.style.width = '15%';
    var statusInterval = setInterval(function() {
      msgIndex++;
      if (msgIndex < statusMessages.length && loadingStatus) {
        loadingStatus.textContent = statusMessages[msgIndex];
      }
      var pct = Math.min(15 + msgIndex * 22, 85);
      if (loadingBar) loadingBar.style.width = pct + '%';
    }, 1200);

    fetch(PROXY_BASE + '/api/v2/complete', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId:    sessionId,
        quizAnswers:  answers,
        flags:        flags,
        clickId:      customCid,
        affId:        affId,
        c1:           c1,
        contactInfo: {
          firstName: answers['firstName'] || '',
          lastName:  answers['lastName']  || '',
          email:     answers['email']     || '',
          phone:     answers['phone']     || '',
          state:     answers['state']     || '',
          dob:       answers['dob']       || '',
        },
      }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      clearInterval(statusInterval);
      if (!data.ok) {
        if (loadingBar) loadingBar.style.width = '100%';
        if (loadingBar) loadingBar.style.background = '#c45';
        if (loadingStatus) loadingStatus.textContent = 'Something went wrong. Please try again.';
        console.error('v2 complete failed:', data);
        return;
      }
      sessionStorage.setItem('crx_v2_result', JSON.stringify({
        checkoutUrl: data.checkoutUrl,
        product:     data.product,
        flags:       flags,
        firstName:   answers['firstName'] || '',
        barrier:     answers['step-12'] || '',
        severity:    answers['step-8'] || '',
        symptomCount: (answers['step-6'] || '').split(',').filter(function(s) { return s; }).length,
      }));
      if (loadingBar) loadingBar.style.width = '100%';
      setTimeout(function() {
        if (loadingContent) loadingContent.style.display = 'none';
        if (loadingSuccess) loadingSuccess.style.display = 'block';
        var loadingSubEl = document.getElementById('loading-success-sub');
        var firstName = answers['firstName'] || '';
        if (loadingSubEl && firstName) {
          loadingSubEl.textContent = 'Taking you to ' + firstName + '\u2019s personalized treatment\u2026';
        }
        setTimeout(function() {
          window.location.href = 'treatment-a.html';
        }, 1200);
      }, 600);
    })
    .catch(function(err) {
      clearInterval(statusInterval);
      console.error('v2 complete error:', err);
      if (loadingStatus) loadingStatus.textContent = 'Connection error. Please try again.';
      if (loadingBar) { loadingBar.style.width = '100%'; loadingBar.style.background = '#c45'; }
    });
  }

  /* ── Build clinical flags ────────────────────────────────────────────── */
  function buildClinicalFlags() {
    var a = answers;

    var adhesiveAllergy   = (a['adhesive-allergy'] === 'yes');
    var nicotineUse       = (a['nicotine-use'] === 'yes');
    var bloodClotHistory  = (a['step-16'] && a['step-16'].indexOf('blood-clots') !== -1);
    var nicotineOrClot    = nicotineUse || bloodClotHistory;

    var hystAnswer        = a['step-21'] || 'no';
    var hasUterus         = (hystAnswer === 'no');
    var hysterectomy      = !hasUterus;

    var needsProgesterone = true;
    if (hysterectomy) {
      var sleepAns = a['step-22'] || '';
      var hasSleepTenderness = (sleepAns === 'sleep-issues' || sleepAns === 'breast-tenderness' || sleepAns === 'both');
      if (!hasSleepTenderness) {
        needsProgesterone = false;
      } else if (a['step-23'] === 'yes') {
        needsProgesterone = false;
      }
    }

    var hrtHistory    = a['step-24'] || 'never';
    var everUsedHRT   = (hrtHistory !== 'never');
    var transdermalSE = everUsedHRT && (a['transdermal-se'] === 'yes');

    // Dose tier: >5yr = low dose
    var duration = a['step-1'] || '';
    var doseTier = (duration === 'more-than-5yr') ? 'low' : 'normal';

    // Vaginal symptoms from step 9
    var vaginalSymptoms = false;
    var step9 = a['step-9'] || '';
    if (step9 && step9 !== 'none') {
      vaginalSymptoms = true;
    }
    // Also check step 6
    var step6 = a['step-6'] || '';
    if (step6.indexOf('vaginal-dryness') !== -1) {
      vaginalSymptoms = true;
    }

    return {
      adhesiveAllergy:   adhesiveAllergy,
      nicotineOrClot:    nicotineOrClot,
      transdermalSE:     transdermalSE,
      needsProgesterone: needsProgesterone,
      hysterectomy:      hysterectomy,
      vaginalSymptoms:   vaginalSymptoms,
      doseTier:          doseTier,
      hasUterus:         hasUterus,
    };
  }

  /* ── Expose internal functions for global onclick wrappers ────────── */
  function recordAndAdvanceConsent(key, val) {
    recordAnswer(key, val);
    recordAnswer('consent_truthfulness', 'yes');
    advance();
  }

  /* ── Chip buttons (for hysterectomy reason step 39) ──────────────── */
  document.addEventListener('click', function(e) {
    if (!e.target.classList.contains('chip-btn')) return;
    e.target.classList.toggle('selected');
  });

  /* ── Free-text next buttons ────────────────────────────────────────── */
  // Step 39: hysterectomy reason (chips + optional textarea)
  var hyst39Next = document.getElementById('step-39-next');
  if (hyst39Next) {
    hyst39Next.addEventListener('click', function() {
      var chips = document.querySelectorAll('#hyst-chips .chip-btn.selected');
      var parts = [];
      for (var i = 0; i < chips.length; i++) parts.push(chips[i].dataset.value);
      var extra = (document.getElementById('step-39-text') || {}).value || '';
      if (extra.trim()) parts.push(extra.trim());
      recordAnswer('step-39', parts.join(', ') || 'Not specified');
      advance();
    });
  }

  // Step 40: HRT type used (textarea)
  var hrt40Next = document.getElementById('step-40-next');
  if (hrt40Next) {
    hrt40Next.addEventListener('click', function() {
      var val = (document.getElementById('step-40-text') || {}).value || '';
      recordAnswer('step-40', val.trim() || 'Not specified');
      advance();
    });
  }

  // Step 42: HRT side effects detail (textarea)
  var se42Next = document.getElementById('step-42-next');
  if (se42Next) {
    se42Next.addEventListener('click', function() {
      var val = (document.getElementById('step-42-text') || {}).value || '';
      recordAnswer('step-42', val.trim() || 'Not specified');
      advance();
    });
  }

  // Step 44: free-text medications
  var med44Next = document.getElementById('step-44-next');
  if (med44Next) {
    med44Next.addEventListener('click', function() {
      var val = (document.getElementById('step-44-text') || {}).value || '';
      recordAnswer('step-44', val.trim() || 'None specified');
      advance();
    });
  }

  // Step 45: free-text medical conditions  
  var cond45Next = document.getElementById('step-45-next');
  if (cond45Next) {
    cond45Next.addEventListener('click', function() {
      var val = (document.getElementById('step-45-text') || {}).value || '';
      recordAnswer('step-45', val.trim() || 'None specified');
      advance();
    });
  }

  // Step 47: doctor questions (with skip button)
  var doc47Next = document.getElementById('step-47-next');
  var doc47Skip = document.getElementById('step-47-skip');
  if (doc47Next) {
    doc47Next.addEventListener('click', function() {
      var val = (document.getElementById('step-47-text') || {}).value || '';
      recordAnswer('step-47', val.trim() || 'No additional information');
      advance();
    });
  }
  if (doc47Skip) {
    doc47Skip.addEventListener('click', function() {
      recordAnswer('step-47', 'No additional information');
      advance();
    });
  }

  window.CRX = {
    advance: advance,
    startFinalSubmission: startFinalSubmission,
    recordAndAdvance: recordAndAdvanceConsent,
  };

})();

/* ── Global function wrappers (called by onclick in HTML) ───────────── */

function advanceStep() {
  if (window.CRX && window.CRX.advance) {
    window.CRX.advance();
  }
}

function startLoading() {
  if (window.CRX && window.CRX.startFinalSubmission) {
    window.CRX.startFinalSubmission();
  }
}

function agreeAllConsents() {
  // Mark all 3 consent items as agreed visually
  for (var i = 1; i <= 3; i++) {
    var item = document.getElementById("consent-" + i);
    var badge = document.getElementById("consent-agreed-" + i);
    var agreeBtn = item ? item.querySelector(".consent-agree-btn") : null;
    if (badge) badge.style.display = "flex";
    if (agreeBtn) agreeBtn.style.display = "none";
    if (item) { item.classList.add("agreed"); item.classList.remove("open"); }
  }
  // Record consent answers and advance
  if (window.CRX && window.CRX.recordAndAdvance) {
    window.CRX.recordAndAdvance("consent_hrt", "yes");
  }
}

function submitDqGuide() {
  var emailInput = document.getElementById('dq-email-input');
  var btn = document.getElementById('dq-guide-btn');
  var sent = document.getElementById('dq-guide-sent');
  if (!emailInput) return;
  var email = emailInput.value.trim();
  if (!email || email.indexOf('@') === -1) { emailInput.focus(); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Sending\u2026'; }
  // Fire lead capture with DQ flag for the guide
  var PROXY_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : 'https://crx-server-hzyh.onrender.com';
  fetch(PROXY_BASE + '/api/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, source: 'dq-guide', firstName: '', lastName: '', phone: '', state: '', zip: '00000', dob: '' }),
  }).then(function() {
    if (sent) sent.style.display = 'block';
    if (btn) { btn.textContent = 'Sent!'; }
    emailInput.style.display = 'none';
  }).catch(function() {
    if (sent) { sent.textContent = 'Something went wrong. Please try again.'; sent.style.display = 'block'; }
    if (btn) { btn.disabled = false; btn.textContent = 'Send Guide'; }
  });
}

function hideDisqualify() {
  var screen = document.getElementById('disqualify-screen');
  if (screen) screen.style.display = 'none';
  // Clear the DQ selection
  var steps = document.querySelectorAll('.quiz-step.active');
  if (steps.length > 0) {
    steps[0].querySelectorAll('.option-btn.selected').forEach(function(b) { b.classList.remove('selected'); });
  }
}

function toggleConsent(n) {
  var item = document.getElementById('consent-' + n);
  var toggle = document.getElementById('consent-toggle-' + n);
  if (item) {
    var isOpen = item.classList.contains('open');
    item.classList.toggle('open');
    if (toggle) toggle.textContent = isOpen ? '+' : '\u2212';
  }
}

function agreeConsent(n) {
  var item = document.getElementById('consent-' + n);
  var badge = document.getElementById('consent-agreed-' + n);
  var agreeBtn = item ? item.querySelector('.consent-agree-btn') : null;
  if (badge) badge.style.display = 'flex';
  if (agreeBtn) agreeBtn.style.display = 'none';
  if (item) { item.classList.add('agreed'); item.classList.remove('open'); }

  // Count agreed
  var agreed = document.querySelectorAll('.consent-agreed-badge[style*="flex"]').length;
  var nextBtn = document.getElementById('step-35-next');
  var agreeAllBtn = document.getElementById('consent-agree-all-btn');
  if (agreed >= 3) {
    if (nextBtn) { nextBtn.classList.add('visible'); nextBtn.disabled = false; }
    if (agreeAllBtn) agreeAllBtn.style.display = 'none';
  }
}

function consentAndContinue() {
  // Single consolidated consent
  if (window.CRX && window.CRX.recordAndAdvance) {
    window.CRX.recordAndAdvance('consent_hrt', 'yes');
  }
}
