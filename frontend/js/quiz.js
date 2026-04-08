/*
   ClearedRx Quiz Funnel — quiz.js v12
   ============================================================
   STEP MAP (37 steps total):
    1  Primary goal (single-select, auto-advance)
    2  Interstitial: You're in the right place
    3  Symptom duration (single-select, auto-advance)
    4  Severity emoji scale (auto-advance)
    5  Interstitial: 87% stat
    6  Symptom checklist (multi-select)
    7  What matters most (single-select, auto-advance)
    8  Interstitial: Relief timeline
    9  Menstrual status (single-select, auto-advance)
   10  Age (single-select, auto-advance)
   11  Imagine feeling better (single-select, auto-advance)
   12  Interstitial: Testimonial 1
   13  Medical conditions (multi-select, disqualifying)
   14  Current medications (multi-select, disqualifying)
   15  Pregnancy / breastfeeding (single-select, disqualifying)
   16  Sex assigned at birth (single-select, disqualifying)
   17  Interstitial: Privacy
   18  Allergies (Yes/No + conditional text)
   19  Adhesive allergy (single-select, auto-advance)
   20  Nicotine use (single-select, auto-advance)
   21  Hysterectomy (single-select, auto-advance)
   22  Sleep / breast tenderness (shown only if no hysterectomy)
   23  Progesterone intolerance (shown only if step-22 != neither)
   24  HRT history (single-select, auto-advance)
   25  Transdermal side effects (shown only if step-24 != 'never')
   26  Delivery preference (single-select, auto-advance)
   27  Interstitial: Testimonial 2
   28  Blood pressure (single-select, disqualifying)
   29  What's held you back (single-select, auto-advance)
   30  State (dropdown)
   31  Date of Birth (text input)
   32  Name (text inputs)
   33  Email (text input)
   34  Phone (text input + lead capture)
   35  Informed consent (3 consents)
   36  Interstitial: You're a great candidate
   37  Loading screen → redirect to treatments.html

   CLINICAL FLAGS (computed at end, stored in sessionStorage):
   - adhesiveAllergy    → blocks patch on treatment page
   - nicotineOrClot     → blocks oral pill on treatment page
   - transdermalSE      → blocks gel/patch on treatment page (from step 25)
   - needsProgesterone  → true for ALL patients with a uterus (no hysterectomy)
   - vaginalSymptoms    → pre-selects vaginal add-on on treatment page
   - doseTier           → 'low' if >3yr duration, 'normal' otherwise
   ============================================================ */

