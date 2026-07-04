/* ============================================================
   ClearedRx V4 Quiz — quiz.js
   ============================================================
   Short CRO funnel. FDA patch + progesterone priority.
   Answer keys map 1:1 to server remapAnswersV4 (see server.js +
   frontend/v4/DESIGN.md). Consent bodies are fetched live from
   /api/v4/consents so legal text always matches the source system.
   ============================================================ */
(function() {
  'use strict';

  var PROXY_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : 'https://crx-server-hzyh.onrender.com';

  /* ── State ────────────────────────────────────────────────────────────── */
  var answers = {
    sex: '',
    symptoms: [],            // multi
    otherSymptomText: '',
    duration: '',
    takingMeds: '',
    medsText: '',
    diagnoses: [],           // multi
    otherConditionText: '',
    hrtHistory: '',
    hrtProduct: '',
    hrtSideEffects: '',
    hrtSideEffectDetail: '',
    transdermalSE: '',
    transdermalDetail: '',
    lifestyle: [],           // multi
    hysterectomy: '',
    hysterectomyReason: '',
    bloodPressure: '',
    preference: '',
    allergies: '',
    allergyText: '',
    doctorNote: '',
  };
  var contact = { firstName: '', lastName: '', email: '', phone: '', state: '', dob: '' };
  var currentStep = 'sex';
  var sessionId = null;
  var leadCaptured = false;
  var dqReason = '';

  /* ── Step order (conditionals resolved dynamically) ───────────────────── */
  function computeOrder() {
    var order = ['sex', 'symptoms', 'duration', 'safety', 'pregnancy', 'meds', 'diagnoses', 'hrt'];
    if (answers.hrtHistory === 'current' || answers.hrtHistory === 'past') {
      order.push('hrt-product', 'hrt-se');
      if (answers.hrtSideEffects === 'yes') order.push('hrt-se-detail');
    }
    order.push('lifestyle', 'hysterectomy');
    if (answers.hysterectomy === 'yes') order.push('hyst-reason');
    order.push('bp', 'preference', 'allergies', 'state', 'dob', 'name', 'email', 'phone', 'consents', 'loading');
    return order;
  }

  function getNextStep(from) {
    var order = computeOrder();
    var i = order.indexOf(from);
    return (i >= 0 && i < order.length - 1) ? order[i + 1] : null;
  }
  function getPrevStep(from) {
    var order = computeOrder();
    var i = order.indexOf(from);
    return (i > 0) ? order[i - 1] : null;
  }

  /* ── URL params → sessionStorage ──────────────────────────────────────── */
  (function captureParams() {
    try {
      var p = new URLSearchParams(window.location.search);
      if (p.get('couponCode'))    sessionStorage.setItem('crx_coupon',        p.get('couponCode'));
      if (p.get('cc_custom_cid')) sessionStorage.setItem('crx_cc_custom_cid', p.get('cc_custom_cid'));
      if (p.get('affId'))         sessionStorage.setItem('crx_aff_id',        p.get('affId'));
      if (p.get('c1'))            sessionStorage.setItem('crx_c1',            p.get('c1'));
    } catch (e) {}
  })();

  /* ── Session persist / restore ────────────────────────────────────────── */
  function saveSession() {
    try {
      sessionStorage.setItem('crx_v4_session', JSON.stringify({
        step: currentStep, answers: answers, contact: contact,
        sessionId: sessionId, leadCaptured: leadCaptured,
      }));
    } catch (e) {}
  }
  function restoreSession() {
    try {
      var raw = sessionStorage.getItem('crx_v4_session');
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s.answers) answers = Object.assign(answers, s.answers);
      if (s.contact) contact = Object.assign(contact, s.contact);
      if (s.sessionId) sessionId = s.sessionId;
      if (s.leadCaptured) leadCaptured = true;
      if (s.step && s.step !== 'loading' && computeOrder().indexOf(s.step) !== -1) currentStep = s.step;
      rehydrateUI();
    } catch (e) {}
  }

  /* ── Navigation ───────────────────────────────────────────────────────── */
  function showStep(step) {
    var steps = document.querySelectorAll('.quiz-step');
    for (var i = 0; i < steps.length; i++) steps[i].classList.remove('active');
    var el = document.getElementById('step-' + step);
    if (el) el.classList.add('active');
    currentStep = step;

    var order = computeOrder();
    var idx = order.indexOf(step);
    var fill = document.getElementById('progressFill');
    if (fill) fill.style.width = Math.round(((idx + 1) / order.length) * 100) + '%';

    var back = document.getElementById('quizBackBtn');
    if (back) back.style.display = (idx <= 0 || step === 'loading') ? 'none' : 'flex';

    window.scrollTo({ top: 0, behavior: 'smooth' });
    saveSession();
  }
  function advance() {
    var next = getNextStep(currentStep);
    if (!next) return;
    if (next === 'loading') { showStep('loading'); startComplete(); return; }
    showStep(next);
  }
  function goBack() {
    var prev = getPrevStep(currentStep);
    if (prev) showStep(prev);
  }

  /* ── Disqualification ─────────────────────────────────────────────────── */
  var DQ_BODIES = {
    'male':        'This treatment program is designed for women experiencing menopause. Our physicians are unable to prescribe it based on your answer.',
    'no-symptoms': 'Hormone therapy is prescribed to treat menopause symptoms. Since you’re not currently experiencing any, our physicians can’t prescribe it at this time. If symptoms appear later, you’re welcome back anytime.',
    'safety':      'Based on your health history, our physicians are unable to safely prescribe this treatment online. This is purely for your safety — please speak with your doctor or OB-GYN, who can review your full history in person.',
    'pregnancy':   'This treatment isn’t safe during pregnancy or while breastfeeding. Please check back with us when that changes — we’d love to help.',
    'medications': 'One of your current medications can interact with this treatment, so our physicians can’t prescribe it online. Your doctor may be able to discuss alternatives in person.',
    'bp':          'A blood pressure reading in that range needs to be addressed before hormone therapy can be prescribed safely. Please see your doctor about your blood pressure first — then we’d be glad to help.',
    'age':         'Our physicians can only prescribe this treatment to women 35 and older. We’re sorry we can’t help just yet.',
  };
  function disqualify(reason) {
    dqReason = reason;
    var body = document.getElementById('dqBody');
    if (body && DQ_BODIES[reason]) body.textContent = DQ_BODIES[reason];
    var overlay = document.getElementById('disqualify-screen');
    if (overlay) overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
  function hideDisqualify() {
    var overlay = document.getElementById('disqualify-screen');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  /* ── Generic wiring helpers ───────────────────────────────────────────── */
  // Single-select: auto-advance on tap.
  function wireSingle(stepId, onSelect) {
    var root = document.getElementById('step-' + stepId);
    if (!root) return;
    var btns = root.querySelectorAll('.options-list:not(.multi) .option-btn');
    for (var i = 0; i < btns.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          var sib = root.querySelectorAll('.options-list:not(.multi) .option-btn');
          for (var j = 0; j < sib.length; j++) sib[j].classList.remove('selected');
          btn.classList.add('selected');
          onSelect(btn.getAttribute('data-value'), btn);
        });
      })(btns[i]);
    }
  }
  // Multi-select with "none"-style exclusive values. Returns getter.
  function wireMulti(listId, exclusiveValues, onChange) {
    var list = document.getElementById(listId);
    if (!list) return function() { return []; };
    var btns = list.querySelectorAll('.option-btn');
    function selected() {
      var out = [];
      for (var i = 0; i < btns.length; i++) if (btns[i].classList.contains('selected')) out.push(btns[i].getAttribute('data-value'));
      return out;
    }
    for (var i = 0; i < btns.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          var v = btn.getAttribute('data-value');
          var isExclusive = exclusiveValues.indexOf(v) !== -1;
          if (isExclusive) {
            for (var j = 0; j < btns.length; j++) btns[j].classList.remove('selected');
            btn.classList.add('selected');
          } else {
            for (var j = 0; j < btns.length; j++) {
              if (exclusiveValues.indexOf(btns[j].getAttribute('data-value')) !== -1) btns[j].classList.remove('selected');
            }
            btn.classList.toggle('selected');
          }
          if (onChange) onChange(selected());
        });
      })(btns[i]);
    }
    return selected;
  }
  function setSelected(listId, values) {
    var list = document.getElementById(listId);
    if (!list) return;
    var btns = list.querySelectorAll('.option-btn');
    for (var i = 0; i < btns.length; i++) {
      if (values.indexOf(btns[i].getAttribute('data-value')) !== -1) btns[i].classList.add('selected');
    }
  }
  function showIf(id, cond) {
    var el = document.getElementById(id);
    if (el) el.style.display = cond ? 'block' : 'none';
  }
  function nextBtnVisible(id, cond) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('visible', !!cond);
  }

  /* ══ Part 2 (step handlers, contact, consents, complete) appended below ══ */

  /* ── Step: sex ─────────────────────────────────────────────────────────── */
  wireSingle('sex', function(v) {
    answers.sex = v;
    if (v === 'male') { disqualify('male'); return; }
    setTimeout(advance, 150);
  });

  /* ── Step: symptoms (Q3210/Q3211/Q3226/Q3228 stack) ───────────────────── */
  var getSymptoms = wireMulti('symptoms-list', ['none'], function(sel) {
    showIf('other-symptom-wrap', sel.indexOf('other') !== -1);
    nextBtnVisible('step-symptoms-next', sel.length > 0);
  });
  document.getElementById('step-symptoms-next').addEventListener('click', function() {
    var sel = getSymptoms();
    if (!sel.length) return;
    if (sel.indexOf('none') !== -1) { answers.symptoms = ['none']; disqualify('no-symptoms'); return; }
    answers.symptoms = sel;
    answers.otherSymptomText = (document.getElementById('other-symptom-text').value || '').trim();
    advance();
  });

  /* ── Step: duration ────────────────────────────────────────────────────── */
  wireSingle('duration', function(v) { answers.duration = v; setTimeout(advance, 150); });

  /* ── Step: safety (any selection besides none = DQ) ───────────────────── */
  var getSafety = wireMulti('safety-list', ['none'], function(sel) {
    nextBtnVisible('step-safety-next', sel.length > 0);
  });
  document.getElementById('step-safety-next').addEventListener('click', function() {
    var sel = getSafety();
    if (!sel.length) return;
    if (sel.indexOf('none') === -1) { disqualify('safety'); return; }
    advance();
  });

  /* ── Step: pregnancy ───────────────────────────────────────────────────── */
  var getPregnancy = wireMulti('pregnancy-list', ['none'], function(sel) {
    nextBtnVisible('step-pregnancy-next', sel.length > 0);
  });
  document.getElementById('step-pregnancy-next').addEventListener('click', function() {
    var sel = getPregnancy();
    if (!sel.length) return;
    if (sel.indexOf('none') === -1) { disqualify('pregnancy'); return; }
    advance();
  });

  /* ── Step: meds (No fast-path; Yes → free text + DQ chip check) ────────── */
  var medsDqSelected = false;
  wireSingle('meds', function(v) {
    answers.takingMeds = v;
    if (v === 'no') { answers.medsText = ''; setTimeout(advance, 150); return; }
    showIf('meds-detail-wrap', true);
  });
  (function wireMedsChips() {
    var list = document.getElementById('meds-dq-list');
    if (!list) return;
    var chips = list.querySelectorAll('.chip-btn');
    for (var i = 0; i < chips.length; i++) {
      (function(chip) {
        chip.addEventListener('click', function() {
          chip.classList.toggle('selected');
          medsDqSelected = list.querySelectorAll('.chip-btn.selected').length > 0;
          var nextBtn = document.getElementById('step-meds-next');
          if (nextBtn) nextBtn.innerHTML = medsDqSelected ? 'Continue &#8594;' : 'None of these &#8594;';
        });
      })(chips[i]);
    }
  })();
  document.getElementById('step-meds-next').addEventListener('click', function() {
    answers.medsText = (document.getElementById('meds-text').value || '').trim();
    if (medsDqSelected) { disqualify('medications'); return; }
    advance();
  });

  /* ── Step: diagnoses ───────────────────────────────────────────────────── */
  var getDiagnoses = wireMulti('diagnoses-list', ['none'], function(sel) {
    showIf('other-condition-wrap', sel.indexOf('other') !== -1);
    nextBtnVisible('step-diagnoses-next', sel.length > 0);
  });
  document.getElementById('step-diagnoses-next').addEventListener('click', function() {
    var sel = getDiagnoses();
    if (!sel.length) return;
    answers.diagnoses = (sel.indexOf('none') !== -1) ? [] : sel;
    answers.otherConditionText = (document.getElementById('other-condition-text').value || '').trim();
    advance();
  });

  /* ── Step: hrt chain ───────────────────────────────────────────────────── */
  wireSingle('hrt', function(v) { answers.hrtHistory = v; setTimeout(advance, 150); });
  document.getElementById('step-hrt-product-next').addEventListener('click', function() {
    answers.hrtProduct = (document.getElementById('hrt-product-text').value || '').trim();
    advance();
  });
  wireSingle('hrt-se', function(v) { answers.hrtSideEffects = v; setTimeout(advance, 150); });
  (function wireTransdermal() {
    var list = document.getElementById('transdermal-se-list');
    if (!list) return;
    var btns = list.querySelectorAll('.option-btn');
    for (var i = 0; i < btns.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          for (var j = 0; j < btns.length; j++) btns[j].classList.remove('selected');
          btn.classList.add('selected');
          answers.transdermalSE = btn.getAttribute('data-value');
          showIf('transdermal-detail-wrap', answers.transdermalSE === 'yes');
          nextBtnVisible('step-hrt-se-detail-next', true);
        });
      })(btns[i]);
    }
  })();
  document.getElementById('step-hrt-se-detail-next').addEventListener('click', function() {
    answers.hrtSideEffectDetail = (document.getElementById('hrt-se-detail-text').value || '').trim();
    answers.transdermalDetail = (document.getElementById('transdermal-detail-text').value || '').trim();
    if (!answers.transdermalSE) return; // must answer the skin-reaction question
    advance();
  });

  /* ── Step: lifestyle ───────────────────────────────────────────────────── */
  var getLifestyle = wireMulti('lifestyle-list', ['none'], function(sel) {
    nextBtnVisible('step-lifestyle-next', sel.length > 0);
  });
  document.getElementById('step-lifestyle-next').addEventListener('click', function() {
    var sel = getLifestyle();
    if (!sel.length) return;
    answers.lifestyle = (sel.indexOf('none') !== -1) ? [] : sel;
    advance();
  });

  /* ── Step: hysterectomy (+reason chips) ───────────────────────────────── */
  wireSingle('hysterectomy', function(v) { answers.hysterectomy = v; setTimeout(advance, 150); });
  var hystChipValue = '';
  (function wireHystChips() {
    var row = document.getElementById('hyst-chips');
    if (!row) return;
    var chips = row.querySelectorAll('.chip-btn');
    for (var i = 0; i < chips.length; i++) {
      (function(chip) {
        chip.addEventListener('click', function() {
          for (var j = 0; j < chips.length; j++) chips[j].classList.remove('selected');
          chip.classList.add('selected');
          hystChipValue = chip.getAttribute('data-value');
          nextBtnVisible('step-hyst-reason-next', true);
        });
      })(chips[i]);
    }
  })();
  document.getElementById('step-hyst-reason-next').addEventListener('click', function() {
    var extra = (document.getElementById('hyst-reason-text').value || '').trim();
    answers.hysterectomyReason = [hystChipValue, extra].filter(Boolean).join(' — ') || 'Medical necessity';
    advance();
  });

  /* ── Step: bp ──────────────────────────────────────────────────────────── */
  wireSingle('bp', function(v) {
    answers.bloodPressure = v;
    if (v === '160-plus') { disqualify('bp'); return; }
    setTimeout(advance, 150);
  });

  /* ── Step: preference (Q3242 — FDA card featured) ─────────────────────── */
  (function wirePreference() {
    var cards = document.querySelectorAll('#step-preference .pref-card');
    for (var i = 0; i < cards.length; i++) {
      (function(card) {
        card.addEventListener('click', function() {
          for (var j = 0; j < cards.length; j++) cards[j].classList.remove('selected');
          card.classList.add('selected');
          answers.preference = card.getAttribute('data-value');
          setTimeout(advance, 180);
        });
      })(cards[i]);
    }
  })();

  /* ── Step: allergies ───────────────────────────────────────────────────── */
  wireSingle('allergies', function(v) {
    answers.allergies = v;
    if (v === 'no') { answers.allergyText = ''; setTimeout(advance, 150); return; }
    showIf('allergy-detail-wrap', true);
  });
  document.getElementById('step-allergies-next').addEventListener('click', function() {
    answers.allergyText = (document.getElementById('allergy-text').value || '').trim();
    if (!answers.allergyText) { document.getElementById('allergy-text').focus(); return; }
    advance();
  });

  /* ── Contact: state ────────────────────────────────────────────────────── */
  var US_STATES = { AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming' };
  (function populateStates() {
    var sel = document.getElementById('state-select');
    if (!sel) return;
    for (var abbr in US_STATES) {
      var o = document.createElement('option');
      o.value = abbr; o.textContent = US_STATES[abbr];
      sel.appendChild(o);
    }
  })();
  document.getElementById('step-state-next').addEventListener('click', function() {
    var v = document.getElementById('state-select').value;
    if (!v) return;
    contact.state = v;
    advance();
  });

  /* ── Contact: dob (age gate ≥ 35) ─────────────────────────────────────── */
  (function wireDobMask() {
    var input = document.getElementById('dob-input');
    if (!input) return;
    input.addEventListener('input', function() {
      var d = input.value.replace(/\D/g, '').slice(0, 8);
      var out = d;
      if (d.length > 4) out = d.slice(0,2) + '/' + d.slice(2,4) + '/' + d.slice(4);
      else if (d.length > 2) out = d.slice(0,2) + '/' + d.slice(2);
      input.value = out;
    });
  })();
  document.getElementById('step-dob-next').addEventListener('click', function() {
    var raw = (document.getElementById('dob-input').value || '').trim();
    var err = document.getElementById('dob-error');
    var m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    function fail(msg) { if (err) { err.textContent = msg; err.style.display = 'block'; } }
    if (!m) { fail('Please enter your date of birth as MM/DD/YYYY.'); return; }
    var mo = +m[1], dy = +m[2], yr = +m[3];
    if (mo < 1 || mo > 12 || dy < 1 || dy > 31 || yr < 1920 || yr > 2015) { fail('That date doesn’t look right — please double-check.'); return; }
    var dob = new Date(yr, mo - 1, dy);
    var now = new Date();
    var age = now.getFullYear() - dob.getFullYear() - ((now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) ? 1 : 0);
    if (err) err.style.display = 'none';
    contact.dob = raw;
    if (age < 35) { disqualify('age'); return; }
    advance();
  });

  /* ── Contact: name / email / phone ────────────────────────────────────── */
  document.getElementById('step-name-next').addEventListener('click', function() {
    var f = (document.getElementById('first-name-input').value || '').trim();
    var l = (document.getElementById('last-name-input').value || '').trim();
    if (!f || !l) return;
    contact.firstName = f; contact.lastName = l;
    try { sessionStorage.setItem('crx_first_name', f); } catch (e) {}
    advance();
  });
  document.getElementById('step-email-next').addEventListener('click', function() {
    var v = (document.getElementById('email-input').value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { document.getElementById('email-input').focus(); return; }
    contact.email = v;
    advance();
  });
  document.getElementById('step-phone-next').addEventListener('click', function() {
    var v = (document.getElementById('phone-input').value || '').replace(/\D/g, '');
    if (v.length < 10) { document.getElementById('phone-input').focus(); return; }
    contact.phone = v;
    submitLead();
    advance();
  });
  // Enter-key advances on contact inputs
  (function wireEnterKeys() {
    var map = {
      'dob-input': 'step-dob-next', 'first-name-input': 'step-name-next', 'last-name-input': 'step-name-next',
      'email-input': 'step-email-next', 'phone-input': 'step-phone-next',
    };
    for (var id in map) {
      (function(inputId, btnId) {
        var el = document.getElementById(inputId);
        if (!el) return;
        el.addEventListener('keydown', function(ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); document.getElementById(btnId).click(); }
        });
      })(id, map[id]);
    }
  })();

  /* ── Lead capture (non-blocking) ──────────────────────────────────────── */
  function submitLead() {
    if (leadCaptured) return;
    fetch(PROXY_BASE + '/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: contact.firstName, lastName: contact.lastName,
        email: contact.email, phone: contact.phone,
        state: contact.state, zip: '00000', dob: contact.dob,
      }),
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data && data.redirect && (data.redirect_url || data.redirectUrl)) {
        window.location.href = data.redirect_url || data.redirectUrl;
        return;
      }
      if (data && data.sessionId) sessionId = data.sessionId;
      leadCaptured = true;
      saveSession();
    }).catch(function(e) { console.warn('lead capture failed (non-blocking):', e); });
  }

  /* ── Consents (bodies fetched live) ───────────────────────────────────── */
  var CONSENT_META = [
    { qid: 3204, title: 'Pregnancy safety',            always: true },
    { qid: 3240, title: 'Treatment risks & benefits',  always: true },
    { qid: 3238, title: 'Continued screening',         always: true },
    { qid: 3232, title: 'Uterine fibroids notice',     when: function() { return answers.diagnoses.indexOf('fibroids') !== -1; } },
    { qid: 3235, title: 'PCOS notice',                 when: function() { return answers.diagnoses.indexOf('pcos') !== -1; } },
    { qid: 3237, title: 'Endometriosis notice',        when: function() { return answers.diagnoses.indexOf('endometriosis') !== -1; } },
    { qid: 3241, title: 'Truthfulness',                always: true },
  ];
  var consentBodies = {};
  fetch(PROXY_BASE + '/api/v4/consents')
    .then(function(r) { return r.json(); })
    .then(function(data) { consentBodies = data || {}; renderConsents(); })
    .catch(function() { renderConsents(); });

  function renderConsents() {
    var list = document.getElementById('consent-list');
    if (!list) return;
    list.innerHTML = '';
    CONSENT_META.forEach(function(c, i) {
      if (!c.always && !(c.when && c.when())) return;
      var item = document.createElement('div');
      item.className = 'consent-item';
      var body = (consentBodies[c.qid] && consentBodies[c.qid].title) || '<p>Full text available on request — a copy is included with your treatment plan.</p>';
      item.innerHTML =
        '<div class="consent-header" data-i="' + i + '">' +
          '<span class="consent-title">' + c.title + '</span>' +
          '<span class="consent-toggle">+</span>' +
        '</div>' +
        '<div class="consent-body" style="display:none;">' + body + '</div>';
      item.querySelector('.consent-header').addEventListener('click', function() {
        var b = item.querySelector('.consent-body');
        var t = item.querySelector('.consent-toggle');
        var open = b.style.display !== 'none';
        b.style.display = open ? 'none' : 'block';
        t.textContent = open ? '+' : '−';
      });
      list.appendChild(item);
    });
  }
  document.getElementById('consent-agree-all-btn').addEventListener('click', function() {
    answers.doctorNote = (document.getElementById('doctor-note-text').value || '').trim();
    advance(); // → loading → complete
  });
  document.getElementById('doctor-note-toggle').addEventListener('click', function() {
    var w = document.getElementById('doctor-note-wrap');
    w.style.display = (w.style.display === 'none' || !w.style.display) ? 'block' : 'none';
  });

  /* ── Completion ───────────────────────────────────────────────────────── */
  var LOADING_MSGS = ['Reviewing your symptoms…', 'Checking treatment fit…', 'Matching your dose…', 'Preparing your plan…'];
  function startComplete() {
    // re-render consents in case diagnoses changed after fetch
    renderConsents();
    var bar = document.getElementById('loading-bar');
    var status = document.getElementById('loading-status');
    var pct = 0, msgIdx = 0;
    var iv = setInterval(function() {
      pct = Math.min(pct + 4, 92);
      if (bar) bar.style.width = pct + '%';
      if (status && pct % 24 === 0 && msgIdx < LOADING_MSGS.length - 1) status.textContent = LOADING_MSGS[++msgIdx];
    }, 180);

    var clickId = sessionStorage.getItem('crx_cc_custom_cid') || '';
    var affId   = sessionStorage.getItem('crx_aff_id') || '';
    var c1      = sessionStorage.getItem('crx_c1') || '';

    fetch(PROXY_BASE + '/api/v4/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId,
        quizAnswers: answers,
        contactInfo: contact,
        clickId: clickId, affId: affId, c1: c1,
      }),
    }).then(function(r) { return r.json(); }).then(function(data) {
      clearInterval(iv);
      if (!data || !data.ok) {
        console.error('v4 complete failed:', data);
        if (status) status.textContent = 'Something went wrong — please try again in a moment.';
        setTimeout(function() { showStep('consents'); }, 2500);
        return;
      }
      if (bar) bar.style.width = '100%';

      // Hand off to treatment page
      try {
        sessionStorage.setItem('crx_v4_result', JSON.stringify({
          checkoutUrl: data.checkoutUrl, product: data.product, firstName: contact.firstName,
        }));
        var f = data.flags || {};
        sessionStorage.setItem('crx_flags', JSON.stringify({
          adhesiveAllergy:   !!f.adhesiveAllergy,
          nicotineOrClot:    !!(f.nicotine || f.familyClots),
          doseTier:          f.doseTier || 'normal',
          hysterectomy:      !!f.hysterectomy,
          needsProgesterone: f.needsProgesterone !== false,
          progIntolerance:   !!f.progIntolerance,
          vaginalSymptoms:   !!f.vaginalSymptoms,
        }));
        // Treatment page reads step-6 style symptom keys
        var T_KEY = { 'hot-flashes':'hot-flashes', 'night-sweats':'night-sweats', 'trouble-sleeping':'sleep-problems', 'mood-swings':'mood-swings', 'weight-gain':'weight-gain', 'low-libido':'low-libido', 'vaginal-dryness':'vaginal-dryness', 'dry-skin-hair':'dry-skin' };
        var tSyms = [];
        answers.symptoms.forEach(function(s) { if (T_KEY[s]) tSyms.push(T_KEY[s]); if (s === 'dry-skin-hair') tSyms.push('thinning-hair'); });
        sessionStorage.setItem('crx_answers', JSON.stringify({ 'step-6': tSyms.join(',') }));
      } catch (e) {}

      var content = document.getElementById('loading-content');
      var success = document.getElementById('loading-success');
      if (content) content.style.display = 'none';
      if (success) success.style.display = 'block';
      setTimeout(function() { window.location.href = 'treatment-a.html'; }, 1200);
    }).catch(function(e) {
      clearInterval(iv);
      console.error('v4 complete error:', e);
      if (status) status.textContent = 'Connection issue — retrying may help. Taking you back…';
      setTimeout(function() { showStep('consents'); }, 2500);
    });
  }

  /* ── DQ overlay buttons ───────────────────────────────────────────────── */
  document.getElementById('dq-back-btn').addEventListener('click', hideDisqualify);
  document.getElementById('dq-guide-btn').addEventListener('click', function() {
    var email = (document.getElementById('dq-email-input').value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return;
    fetch(PROXY_BASE + '/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, source: 'dq-guide', firstName: 'Guide', lastName: 'Request', phone: '0000000000', state: '', zip: '00000', dob: '' }),
    }).catch(function() {});
    document.getElementById('dq-guide-sent').style.display = 'block';
    document.getElementById('dq-guide-btn').style.display = 'none';
  });

  /* ── Rehydrate UI from restored session ───────────────────────────────── */
  function rehydrateUI() {
    setSelected('symptoms-list', answers.symptoms);
    if (answers.symptoms.length) nextBtnVisible('step-symptoms-next', true);
    showIf('other-symptom-wrap', answers.symptoms.indexOf('other') !== -1);
    if (answers.otherSymptomText) document.getElementById('other-symptom-text').value = answers.otherSymptomText;
    setSelected('diagnoses-list', answers.diagnoses.length ? answers.diagnoses : []);
    if (answers.diagnoses.length) nextBtnVisible('step-diagnoses-next', true);
    setSelected('lifestyle-list', answers.lifestyle.length ? answers.lifestyle : []);
    if (answers.lifestyle.length) nextBtnVisible('step-lifestyle-next', true);
    if (answers.medsText) document.getElementById('meds-text').value = answers.medsText;
    if (answers.takingMeds === 'yes') showIf('meds-detail-wrap', true);
    if (answers.allergyText) document.getElementById('allergy-text').value = answers.allergyText;
    if (answers.allergies === 'yes') showIf('allergy-detail-wrap', true);
    if (contact.state) document.getElementById('state-select').value = contact.state;
    if (contact.dob) document.getElementById('dob-input').value = contact.dob;
    if (contact.firstName) document.getElementById('first-name-input').value = contact.firstName;
    if (contact.lastName) document.getElementById('last-name-input').value = contact.lastName;
    if (contact.email) document.getElementById('email-input').value = contact.email;
    if (contact.phone) document.getElementById('phone-input').value = contact.phone;
  }

  /* ── Boot ─────────────────────────────────────────────────────────────── */
  document.getElementById('quizBackBtn').addEventListener('click', goBack);
  restoreSession();
  showStep(currentStep);

})();
