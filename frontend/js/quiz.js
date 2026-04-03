/* ============================================================
   ClearedRx Quiz Funnel — quiz.js v11
   ============================================================
   STEP MAP (37 steps total):
    1  Primary goal (single-select, auto-advance)
    2  Interstitial: You're in the right place
    3  Symptom duration (single-select, auto-advance)
    4  Severity emoji scale (auto-advance)
    5  Interstitial: 85% stat
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
   30  Name (text inputs)
   31  Email (text input)
   32  Phone (text input + lead capture)
   33  Date of Birth (text input)
   34  State (dropdown)
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

      // If we're on step 25 (transdermal SE), go back to 24
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
  function bindContactNextButtons() {
    // ── Step 30: First + Last name ────────────────────────────
    var s30next = document.getElementById('step-30-next-name');
    var fnInput = document.getElementById('first-name-input');
    var lnInput = document.getElementById('last-name-input');

    if (s30next) {
      s30next.addEventListener('click', function() {
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
        if (e.key === 'Enter') { e.preventDefault(); if (s30next) s30next.click(); }
      });
    }

    // ── Step 31: Email ────────────────────────────────────────
    var s31next    = document.getElementById('step-30-next-email');
    var emailInput = document.getElementById('email-input');

    if (s31next) {
      s31next.addEventListener('click', function() {
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
        if (e.key === 'Enter') { e.preventDefault(); if (s31next) s31next.click(); }
      });
    }

    // ── Step 32: Phone (triggers lead capture) ────────────────
    var s32next    = document.getElementById('step-31-next');
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
        if (e.key === 'Enter') { e.preventDefault(); if (s32next) s32next.click(); }
      });
    }

    if (s32next) {
      s32next.addEventListener('click', function() {
        var phone       = phoneInput ? phoneInput.value.trim() : '';
        var phoneDigits = phone.replace(/\D/g, '');
        if (!phoneDigits || phoneDigits.length < 10) {
          if (phoneInput) { phoneInput.style.borderColor = 'var(--rose)'; phoneInput.focus(); }
          return;
        }
        if (phoneInput) phoneInput.style.borderColor = '';
        recordAnswer('phone', phoneDigits);
        // Lead capture is deferred to step 34 (state) so DOB and state are included
        advance();
      });
    }

    // ── Step 33: Date of Birth ────────────────────────────────
    var s33next  = document.getElementById('step-33-next-dob');
    var dobInput = document.getElementById('dob-input');

    // Live DOB formatting: MM/DD/YYYY
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
        if (e.key === 'Enter') { e.preventDefault(); if (s33next) s33next.click(); }
      });
    }

    if (s33next) {
      s33next.addEventListener('click', function() {
        var dob = dobInput ? dobInput.value.trim() : '';
        // Validate MM/DD/YYYY format
        var dobRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(19|20)\d{2}$/;
        if (!dobRegex.test(dob)) {
          if (dobInput) { dobInput.style.borderColor = 'var(--rose)'; dobInput.focus(); }
          // Show inline error
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

    // ── Step 34: State ────────────────────────────────────────
    var s34next    = document.getElementById('step-34-next-state');
    var stateInput = document.getElementById('state-input');

    if (s34next) {
      s34next.addEventListener('click', function() {
        var state = stateInput ? stateInput.value.trim() : '';
        if (!state) {
          if (stateInput) { stateInput.style.borderColor = 'var(--rose)'; stateInput.focus(); }
          return;
        }
        if (stateInput) stateInput.style.borderColor = '';
        recordAnswer('state', state);
        // Fire lead capture now — all contact fields (name, email, phone, DOB, state) are available
        if (!leadCaptured) {
          captureLead(function() { advance(); });
        } else {
          advance();
        }
      });
    }
    if (stateInput) {
      stateInput.addEventListener('change', function() {
        if (this.value) this.style.borderColor = '';
      });
    }

    // ── Step 35: Consent "Continue" button ───────────────────────────────────
    var s35next = document.getElementById('step-35-next');
    if (s35next) {
      s35next.addEventListener('click', function() { advance(); });
    }
  }

  /* ── Early lead capture ──────────────────────────────────────────────────────────────────────────── */
  // Fires at step 34 (state) — all contact fields (name, email, phone, DOB, state) are available
  function captureLead(callback) {
    var btn = document.getElementById('step-34-next-state');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

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
    var skipIds = ['step-30-next-name','step-30-next-email','step-31-next',
                   'step-33-next-dob','step-34-next-state',
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
        advance();
      });
    });

    // Step 35 consent "Continue" button
    var s35next = document.getElementById('step-35-next');
    if (s35next) {
      s35next.addEventListener('click', function() { advance(); });
    }
  }

  /* ── Interstitial CTA buttons ────────────────────────────────────────────── */
  function bindInterstitialCTAs() {
    document.querySelectorAll('.interstitial-cta').forEach(function(btn) {
      if (btn.hasAttribute('onclick')) return;
      btn.addEventListener('click', function(e) { e.preventDefault(); advance(); });
    });
  }

  /* ── Disqualify screen ───────────────────────────────────────────────────── */
  function showDisqualify(dqValue) {
    DISQUALIFY_REASON = dqValue || null;
    document.querySelectorAll('.quiz-step').forEach(function(el) { el.classList.remove('active','exit'); });
    var dq = document.getElementById('disqualify-screen');
    if (dq) dq.style.display = 'flex';
    var fill = document.getElementById('progressFill');
    if (fill) fill.style.width = '0%';
    var backBtn = document.getElementById('quizBackBtn');
    if (backBtn) backBtn.style.display = 'none';
    var msg = (dqValue && DQ_MESSAGES[dqValue]) ? DQ_MESSAGES[dqValue] : null;
    var headline = document.getElementById('dqHeadline');
    var bodyEl   = document.getElementById('dqBody');
    if (headline) headline.textContent = msg ? msg.headline : "We want to make sure you're safe.";
    if (bodyEl)   bodyEl.textContent   = msg ? msg.body : 'Based on one of your answers, our physicians may not be able to prescribe HRT at this time. This is for your safety \u2014 hormone therapy is not appropriate for everyone. We recommend speaking with your primary care physician or OB-GYN who can review your full medical history.';
  }

  window.hideDisqualify = function() {
    var dq = document.getElementById('disqualify-screen');
    if (dq) dq.style.display = 'none';
    showStep(currentStep);
    var stepEl = document.getElementById('step-' + currentStep);
    if (stepEl && DISQUALIFY_REASON) {
      var btn = stepEl.querySelector('[data-value="' + DISQUALIFY_REASON + '"]');
      if (btn) btn.classList.remove('selected');
      delete answers['step-' + currentStep];
      saveSession();
    }
    DISQUALIFY_REASON = null;
  };

  /* ── Timeline animation (step 8) ────────────────────────────────────────── */
  function animateTimeline() {
    document.querySelectorAll('#step-8 .timeline-item').forEach(function(item) {
      item.classList.add('animate');
    });
  }

  /* ── Global onclick wrappers ─────────────────────────────────────────────── */
  window.advanceStep = function() { advance(); };

  window.toggleConsent = function(n) {
    var item = document.getElementById('consent-' + n);
    if (item) item.classList.toggle('open');
  };

  window.agreeConsent = function(n) {
    var item = document.getElementById('consent-' + n);
    if (!item || item.classList.contains('agreed')) return;
    item.classList.add('agreed');
    item.classList.remove('open');
    consentAgreed++;
    checkConsentComplete();
  };

  window.agreeAllConsents = function() {
    for (var i = 1; i <= CONSENT_REQUIRED; i++) {
      var item = document.getElementById('consent-' + i);
      if (item && !item.classList.contains('agreed')) {
        item.classList.add('agreed');
        item.classList.remove('open');
        consentAgreed++;
      }
    }
    recordAnswer('consents', 'agreed');
    checkConsentComplete();
    setTimeout(function() { advance(); }, 400);
  };

  function checkConsentComplete() {
    if (consentAgreed >= CONSENT_REQUIRED) {
      var nb = document.getElementById('step-35-next');
      if (nb) { nb.classList.add('visible'); nb.removeAttribute('disabled'); }
      var agreeAll = document.getElementById('consent-agree-all-btn');
      if (agreeAll) agreeAll.style.display = 'none';
    }
  }

  /* ── Loading screen & handoff to treatment page ──────────────────────────── */
  window.startLoading = function() {
    var loader = document.getElementById('step-37');
    var fill   = document.getElementById('progressFill');
    if (fill) fill.style.width = '100%';
    window.scrollTo(0, 0);

    var step36 = document.getElementById('step-36');
    function activateLoader() {
      document.querySelectorAll('.quiz-step').forEach(function(el) { el.classList.remove('active','exit'); });
      if (loader) loader.classList.add('active');
      runLoadingAnimation();
    }
    if (step36 && step36.classList.contains('active')) {
      step36.classList.add('exit');
      setTimeout(activateLoader, 220);
    } else {
      activateLoader();
    }
  };

  function runLoadingAnimation() {
    var loader = document.getElementById('step-37');
    var bar    = loader ? loader.querySelector('.loading-bar-fill') : null;
    var status = loader ? loader.querySelector('.loading-status')   : null;
    var msgs   = [
      'Reviewing your symptom profile\u2026',
      'Checking treatment compatibility\u2026',
      'Matching physician-approved options\u2026',
      'Almost ready\u2026',
    ];
    var pct = 0, mi = 0;

    var flags = computeClinicalFlags(answers);
    sessionStorage.setItem('crx_flags',   JSON.stringify(flags));
    sessionStorage.setItem('crx_answers', JSON.stringify(answers));
    if (sessionId)            sessionStorage.setItem('crx_session_id',  sessionId);
    if (answers['firstName']) sessionStorage.setItem('crx_first_name',  answers['firstName']);
    if (answers['lastName'])  sessionStorage.setItem('crx_last_name',   answers['lastName']);
    if (answers['email'])     sessionStorage.setItem('crx_email',       answers['email']);
    if (answers['phone'])     sessionStorage.setItem('crx_phone',       answers['phone']);
    if (answers['state'])     sessionStorage.setItem('crx_state',       answers['state']);
    if (answers['dob'])       sessionStorage.setItem('crx_dob',         answers['dob']);

    var iv = setInterval(function() {
      pct += Math.random() * 18 + 8;
      if (pct > 90) pct = 90;
      if (bar)    bar.style.width   = pct + '%';
      if (status && mi < msgs.length) { status.textContent = msgs[mi]; mi++; }
    }, 650);

    setTimeout(function() {
      clearInterval(iv);
      if (bar) bar.style.width = '100%';
      setTimeout(function() {
        var lc = loader ? loader.querySelector('.loading-content') : null;
        var sc = loader ? loader.querySelector('.loading-success') : null;
        if (lc) lc.style.display = 'none';
        if (sc) sc.classList.add('show');
        launchConfetti();
        setTimeout(function() { window.location.href = 'treatments.html'; }, 2200);
      }, 400);
    }, 2900);
  }

  /* ── Compute clinical flags ──────────────────────────────────────────────── */
  function computeClinicalFlags(a) {
    var symptoms   = (a['step-6']  || '').split(',').map(function(s) { return s.trim(); });
    var conditions = (a['step-13'] || '').split(',').map(function(s) { return s.trim(); });

    // Adhesive allergy: step-19
    var adhesiveAllergy = (a['adhesive-allergy'] === 'yes');

    // Nicotine: step-20; also block oral if blood clots in conditions
    var nicotineUse    = (a['nicotine-use'] === 'yes');
    var bloodClots     = conditions.indexOf('blood-clots') !== -1;
    var nicotineOrClot = nicotineUse || bloodClots;

    // Transdermal side effects: dedicated step-25 (only asked if HRT history != 'never')
    var transdermalSideEffects = (a['transdermal-se'] === 'yes');

    // Clinical routing flags
    var longDuration = (a['step-3'] === '3-plus-years');
    var hysterectomy = !!(a['step-21'] && a['step-21'] !== 'no');

    var sleepTenderness = !hysterectomy && !!(a['step-22'] && a['step-22'] !== 'neither');
    var progIntolerance = sleepTenderness && (a['step-23'] === 'yes');

    // needsProgesterone: EVERYONE with a uterus (no hysterectomy)
    var needsProgesterone = !hysterectomy;

    // Vaginal symptoms
    var vaginalSymptoms = symptoms.indexOf('vaginal-dryness') !== -1 ||
                          symptoms.indexOf('low-libido')      !== -1;

    // Delivery preference (from step 26)
    var deliveryPreference = a['step-26'] || 'no-preference';

    return {
      adhesiveAllergy:        adhesiveAllergy,
      nicotineUse:            nicotineUse,
      nicotineOrClot:         nicotineOrClot,
      transdermalSideEffects: transdermalSideEffects,
      doseTier:               longDuration ? 'low' : 'normal',
      hysterectomy:           hysterectomy,
      sleepTenderness:        sleepTenderness,
      progIntolerance:        progIntolerance,
      needsProgesterone:      needsProgesterone,
      vaginalSymptoms:        vaginalSymptoms,
      deliveryPreference:     deliveryPreference,
      // Convenience block flags for treatment page
      blockPatch:             adhesiveAllergy,
      blockOral:              nicotineOrClot,
      blockTransdermal:       transdermalSideEffects,
      // Pass-through contact info
      firstName:              a['firstName'] || '',
      lastName:               a['lastName']  || '',
      email:                  a['email']     || '',
      phone:                  a['phone']     || '',
      state:                  a['state']     || '',
      dob:                    a['dob']       || '',
      sessionId:              sessionId      || '',
    };
  }

  /* ── Confetti ────────────────────────────────────────────────────────────── */
  function launchConfetti() {
    var wrap = document.createElement('div');
    wrap.className = 'confetti-wrap';
    document.body.appendChild(wrap);
    var colors = ['#C4826A','#7A9E7E','#FAF7F4','#2C3E2D','#E0D8D0'];
    for (var i = 0; i < 60; i++) {
      var piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.cssText = [
        'left:' + Math.random() * 100 + '%',
        'background:' + colors[Math.floor(Math.random() * colors.length)],
        'animation-duration:' + (Math.random() * 2 + 1.5) + 's',
        'animation-delay:' + (Math.random() * 0.5) + 's',
        'width:' + (Math.random() * 6 + 5) + 'px',
        'height:' + (Math.random() * 6 + 5) + 'px',
        'border-radius:' + (Math.random() > 0.5 ? '50%' : '2px'),
      ].join(';');
      wrap.appendChild(piece);
    }
    setTimeout(function() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 4000);
  }

  /* ── Stub bindings for unused features ──────────────────────────────────── */
  function bindFAQ() {}
  function bindDosageOptions() {}

  /* ── Emoji scale ─────────────────────────────────────────────────────────── */
  function bindEmojiScale() {
    document.querySelectorAll('.emoji-scale').forEach(function(scale) {
      var stepEl  = scale.closest('.quiz-step');
      var stepKey = stepEl ? stepEl.id : 'emoji';

      scale.querySelectorAll('.emoji-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          scale.querySelectorAll('.emoji-btn').forEach(function(b) { b.classList.remove('selected'); });
          btn.classList.add('selected');
          recordAnswer(stepKey, btn.dataset.value);
          setTimeout(advance, 350);
        });
      });
    });
  }

})();