(function() {
  'use strict';

  var TOTAL_STEPS   = 37;
  var currentStep   = 1;
  var answers       = {};
  var consentAgreed = 0;
  var CONSENT_REQUIRED = 3;

  // API base: same origin in production, localhost in dev
  var PROXY_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : 'https://crx-server-hzyh.onrender.com';

  var sessionId    = null;
  var userId       = null;
  var leadCaptured = false;

  /* ── Disqualifying values per step ──────────────────────────────────────────── */
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
    'high-160-plus':         { headline: 'Your blood pressure needs attention first.', body: 'A blood pressure reading of 160+ systolic means HRT is not safe to prescribe remotely. Please see your primary care physician to get your blood pressure managed before starting hormone therapy.' },
  };

  var DISQUALIFY = {
    'step-13': ['active-breast-cancer','family-cancer','blood-clots','stroke-tia',
                'heart-disease','unexplained-bleeding','liver-disease'],
    'step-14': ['carbamazepine','phenytoin','rifampin','st-johns-wort',
                'topiramate','lamotrigine','barbiturates'],
    'step-15': ['pregnant','breastfeeding'],
    'step-16': ['male'],
    'step-28': ['high-160-plus'],
  };

  /* ── Init ────────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function() {
    // Capture URL tracking parameters (coupon, cc_custom_cid) on first load
    var urlParams = new URLSearchParams(window.location.search);
    var urlCoupon = urlParams.get('coupon');
    var urlCid    = urlParams.get('cc_custom_cid');
    if (urlCoupon) sessionStorage.setItem('crx_coupon',         urlCoupon);
    if (urlCid)    sessionStorage.setItem('crx_cc_custom_cid',  urlCid);

    var saved = sessionStorage.getItem('crx_session');
    if (saved) {
      try {
        var s = JSON.parse(saved);
        sessionId    = s.sessionId || null;
        userId       = s.userId    || null;
        answers      = s.answers   || {};
        leadCaptured = !!sessionId;
      } catch(e) {}
    }

    showStep(1);
    bindOptions();
    bindEmojiScale();
    bindNextButtons();
    bindInterstitialCTAs();
    bindFAQ();
    bindDosageOptions();
    bindAllergyFlow();
    bindContactNextButtons();
    bindBackButton();
  });

  /* ── Session persistence ─────────────────────────────────────────────────── */
  function saveSession() {
    sessionStorage.setItem('crx_session', JSON.stringify({
      sessionId: sessionId,
      userId:    userId,
      answers:   answers,
    }));
    if (sessionId)            sessionStorage.setItem('crx_session_id',  sessionId);
    if (answers['firstName']) sessionStorage.setItem('crx_first_name',  answers['firstName']);
    if (answers['lastName'])  sessionStorage.setItem('crx_last_name',   answers['lastName']);
    if (answers['email'])     sessionStorage.setItem('crx_email',       answers['email']);
    if (answers['phone'])     sessionStorage.setItem('crx_phone',       answers['phone']);
    if (answers['state'])     sessionStorage.setItem('crx_state',       answers['state']);
    if (answers['dob'])       sessionStorage.setItem('crx_dob',         answers['dob']);
  }

  /* ── Progress bar ────────────────────────────────────────────────────────── */
  function updateProgress(step) {
    var fill = document.getElementById('progressFill');
    if (!fill) return;
    var pct = Math.round(((step - 1) / (TOTAL_STEPS - 1)) * 100);
    fill.style.width = Math.max(2, pct) + '%';
  }

  /* ── Show step ───────────────────────────────────────────────────────────── */
  function showStep(n) {
    document.querySelectorAll('.quiz-step').forEach(function(el) {
      el.classList.remove('active', 'exit');
    });
    var target = document.getElementById('step-' + n);
    if (!target) return;
    target.classList.add('active');
    currentStep = n;
    updateProgress(n);
    window.scrollTo(0, 0);

    // Show/hide back button
    var backBtn = document.getElementById('quizBackBtn');
    if (backBtn) {
      var noBackSteps = [1, 2, 5, 8, 12, 17, 27, 36, 37];
      backBtn.style.display = (noBackSteps.indexOf(n) === -1) ? 'flex' : 'none';
    }

    // Auto-focus first input
    setTimeout(function() {
      var input = target.querySelector('input[type="text"], input[type="email"], input[type="tel"], textarea, select');
      if (input) {
        try { input.focus(); } catch(e) {}
      }
    }, 260);

    if (n === 8) setTimeout(animateTimeline, 300);
  }

  /* ── Compute next step (conditional skip logic) ──────────────────────────── */
  function getNextStep(from) {
    // Step 21 = hysterectomy
    if (from === 21) {
      var hyst = answers['step-21'] || '';
      return (hyst !== 'no' && hyst !== '') ? 24 : 22;
    }

    // Step 22 = sleep/breast tenderness
    if (from === 22) {
      var st = answers['step-22'] || '';
      return (st === 'neither') ? 24 : 23;
    }

    // Step 24 = HRT history
    // If never tried HRT → skip step 25 (transdermal SE — not applicable)
    if (from === 24) {
      var hrtHistory = answers['step-24'] || '';
      return (hrtHistory === 'never') ? 26 : 25;
    }

    return from + 1;
  }

  /* ── Advance to next step ────────────────────────────────────────────────── */
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

  /* ── Record answer ───────────────────────────────────────────────────────── */
  function recordAnswer(key, value) {
    answers[key] = value;
    saveSession();
  }

  /* ── Back button ─────────────────────────────────────────────────────────── */
  function bindBackButton() {
    var backBtn = document.getElementById('quizBackBtn');
    if (!backBtn) return;
    backBtn.addEventListener('click', function() {
      if (currentStep <= 1) return;
      var prev = currentStep - 1;

      // If we're on step 24 and hysterectomy was yes, skip back over 22+23
      if (currentStep === 24) {
        var hyst = answers['step-21'] || '';
        if (hyst !== 'no' && hyst !== '') {
          prev = 21;
        } else {
          var st = answers['step-22'] || '';
          prev = (st === 'neither') ? 22 : 23;
        }
      }

      // If we're on step 26 (delivery pref) and HRT history was 'never', go back to 24
      if (currentStep === 26) {
        var hrtHistory = answers['step-24'] || '';
        prev = (hrtHistory === 'never') ? 24 : 25;
      }

      var cur = document.getElementById('step-' + currentStep);
      if (cur) {
        cur.classList.add('exit');
        setTimeout(function() {
          cur.classList.remove('active', 'exit');
          showStep(prev);
        }, 220);
      } else {
        showStep(prev);
      }
    });
  }

  /* ── Bind single/multi select options ───────────────────────────────────── */
  function bindOptions() {
    document.querySelectorAll('.options-list').forEach(function(list) {
      if (list.id === 'allergy-yn-list') return;

      var isMulti = list.classList.contains('multi') || list.dataset.multi === 'true';
      var stepEl  = list.closest('.quiz-step');
      if (!stepEl) return;
      var stepKey = stepEl.id;

      list.querySelectorAll('.option-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          if (isMulti) {
            if (btn.dataset.value === 'none') {
              list.querySelectorAll('.option-btn').forEach(function(b) { b.classList.remove('selected'); });
              btn.classList.add('selected');
              recordAnswer(stepKey, 'none');
              var nb = stepEl.querySelector('.quiz-next-btn');
              if (nb) nb.classList.remove('visible');
              setTimeout(advance, 320);
            } else {
              list.querySelectorAll('[data-value="none"]').forEach(function(b) { b.classList.remove('selected'); });
              btn.classList.toggle('selected');
              var vals = [];
              list.querySelectorAll('.option-btn.selected').forEach(function(s) { vals.push(s.dataset.value); });
              recordAnswer(stepKey, vals.join(','));
              var nb = stepEl.querySelector('.quiz-next-btn');
              if (nb) {
                if (vals.length > 0) nb.classList.add('visible');
                else nb.classList.remove('visible');
              }
            }
          } else {
            // Single-select
            list.querySelectorAll('.option-btn').forEach(function(b) { b.classList.remove('selected'); });
            btn.classList.add('selected');
            recordAnswer(stepKey, btn.dataset.value);

            // Step 19: adhesive allergy
            if (stepKey === 'step-19') {
              recordAnswer('adhesive-allergy', btn.dataset.value);
            }
            // Step 20: nicotine use
            if (stepKey === 'step-20') {
              recordAnswer('nicotine-use', btn.dataset.value);
            }
            // Step 25: transdermal side effects
            if (stepKey === 'step-25') {
              recordAnswer('transdermal-se', btn.dataset.value);
            }

            // Check for disqualifying answer
            if (DISQUALIFY[stepEl.id] && DISQUALIFY[stepEl.id].indexOf(btn.dataset.value) !== -1) {
              var dqVal = btn.dataset.value;
              setTimeout(function() { showDisqualify(dqVal); }, 320);
              return;
            }
            setTimeout(advance, 320);
          }
        });
      });
    });
  }

  /* ── Allergy conditional flow ────────────────────────────────────────────── */
  function bindAllergyFlow() {
    var noBtn        = document.getElementById('allergy-no-btn');
    var yesBtn       = document.getElementById('allergy-yes-btn');
    var textWrap     = document.getElementById('allergy-text-wrap');
    var allergyNext  = document.getElementById('step-18-allergy-next');
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
        setTimeout(function() {
          if (allergyInput) allergyInput.focus();
        }, 100);
      });
    }

    if (allergyNext) {
      allergyNext.addEventListener('click', function() {
        var val = allergyInput ? allergyInput.value.trim() : '';
        recordAnswer('allergies', val || 'none');
        advance();
      });
    }

    if (allergyInput) {
      allergyInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); if (allergyNext) allergyNext.click(); }
      });
    }
  }

  /* ── Contact field next buttons ──────────────────────────────────────────── */
  // Order: State (30) → DOB (31) → Name (32) → Email (33) → Phone (34, lead capture) → Consent (35)
  function bindContactNextButtons() {

    // ── Step 30: State ────────────────────────────────────────
    var s30next    = document.getElementById('step-30-next-state');
    var stateInput = document.getElementById('state-input');

    if (s30next) {
      s30next.addEventListener('click', function() {
        var state = stateInput ? stateInput.value.trim() : '';
        if (!state) {
          if (stateInput) { stateInput.style.borderColor = 'var(--rose)'; stateInput.focus(); }
          return;
        }
        if (stateInput) stateInput.style.borderColor = '';
        recordAnswer('state', state);
        advance();
      });
    }
    if (stateInput) {
      stateInput.addEventListener('change', function() {
        if (this.value) this.style.borderColor = '';
      });
    }

    // ── Step 31: Date of Birth ────────────────────────────────
    var s31next  = document.getElementById('step-31-next-dob');
    var dobInput = document.getElementById('dob-input');

    if (dobInput) {
      dobInput.addEventListener('input', function() {
        var digits = this.value.replace(/\D/g, '').slice(0, 8);
        var formatted = '';
        if      (digits.length <= 2) formatted = digits;
        else if (digits.length <= 4) formatted = digits.slice(0,2) + '/' + digits.slice(2);
        else                         formatted = digits.slice(0,2) + '/' + digits.slice(2,4) + '/' + digits.slice(4);
        this.value = formatted;
      });
      dobInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); if (s31next) s31next.click(); }
      });
    }

    if (s31next) {
      s31next.addEventListener('click', function() {
        var dob = dobInput ? dobInput.value.trim() : '';
        var dobRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(19|20)\d{2}$/;
        if (!dobRegex.test(dob)) {
          if (dobInput) { dobInput.style.borderColor = 'var(--rose)'; dobInput.focus(); }
          var hint = dobInput ? dobInput.parentNode.querySelector('.contact-field-hint') : null;
          if (hint) { hint.style.color = 'var(--rose)'; hint.textContent = 'Please enter a valid date in MM/DD/YYYY format.'; }
          return;
        }
        if (dobInput) dobInput.style.borderColor = '';
        var hint = dobInput ? dobInput.parentNode.querySelector('.contact-field-hint') : null;
        if (hint) { hint.style.color = ''; hint.textContent = '\uD83D\uDD12 Used only for your medical record. Never shared.'; }
        recordAnswer('dob', dob);
        advance();
      });
    }

    // ── Step 32: Name ─────────────────────────────────────────
    var s32next = document.getElementById('step-32-next-name');
    var fnInput = document.getElementById('first-name-input');
    var lnInput = document.getElementById('last-name-input');

    if (s32next) {
      s32next.addEventListener('click', function() {
        if (!fnInput || !fnInput.value.trim()) { if (fnInput) fnInput.focus(); return; }
        if (!lnInput || !lnInput.value.trim()) { if (lnInput) lnInput.focus(); return; }
        recordAnswer('firstName', fnInput.value.trim());
        recordAnswer('lastName',  lnInput.value.trim());
        advance();
      });
    }
    if (fnInput) {
      fnInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); if (lnInput) lnInput.focus(); }
      });
    }
    if (lnInput) {
      lnInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); if (s32next) s32next.click(); }
      });
    }

    // ── Step 33: Email ────────────────────────────────────────
    var s33next    = document.getElementById('step-33-next-email');
    var emailInput = document.getElementById('email-input');

    if (s33next) {
      s33next.addEventListener('click', function() {
        var email = emailInput ? emailInput.value.trim() : '';
        if (!email || email.indexOf('@') === -1 || email.indexOf('.') === -1) {
          if (emailInput) { emailInput.style.borderColor = 'var(--rose)'; emailInput.focus(); }
          return;
        }
        if (emailInput) emailInput.style.borderColor = '';
        recordAnswer('email', email);
        advance();
      });
    }
    if (emailInput) {
      emailInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); if (s33next) s33next.click(); }
      });
    }

    // ── Step 34: Phone (lead capture fires here — all fields now collected) ──
    var s34next    = document.getElementById('step-34-next-phone');
    var phoneInput = document.getElementById('phone-input');

    if (phoneInput) {
      phoneInput.addEventListener('input', function() {
        var digits    = this.value.replace(/\D/g, '').slice(0, 10);
        var formatted = '';
        if      (digits.length === 0) formatted = '';
        else if (digits.length <= 3)  formatted = '(' + digits;
        else if (digits.length <= 6)  formatted = '(' + digits.slice(0,3) + ') ' + digits.slice(3);
        else                          formatted = '(' + digits.slice(0,3) + ') ' + digits.slice(3,6) + '-' + digits.slice(6);
        this.value = formatted;
      });
      phoneInput.addEventListener('keydown', function(e) {
        if (e.key === 'Backspace') {
          var val = this.value;
          if (val.slice(-1).match(/[\s\-\(]/)) {
            e.preventDefault();
            this.value = val.slice(0, -2);
          }
        }
        if (e.key === 'Enter') { e.preventDefault(); if (s34next) s34next.click(); }
      });
    }

    if (s34next) {
      s34next.addEventListener('click', function() {
        var phone       = phoneInput ? phoneInput.value.trim() : '';
        var phoneDigits = phone.replace(/\D/g, '');
        if (!phoneDigits || phoneDigits.length < 10) {
          if (phoneInput) { phoneInput.style.borderColor = 'var(--rose)'; phoneInput.focus(); }
          return;
        }
        if (phoneInput) phoneInput.style.borderColor = '';
        recordAnswer('phone', phoneDigits);
        // All contact fields collected — fire lead capture now
        if (!leadCaptured) {
          captureLead(function() { advance(); });
        } else {
          advance();
        }
      });
    }

    // ── Step 35: Consent "Continue" button ───────────────────────────────────
    var s35next = document.getElementById('step-35-next');
    if (s35next) {
      s35next.addEventListener('click', function() { advance(); });
    }
  }

  /* ── Lead capture (fires at phone step — all contact fields available) ────── */
  function captureLead(callback) {
    var btn = document.getElementById('step-34-next-phone');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }

    var payload = {
      firstName: answers['firstName'] || '',
      lastName:  answers['lastName']  || '',
      email:     answers['email']     || '',
      phone:     answers['phone']     || '',
      state:     answers['state']     || '',
      zip:       answers['zip']       || '00000',
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

  /* ── Next buttons (multi-select steps) ──────────────────────────────────── */
  function bindNextButtons() {
    var skipIds = ['step-30-next-state','step-31-next-dob','step-32-next-name',
                   'step-33-next-email','step-34-next-phone',
                   'step-18-allergy-next','step-35-next'];
    document.querySelectorAll('.quiz-next-btn').forEach(function(btn) {
      if (skipIds.indexOf(btn.id) !== -1) return;
      btn.addEventListener('click', function() {
        var stepEl = btn.closest('.quiz-step');
        if (!stepEl) { advance(); return; }
        var vals = [];
        stepEl.querySelectorAll('.option-btn.selected').forEach(function(s) { vals.push(s.dataset.value); });
        if (DISQUALIFY[stepEl.id]) {
          for (var i = 0; i < vals.length; i++) {
            if (DISQUALIFY[stepEl.id].indexOf(vals[i]) !== -1) {
              var dqVal = vals[i];
              showDisqualify(dqVal);
              return;
            }
          }
        }
        recordAnswer(stepEl.id, vals.join(','));
        advance();
      });
    });
  }

  /* ── Interstitial CTAs ───────────────────────────────────────────────────── */
  function bindInterstitialCTAs() {
    document.querySelectorAll('.interstitial-cta').forEach(function(btn) {
      btn.addEventListener('click', advance);
    });
  }

  /* ── FAQ accordion ───────────────────────────────────────────────────────── */
  function bindFAQ() {
    document.querySelectorAll('.faq-question').forEach(function(q) {
      q.addEventListener('click', function() {
        var item = q.closest('.faq-item');
        if (item) item.classList.toggle('open');
      });
    });
  }

  /* ── Emoji scale ─────────────────────────────────────────────────────────── */
  function bindEmojiScale() {
    var scale = document.querySelector('.emoji-scale');
    if (!scale) return;
    var stepEl = scale.closest('.quiz-step');
    if (!stepEl) return;
    scale.querySelectorAll('.emoji-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        scale.querySelectorAll('.emoji-btn').forEach(function(b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        recordAnswer(stepEl.id, btn.dataset.value);
        setTimeout(advance, 320);
      });
    });
  }

  /* ── Dosage options (treatments page) ───────────────────────────────────── */
  function bindDosageOptions() {
    document.querySelectorAll('.dosage-option').forEach(function(opt) {
      opt.addEventListener('click', function() {
        var group = opt.closest('.dosage-group');
        if (group) group.querySelectorAll('.dosage-option').forEach(function(o) { o.classList.remove('selected'); });
        opt.classList.add('selected');
      });
    });
  }

  /* ── Disqualify overlay ──────────────────────────────────────────────────── */
  function showDisqualify(reason) {
    DISQUALIFY_REASON = reason;
    var screen = document.getElementById('disqualify-screen');
    if (!screen) return;
    var msg = DQ_MESSAGES[reason] || { headline: 'We\'re unable to proceed.', body: 'Based on your answers, our physicians are unable to safely prescribe HRT at this time. Please consult with your primary care physician.' };
    var h = screen.querySelector('.disqualify-headline');
    var b = screen.querySelector('.disqualify-body');
    if (h) h.textContent = msg.headline;
    if (b) b.textContent = msg.body;
    screen.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  /* ── Timeline animation (step 8) ────────────────────────────────────────── */
  function animateTimeline() {
    var items = document.querySelectorAll('#step-8 .timeline-item');
    // Reset first so re-visiting the step re-animates
    items.forEach(function(item) { item.classList.remove('animate'); });
    items.forEach(function(item, i) {
      setTimeout(function() { item.classList.add('animate'); }, i * 200);
    });
  }

  /* ── Consent checkboxes (step 35) ───────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function() {
    var consentBoxes = document.querySelectorAll('.consent-checkbox');
    var consentBtn   = document.getElementById('step-35-next');
    consentAgreed = 0;

    consentBoxes.forEach(function(cb) {
      cb.addEventListener('change', function() {
        consentAgreed = 0;
        consentBoxes.forEach(function(c) { if (c.checked) consentAgreed++; });
        if (consentBtn) {
          if (consentAgreed >= CONSENT_REQUIRED) {
            consentBtn.classList.add('visible');
            consentBtn.disabled = false;
          } else {
            consentBtn.classList.remove('visible');
            consentBtn.disabled = true;
          }
        }
      });
    });
  });

  /* ── Loading screen / final submission (step 37) ────────────────────────── */
  document.addEventListener('DOMContentLoaded', function() {
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(node) {
          if (node.id === 'step-37' || (node.classList && node.classList.contains('active') && node.id === 'step-37')) {
            startFinalSubmission();
          }
        });
      });
    });

    var container = document.querySelector('.quiz-container');
    if (container) observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

    // Also watch for step-37 becoming active via class change
    document.querySelectorAll('.quiz-step').forEach(function(el) {
      if (el.id === 'step-37') {
        var stepObserver = new MutationObserver(function() {
          if (el.classList.contains('active')) startFinalSubmission();
        });
        stepObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
      }
    });
  });

  function startFinalSubmission() {
    var loadingContent = document.getElementById('loading-content');

    // Build clinical flags from answers
    var flags = buildClinicalFlags();

    // Store flags in sessionStorage for treatments page
    sessionStorage.setItem('crx_flags', JSON.stringify(flags));
    sessionStorage.setItem('crx_answers', JSON.stringify(answers));

    fetch(PROXY_BASE + '/api/complete', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        sessionId: sessionId,
        userId:    userId,
        answers:   answers,
        flags:     flags,
      }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        sessionStorage.setItem('crx_complete', JSON.stringify(data));
        // Route hysterectomy patients (no progesterone needed) to dedicated page
        var treatmentPage = flags.needsProgesterone ? 'treatments.html' : 'treatments-no-prog.html';
        window.location.href = treatmentPage;
      } else {
        if (loadingContent) loadingContent.innerHTML = '<p style="color:var(--rose)">Something went wrong. Please try again.</p>';
      }
    })
    .catch(function(err) {
      console.error('Final submission failed:', err);
      if (loadingContent) loadingContent.innerHTML = '<p style="color:var(--rose)">Connection error. Please check your internet and try again.</p>';
    });
  }

  /* ── Build clinical flags ────────────────────────────────────────────────── */
  function buildClinicalFlags() {
    var a = answers;

    var adhesiveAllergy   = (a['adhesive-allergy'] === 'yes');
    var nicotineUse       = (a['nicotine-use'] === 'yes' || a['nicotine-use'] === 'recently-quit');
    var bloodClotHistory  = (a['step-13'] && a['step-13'].indexOf('blood-clots') !== -1);
    var nicotineOrClot    = nicotineUse || bloodClotHistory;

    var hystAnswer        = a['step-21'] || 'no';
    var hasUterus         = (hystAnswer === 'no');
    var needsProgesterone = hasUterus;

    var hrtHistory        = a['step-24'] || 'never';
    var everUsedHRT       = (hrtHistory !== 'never');
    var transdermalSE     = everUsedHRT && (a['transdermal-se'] === 'yes');

    var symptomDuration   = a['step-3'] || '';
    var doseTier          = (symptomDuration === 'more-than-3-years') ? 'low' : 'normal';

    var vaginalSymptoms   = false;
    var step6 = a['step-6'] || '';
    if (step6.indexOf('vaginal') !== -1 || step6.indexOf('dryness') !== -1 || step6.indexOf('painful-sex') !== -1) {
      vaginalSymptoms = true;
    }

    return {
      adhesiveAllergy:   adhesiveAllergy,
      nicotineOrClot:    nicotineOrClot,
      transdermalSE:     transdermalSE,
      needsProgesterone: needsProgesterone,
      vaginalSymptoms:   vaginalSymptoms,
      doseTier:          doseTier,
      hasUterus:         hasUterus,
    };
  }

})();

