/* ============================================================
   ClearedRx Quiz Funnel v6 — Full QA Pass
   - Auto-focus input fields when step becomes active
   - Correct step skip logic (hysterectomy, sleep/tenderness)
   - Disqualification on medical conditions, medications,
     pregnancy, sex, blood pressure
   - Flash-free loading screen transition
   - Robust consent flow
   ============================================================ */

(function() {
  'use strict';

  var TOTAL_STEPS = 32;
  var currentStep = 1;
  var answers     = {};
  var consentAgreed   = 0;
  var CONSENT_REQUIRED = 3;

  var PROXY_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : '/api-proxy';

  var sessionId    = null;
  var userId       = null;
  var leadCaptured = false;

  /* ── Disqualifying values per step ──────────────────────── */
  var DISQUALIFY = {
    'step-13': ['active-breast-cancer','family-cancer','blood-clots','stroke-tia','heart-disease','unexplained-bleeding','liver-disease'],
    'step-14': ['carbamazepine','phenytoin','rifampin','st-johns-wort','topiramate','lamotrigine','barbiturates'],
    'step-15': ['pregnant','breastfeeding'],
    'step-16': ['male'],
    'step-25': ['high-160-plus'],
  };

  /* ── Init ────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function() {
    // Restore session if available
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
  });

  /* ── Session persistence ─────────────────────────────────── */
  function saveSession() {
    sessionStorage.setItem('crx_session', JSON.stringify({
      sessionId: sessionId,
      userId:    userId,
      answers:   answers,
    }));
    if (sessionId)              sessionStorage.setItem('crx_session_id',  sessionId);
    if (answers['firstName'])   sessionStorage.setItem('crx_first_name',  answers['firstName']);
    if (answers['lastName'])    sessionStorage.setItem('crx_last_name',   answers['lastName']);
    if (answers['email'])       sessionStorage.setItem('crx_email',       answers['email']);
    if (answers['phone'])       sessionStorage.setItem('crx_phone',       answers['phone']);
    if (answers['state'])       sessionStorage.setItem('crx_state',       answers['state']);
  }

  /* ── Progress bar ────────────────────────────────────────── */
  function updateProgress(step) {
    var fill = document.getElementById('progressFill');
    if (!fill) return;
    var pct = Math.round(((step - 1) / (TOTAL_STEPS - 1)) * 100);
    fill.style.width = Math.max(2, pct) + '%';
  }

  /* ── Show step + auto-focus input fields ─────────────────── */
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

    // Auto-focus first visible input/textarea in this step
    setTimeout(function() {
      var input = target.querySelector('input[type="text"], input[type="email"], input[type="tel"], textarea');
      if (input) {
        try { input.focus(); } catch(e) {}
      }
    }, 260);   // after slide-in animation (~220ms)

    if (n === 8) setTimeout(animateTimeline, 300);
  }

  /* ── Compute next step (conditional skip logic) ──────────── */
  function getNextStep(from) {
    // Step 19 = hysterectomy
    if (from === 19) {
      var hyst = answers['step-19'] || '';
      // Any value other than 'no' means hysterectomy → skip 20 & 21
      return (hyst !== 'no' && hyst !== '') ? 22 : 20;
    }

    // Step 20 = sleep/breast tenderness (only shown if no hysterectomy)
    if (from === 20) {
      var st = answers['step-20'] || '';
      // 'neither' → no progesterone needed → skip step 21
      return (st === 'neither') ? 22 : 21;
    }

    return from + 1;
  }

  /* ── Advance to next step ────────────────────────────────── */
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

  /* ── Record answer ───────────────────────────────────────── */
  function recordAnswer(key, value) {
    answers[key] = value;
    saveSession();
  }

  /* ── Bind single/multi select options ────────────────────── */
  function bindOptions() {
    document.querySelectorAll('.options-list').forEach(function(list) {
      if (list.id === 'allergy-yn-list') return;   // handled separately

      var isMulti = list.classList.contains('multi') || list.dataset.multi === 'true';
      var stepEl  = list.closest('.quiz-step');
      if (!stepEl) return;
      var stepKey = stepEl.id;

      list.querySelectorAll('.option-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          if (isMulti) {
            if (btn.dataset.value === 'none') {
              // "None of the above" — deselect all, select none, auto-advance
              list.querySelectorAll('.option-btn').forEach(function(b) { b.classList.remove('selected'); });
              btn.classList.add('selected');
              recordAnswer(stepKey, 'none');
              var nb = stepEl.querySelector('.quiz-next-btn');
              if (nb) nb.classList.remove('visible');
              setTimeout(advance, 320);
            } else {
              // Real option selected — deselect "none"
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
            // Check for disqualifying answer
            if (DISQUALIFY[stepEl.id] && DISQUALIFY[stepEl.id].indexOf(btn.dataset.value) !== -1) {
              setTimeout(showDisqualify, 320);
              return;
            }
            setTimeout(advance, 320);
          }
        });
      });
    });
  }

  /* ── Allergy conditional flow ────────────────────────────── */
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
        // Focus the allergy text input
        setTimeout(function() {
          if (allergyInput) allergyInput.focus();
        }, 100);
      });
    }

    if (allergyNext) {
      allergyNext.addEventListener('click', function() {
        recordAnswer('allergies', allergyInput ? allergyInput.value.trim() : '');
        advance();
      });
    }

    if (allergyInput) {
      allergyInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); if (allergyNext) allergyNext.click(); }
      });
    }
  }

  /* ── Contact field next buttons ──────────────────────────── */
  function bindContactNextButtons() {
    // ── Step 27: First + Last name ────────────────────────────
    var s27next   = document.getElementById('step-27-next-name');
    var fnInput   = document.getElementById('first-name-input');
    var lnInput   = document.getElementById('last-name-input');

    if (s27next) {
      s27next.addEventListener('click', function() {
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
        if (e.key === 'Enter') { e.preventDefault(); if (s27next) s27next.click(); }
      });
    }

    // ── Step 28: Email ────────────────────────────────────────
    var s28next    = document.getElementById('step-28-next-email');
    var emailInput = document.getElementById('email-input');

    if (s28next) {
      s28next.addEventListener('click', function() {
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
        if (e.key === 'Enter') { e.preventDefault(); if (s28next) s28next.click(); }
      });
    }

    // ── Step 29: Phone (triggers lead capture) ────────────────
    var s29next    = document.getElementById('step-29-next');
    var phoneInput = document.getElementById('phone-input');

    // Live phone formatting
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
        if (e.key === 'Enter') { e.preventDefault(); if (s29next) s29next.click(); }
      });
    }

    if (s29next) {
      s29next.addEventListener('click', function() {
        var phone       = phoneInput ? phoneInput.value.trim() : '';
        var phoneDigits = phone.replace(/\D/g, '');
        if (!phoneDigits || phoneDigits.length < 10) {
          if (phoneInput) { phoneInput.style.borderColor = 'var(--rose)'; phoneInput.focus(); }
          return;
        }
        if (phoneInput) phoneInput.style.borderColor = '';
        recordAnswer('phone', phoneDigits);
        if (!leadCaptured) {
          captureLead(function() { advance(); });
        } else {
          advance();
        }
      });
    }
  }

  /* ── Early lead capture ──────────────────────────────────── */
  function captureLead(callback) {
    var btn = document.getElementById('step-29-next');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }

    var payload = {
      firstName: answers['firstName'] || '',
      lastName:  answers['lastName']  || '',
      email:     answers['email']     || '',
      phone:     answers['phone']     || '',
      state:     answers['state']     || 'CA',
      zip:       answers['zip']       || '00000',
      dob:       answers['dob']       || '01/01/1975',
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

  /* ── Emoji scale ─────────────────────────────────────────── */
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

  /* ── Next buttons (multi-select steps) ──────────────────── */
  function bindNextButtons() {
    var skipIds = ['step-27-next-name','step-28-next-email','step-29-next',
                   'step-18-allergy-next','step-30-next'];
    document.querySelectorAll('.quiz-next-btn').forEach(function(btn) {
      if (skipIds.indexOf(btn.id) !== -1) return;
      btn.addEventListener('click', function() {
        var stepEl = btn.closest('.quiz-step');
        if (!stepEl) { advance(); return; }
        var vals = [];
        stepEl.querySelectorAll('.option-btn.selected').forEach(function(s) { vals.push(s.dataset.value); });
        // Check for disqualifying selections
        if (DISQUALIFY[stepEl.id]) {
          for (var i = 0; i < vals.length; i++) {
            if (DISQUALIFY[stepEl.id].indexOf(vals[i]) !== -1) { showDisqualify(); return; }
          }
        }
        advance();
      });
    });

    // Step 30 consent "Continue" button
    var s30next = document.getElementById('step-30-next');
    if (s30next) {
      s30next.addEventListener('click', function() { advance(); });
    }
  }

  /* ── Interstitial CTA buttons ────────────────────────────── */
  function bindInterstitialCTAs() {
    document.querySelectorAll('.interstitial-cta').forEach(function(btn) {
      if (btn.hasAttribute('onclick')) return;   // already has onclick (e.g. startLoading)
      btn.addEventListener('click', function(e) { e.preventDefault(); advance(); });
    });
  }

  /* ── Disqualify screen ───────────────────────────────────── */
  function showDisqualify() {
    document.querySelectorAll('.quiz-step').forEach(function(el) { el.classList.remove('active','exit'); });
    var dq = document.getElementById('disqualify-screen');
    if (dq) dq.style.display = 'flex';
    var fill = document.getElementById('progressFill');
    if (fill) fill.style.width = '100%';
    window.scrollTo(0, 0);
  }

  /* ── Timeline animation (step 8) ────────────────────────── */
  function animateTimeline() {
    document.querySelectorAll('#step-8 .timeline-item').forEach(function(item) {
      item.classList.add('animate');
    });
  }

  /* ── Global onclick wrappers ─────────────────────────────── */
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
      var nb = document.getElementById('step-30-next');
      if (nb) { nb.classList.add('visible'); nb.removeAttribute('disabled'); }
      var agreeAll = document.getElementById('consent-agree-all-btn');
      if (agreeAll) agreeAll.style.display = 'none';
    }
  }

  /* ── Loading screen & handoff to treatment page ──────────── */
  window.startLoading = function() {
    var loader = document.getElementById('step-32');
    var fill   = document.getElementById('progressFill');
    if (fill) fill.style.width = '100%';
    window.scrollTo(0, 0);

    // Exit-animate step-31 before showing step-32 (prevents flash)
    var step31 = document.getElementById('step-31');
    function activateLoader() {
      document.querySelectorAll('.quiz-step').forEach(function(el) { el.classList.remove('active','exit'); });
      if (loader) loader.classList.add('active');
      runLoadingAnimation();
    }
    if (step31 && step31.classList.contains('active')) {
      step31.classList.add('exit');
      setTimeout(activateLoader, 220);
    } else {
      activateLoader();
    }
  };

  function runLoadingAnimation() {
    var loader = document.getElementById('step-32');
    var bar    = loader ? loader.querySelector('.loading-bar-fill') : null;
    var status = loader ? loader.querySelector('.loading-status')   : null;
    var msgs   = [
      'Reviewing your symptom profile\u2026',
      'Checking treatment compatibility\u2026',
      'Matching physician-approved options\u2026',
      'Almost ready\u2026',
    ];
    var pct = 0, mi = 0;

    // Compute and store clinical flags BEFORE the animation completes
    var flags = computeClinicalFlags(answers);
    sessionStorage.setItem('crx_flags',    JSON.stringify(flags));
    sessionStorage.setItem('crx_answers',  JSON.stringify(answers));
    if (sessionId)              sessionStorage.setItem('crx_session_id',  sessionId);
    if (answers['firstName'])   sessionStorage.setItem('crx_first_name',  answers['firstName']);
    if (answers['lastName'])    sessionStorage.setItem('crx_last_name',   answers['lastName']);
    if (answers['email'])       sessionStorage.setItem('crx_email',       answers['email']);
    if (answers['phone'])       sessionStorage.setItem('crx_phone',       answers['phone']);
    if (answers['state'])       sessionStorage.setItem('crx_state',       answers['state']);

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

  /* ── Compute clinical flags ──────────────────────────────── */
  function computeClinicalFlags(a) {
    var symptoms   = (a['step-6']  || '').split(',');
    var conditions = (a['step-13'] || '').split(',');

    // Adhesive allergy → block patch
    var adhesiveAllergy = false;
    if (a['allergies'] && /adhesive|tape|bandage|patch/i.test(a['allergies'])) {
      adhesiveAllergy = true;
    }

    // Blood clots → block oral estrogen (pill)
    var nicotineOrClot = conditions.indexOf('blood-clots') !== -1;

    // Transdermal side effects → block gel/patch
    var transdermalSideEffects = (a['step-22'] === 'tried-didnt-work');

    // Symptom duration
    var longDuration = (a['step-3'] === '3-plus-years');

    // Hysterectomy
    var hysterectomy = !!(a['step-19'] && a['step-19'] !== 'no');

    // Sleep/breast tenderness (only relevant if no hysterectomy)
    var sleepTenderness = !hysterectomy && !!(a['step-20'] && a['step-20'] !== 'neither');

    // Progesterone intolerance (only relevant if sleepTenderness)
    var progIntolerance = sleepTenderness && (a['step-21'] === 'yes');

    // Needs progesterone: uterus intact AND has sleep/tenderness symptoms
    var needsProgesterone = !hysterectomy && sleepTenderness;

    // Vaginal symptoms
    var vaginalSymptoms = symptoms.indexOf('vaginal-dryness') !== -1 ||
                          symptoms.indexOf('low-libido')      !== -1;

    // Delivery preference
    var deliveryPreference = a['step-23'] || 'no-preference';

    return {
      adhesiveAllergy:        adhesiveAllergy,
      nicotineOrClot:         nicotineOrClot,
      transdermalSideEffects: transdermalSideEffects,
      doseTier:               longDuration ? 'low' : 'normal',
      hysterectomy:           hysterectomy,
      sleepTenderness:        sleepTenderness,
      progIntolerance:        progIntolerance,
      needsProgesterone:      needsProgesterone,
      vaginalSymptoms:        vaginalSymptoms,
      deliveryPreference:     deliveryPreference,
      blockPatch:             adhesiveAllergy,
      blockOral:              nicotineOrClot,
      blockTransdermal:       transdermalSideEffects,
      firstName:              a['firstName'] || '',
      lastName:               a['lastName']  || '',
      email:                  a['email']     || '',
      phone:                  a['phone']     || '',
      sessionId:              sessionId      || '',
    };
  }

  /* ── Confetti ────────────────────────────────────────────── */
  function launchConfetti() {
    var wrap   = document.createElement('div');
    wrap.className = 'confetti-wrap';
    document.body.appendChild(wrap);
    var colors = ['#C4826A','#7A9E7E','#F5A623','#E8D5C4','#2C2C2C'];
    for (var i = 0; i < 70; i++) {
      (function() {
        var p = document.createElement('div');
        p.className = 'confetti-piece';
        p.style.cssText =
          'left:'             + Math.random() * 100 + 'vw;' +
          'top:-10px;' +
          'background:'       + colors[Math.floor(Math.random() * colors.length)] + ';' +
          'width:'            + (Math.random() * 8 + 5) + 'px;' +
          'height:'           + (Math.random() * 8 + 5) + 'px;' +
          'animation-duration:'+ (Math.random() * 2 + 1.5) + 's;' +
          'animation-delay:'  + (Math.random() * 0.8) + 's;' +
          'border-radius:'    + (Math.random() > 0.5 ? '50%' : '2px');
        wrap.appendChild(p);
        setTimeout(function() { p.remove(); }, 4000);
      })();
    }
    setTimeout(function() { wrap.remove(); }, 4500);
  }

  /* ── FAQ accordion ───────────────────────────────────────── */
  function bindFAQ() {
    document.querySelectorAll('.faq-question').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var item = btn.closest('.faq-item');
        if (item) item.classList.toggle('open');
      });
    });
  }

  /* ── Dosage selection ────────────────────────────────────── */
  function bindDosageOptions() {
    document.querySelectorAll('.dosage-option').forEach(function(opt) {
      opt.addEventListener('click', function() {
        var panel = opt.closest('.product-panel');
        if (panel) panel.querySelectorAll('.dosage-option').forEach(function(o) { o.classList.remove('selected'); });
        opt.classList.add('selected');
      });
    });
  }

  // Debug helpers
  window.quizAnswers = answers;
  window.quizSession = function() { return { sessionId: sessionId, userId: userId, answers: answers }; };

})();