/* ── Global function wrappers (called by inline onclick attributes in HTML) ─── */

// Called by interstitial CTAs that use onclick="advanceStep()"
function advanceStep() {
  var btn = document.querySelector('.quiz-step.active .interstitial-cta');
  if (btn) btn.click();
}

// Called by step-36 CTA: onclick="startLoading()"
function startLoading() {
  var btn = document.querySelector('#step-36 .interstitial-cta');
  if (btn) btn.click();
}

// Called by disqualify screen back button: onclick="hideDisqualify()"
function hideDisqualify() {
  var screen = document.getElementById('disqualify-screen');
  if (screen) screen.style.display = 'none';
  document.body.style.overflow = '';
  // Clear the disqualifying selection(s) on the current step
  var stepEl = document.querySelector('.quiz-step.active');
  if (stepEl) {
    stepEl.querySelectorAll('.option-btn.selected').forEach(function(b) { b.classList.remove('selected'); });
    // Hide the Next button if present
    var nb = stepEl.querySelector('.quiz-next-btn');
    if (nb) nb.classList.remove('visible');
  }
}

// Consent accordion toggle: onclick="toggleConsent(n)"
function toggleConsent(n) {
  var body   = document.getElementById('consent-body-' + n);
  var toggle = document.getElementById('consent-toggle-' + n);
  var item   = document.getElementById('consent-' + n);
  if (!body) return;
  var isOpen = body.style.display === 'block';
  // Close all
  [1,2,3].forEach(function(i) {
    var b = document.getElementById('consent-body-' + i);
    var t = document.getElementById('consent-toggle-' + i);
    var it = document.getElementById('consent-' + i);
    if (b) b.style.display = 'none';
    if (t) t.textContent = '+';
    if (it) it.classList.remove('open');
  });
  // Open clicked one if it was closed
  if (!isOpen) {
    body.style.display = 'block';
    if (toggle) toggle.textContent = '−';
    if (item) item.classList.add('open');
  }
}

// Consent agree individual: onclick="agreeConsent(n)"
var _consentAgreedCount = 0;
var _consentAgreedSet = {};
function agreeConsent(n) {
  if (_consentAgreedSet[n]) return; // already agreed
  _consentAgreedSet[n] = true;
  _consentAgreedCount++;
  var badge = document.getElementById('consent-agreed-' + n);
  var agreeBtn = document.querySelector('#consent-' + n + ' .consent-agree-btn');
  if (badge) badge.style.display = 'inline-block';
  if (agreeBtn) { agreeBtn.style.display = 'none'; }
  // Close this accordion
  var body   = document.getElementById('consent-body-' + n);
  var toggle = document.getElementById('consent-toggle-' + n);
  var item   = document.getElementById('consent-' + n);
  if (body) body.style.display = 'none';
  if (toggle) toggle.textContent = '✓';
  if (item) item.classList.remove('open');
  // Check if all 3 agreed
  if (_consentAgreedCount >= 3) {
    var allBtn = document.getElementById('consent-agree-all-btn');
    var nextBtn = document.getElementById('step-35-next');
    if (allBtn) allBtn.style.display = 'none';
    if (nextBtn) {
      nextBtn.classList.add('visible');
      nextBtn.disabled = false;
      // Auto-advance after a brief moment so user sees the button appear
      setTimeout(function() { nextBtn.click(); }, 400);
    }
  }
}

// Agree all at once: onclick="agreeAllConsents()"
// Agrees all 3 consents — agreeConsent(3) will auto-advance after 400ms
function agreeAllConsents() {
  [1,2,3].forEach(function(i) { agreeConsent(i); });
}
