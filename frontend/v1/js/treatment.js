/* ============================================================
   ClearedRx V1.1 Pre-Approval Page — treatment.js
   ============================================================
   Full overhaul: 15-section layout with timer, chart, match card,
   goals grid, pricing, testimonials, comparison, FAQ.
   Dynamic personalization from quiz answers + clinical flags.
   ============================================================ */
(function() {
  'use strict';

  /* ── Product Catalog ─────────────────────────────────────────── */
  var PRODUCTS = [
    {
      id: 'vcream',
      name: 'Estrogen + Progesterone Vaginal Cream',
      shortName: 'Vaginal Cream',
      subtitle: 'Complete symptom relief, applied once daily',
      soloImage: '../images/vaginal-cream.jpg',
      comboImage: '../images/vaginal-cream.jpg',
      desc: 'Delivers estrogen and progesterone directly where vaginal tissue needs it most, while also providing full systemic hormone support.',
      ingredients: [
        '<strong>Bi-Est (Estradiol + Estriol)</strong> — restores estrogen levels to relieve hot flashes, night sweats, and vaginal dryness',
        '<strong>Micronized Progesterone</strong> — protects the uterine lining, supports sleep, and balances mood',
      ],
      monthly:      { cpid: 163, price: 189 },
      monthlyLow:   { cpid: 161, price: 189 },
      isCompoundedEP: true,
      isVaginalFocused: true,
    },
    {
      id: 'cream',
      name: 'Estrogen + Progesterone Body Cream',
      shortName: 'Body Cream',
      subtitle: 'Compounded cream, applied once daily',
      soloImage: '../images/compounded-cream.jpg',
      comboImage: '../images/compounded-cream.jpg',
      desc: 'Combines estrogen and progesterone in a single daily application. Absorbs quickly with no residue using a medical-grade TopiClick dispenser.',
      ingredients: [
        '<strong>Bi-Est (Estradiol + Estriol)</strong> — restores estrogen levels to relieve hot flashes, night sweats, and mood changes',
        '<strong>Micronized Progesterone</strong> — protects the uterine lining, supports deep sleep and emotional balance',
      ],
      monthly:      { cpid: 73,  price: 189 },
      monthlyLow:   { cpid: 71,  price: 189 },
      isCompoundedEP: true,
      isVaginalFocused: false,
    },
    {
      id: 'gel',
      name: 'Estrogen Gel',
      shortName: 'Estrogen Gel',
      subtitle: 'Clear gel applied to arm or shoulder',
      soloImage: '../images/estradiol-gel.jpg',
      comboImage: '../images/estradiol-gel.jpg',
      desc: 'A clear, fast-absorbing gel applied once daily to your upper arm or shoulder. Dries in under a minute with no residue.',
      ingredients: [
        '<strong>Estradiol</strong> — the primary estrogen your body produces naturally, restores hormonal balance to relieve hot flashes, night sweats, and mood changes',
      ],
      monthly:      { cpid: 47,  price: 151 },
      monthlyLow:   { cpid: 45,  price: 151 },
      isCompoundedEP: false,
      isVaginalFocused: false,
    },
    {
      id: 'patch',
      name: 'Estrogen Patch',
      shortName: 'Estrogen Patch',
      subtitle: 'Worn on skin, changed twice a week',
      soloImage: '../images/estradiol-patch.jpg',
      comboImage: '../images/estradiol-patch.jpg',
      desc: 'A small, discreet patch worn on your lower abdomen or thigh. Delivers steady estradiol 24/7. Changed just twice a week.',
      ingredients: [
        '<strong>Estradiol Transdermal</strong> — delivers a steady dose of estrogen through the skin for consistent 24/7 hormone support',
      ],
      monthly:      { cpid: 53,  price: 139 },
      monthlyLow:   { cpid: 51,  price: 139 },
      isCompoundedEP: false,
      isVaginalFocused: false,
    },
    {
      id: 'pill',
      name: 'Estrogen Pills',
      shortName: 'Estrogen Pills',
      subtitle: 'One small pill taken once daily',
      soloImage: '../images/estradiol-pill.jpg',
      comboImage: '../images/estradiol-pill.jpg',
      desc: 'The simplest possible HRT routine. One small pill taken once daily, just like any other vitamin or medication.',
      ingredients: [
        '<strong>Estradiol Oral</strong> — restores estrogen levels with a convenient once-daily pill to relieve hot flashes, mood changes, and sleep disruption',
      ],
      monthly:      { cpid: 59,  price: 99 },
      monthlyLow:   { cpid: 57,  price: 99 },
      isCompoundedEP: false,
      isVaginalFocused: false,
    },
  ];

  var PROG_ADDON = {
    name: 'Progesterone Pills',
    desc: 'Taken at bedtime to protect the uterine lining and support better sleep and mood.',
    image: '../images/estradiol-pill-solo.jpg',
    ingredient: '<strong>Micronized Progesterone (100mg or 200mg)</strong> — protects the uterine lining, promotes deeper sleep, and supports mood balance',
    monthly:    { cpid: 67,  price: 39 },
    monthlyAlt: { cpid: 69,  price: 39 },
  };

  var VAGINAL_ADDON = {
    name: 'Estrogen Vaginal Tablets',
    desc: 'Targeted relief for vaginal dryness and discomfort.',
    image: '../images/estradiol-pill-solo.jpg',
    ingredient: '<strong>Estradiol Vaginal Tablet</strong> — delivers localized estrogen for vaginal dryness, irritation, and discomfort',
    monthly: { cpid: 65, price: 99 },
  };

  var IMG_TO_ID = {
    'vaginal-cream.jpg':    'vcream',
    'compounded-cream.jpg': 'cream',
    'estradiol-gel.jpg':    'gel',
    'estradiol-patch.jpg':  'patch',
    'estradiol-pill.jpg':   'pill',
  };

  /* ── Symptom mapping ─────────────────────────────────────────── */
  var SYMPTOM_MAP = {
    'hot-flashes':     { label: 'Reduce hot flashes',          icon: '🔥', goalTitle: 'Fewer Hot Flashes',        goalDesc: 'Most women see hot flash frequency drop significantly within the first 2\u20134 weeks of treatment.' },
    'night-sweats':    { label: 'Stop night sweats',           icon: '🌙', goalTitle: 'End Night Sweats',          goalDesc: 'HRT helps regulate your body temperature overnight so you can wake up dry and rested.' },
    'sleep-problems':  { label: 'Sleep through the night',     icon: '😴', goalTitle: 'Deeper, Better Sleep',      goalDesc: 'Progesterone supports natural sleep cycles. Many women report sleeping through the night within weeks.' },
    'mood-anxiety':    { label: 'Stabilize mood & reduce anxiety', icon: '🧠', goalTitle: 'Emotional Balance',    goalDesc: 'Balanced hormones help stabilize mood swings, irritability, and anxiety that menopause can trigger.' },
    'brain-fog':       { label: 'Clear brain fog',             icon: '💡', goalTitle: 'Mental Clarity',            goalDesc: 'Estrogen supports cognitive function. Expect improved focus, memory, and mental sharpness.' },
    'vaginal-dryness': { label: 'Relieve vaginal dryness',     icon: '💧', goalTitle: 'Vaginal Comfort',           goalDesc: 'Targeted estrogen therapy restores vaginal tissue health, relieving dryness and discomfort.' },
    'low-libido':      { label: 'Restore libido',              icon: '❤️', goalTitle: 'Restored Desire',           goalDesc: 'Hormone balance is key to healthy libido. Many women notice renewed interest and arousal.' },
    'fatigue':         { label: 'Boost energy levels',         icon: '⚡', goalTitle: 'Natural Energy',             goalDesc: 'Say goodbye to the 2pm crash. Balanced hormones support sustained energy throughout the day.' },
    'weight-changes':  { label: 'Support healthy weight',      icon: '⚖️', goalTitle: 'Metabolic Support',         goalDesc: 'HRT can help reduce menopause-related weight gain by supporting metabolic function and reducing cravings.' },
  };

  /* Default goals for when no symptoms available */
  var DEFAULT_GOALS = [
    { icon: '🔥', title: 'Fewer Hot Flashes',    desc: 'Most women see hot flash frequency drop significantly within the first 2\u20134 weeks of treatment.' },
    { icon: '😴', title: 'Deeper, Better Sleep',  desc: 'Progesterone supports natural sleep cycles. Many women report sleeping through the night within weeks.' },
    { icon: '🧠', title: 'Emotional Balance',     desc: 'Balanced hormones help stabilize mood swings, irritability, and anxiety that menopause can trigger.' },
    { icon: '⚡', title: 'Natural Energy',         desc: 'Say goodbye to the 2pm crash. Balanced hormones support sustained energy throughout the day.' },
    { icon: '💡', title: 'Mental Clarity',         desc: 'Estrogen supports cognitive function. Expect improved focus, memory, and mental sharpness.' },
    { icon: '❤️', title: 'Restored Desire',        desc: 'Hormone balance is key to healthy libido. Many women notice renewed interest and arousal.' },
  ];

  /* ── Testimonials ────────────────────────────────────────────── */
  var TESTIMONIALS = [
    { name: 'Michaela T.', loc: 'North Carolina', treatment: 'HRT Body Cream', text: 'I was skeptical at first, but within three weeks my hot flashes were cut in half. By month two, I was sleeping through the night again. I feel like I got my life back.', badge: 'Verified Customer' },
    { name: 'Eileen M.',   loc: 'Ohio',           treatment: 'Estrogen Patch + Progesterone', text: 'I had tried everything \u2014 supplements, acupuncture, even meditation apps. Nothing worked until ClearedRx. My mood is stable, I have energy again, and I\u2019m not drenching the sheets every night anymore.', badge: 'Verified Customer' },
    { name: 'Sarah M.',    loc: 'New York',        treatment: 'HRT Vaginal Cream', text: 'Within weeks, the vaginal dryness was gone. I didn\u2019t realize how much it was affecting my confidence and my relationship. This has been a game-changer.', badge: 'Verified Customer' },
    { name: 'Patricia L.', loc: 'California',      treatment: 'Estrogen Gel + Progesterone', text: 'The brain fog was the worst part for me. I couldn\u2019t focus at work, I was forgetting things constantly. Two months on HRT and I feel sharper than I have in years.', badge: 'Verified Customer' },
  ];

  /* ── FAQ ──────────────────────────────────────────────────────── */
  var FAQ_ITEMS = [
    { q: 'Is hormone replacement therapy safe?', a: 'For most healthy women under 60 or within 10 years of menopause, the benefits of HRT outweigh the risks. Modern bioidentical hormones are well-studied and considered safe when prescribed by a licensed doctor who reviews your full health history.' },
    { q: 'How long until I feel results?', a: 'Many women notice improvements in sleep and hot flashes within 2\u20134 weeks. Full benefits \u2014 including mood, energy, and libido \u2014 typically develop over 2\u20133 months as hormone levels stabilize.' },
    { q: 'Do I need to see a doctor in person?', a: 'No. ClearedRx is fully online. A board-certified doctor reviews your health questionnaire and writes your prescription if appropriate. No office visit required.' },
    { q: 'How is my prescription filled?', a: 'Your prescription is sent to a licensed US compounding pharmacy. Your treatment is prepared fresh and shipped directly to your door in discreet packaging within 5\u20137 business days.' },
    { q: 'Can I cancel or change my treatment?', a: 'Yes. Cancel, pause, or change anytime by contacting our support team. No long-term commitments. 30-day money-back guarantee on your first order.' },
    { q: 'What if I have side effects?', a: 'Mild side effects like breast tenderness or spotting can occur in the first few weeks as your body adjusts. These usually resolve on their own. Our care team is available 24/7 if you have concerns.' },
    { q: 'Is this covered by insurance?', a: 'ClearedRx is not billed through insurance, but many patients find our pricing lower than their copays for traditional HRT \u2014 especially with the 50% first-month discount.' },
    { q: 'What happens after I purchase?', a: 'Your card is authorized but not charged. Within 24 hours, a doctor reviews and approves your prescription. Your card is only charged once approved. Your order ships within 1\u20132 business days after that.' },
  ];

  /* ── State ────────────────────────────────────────────────────── */
  var flags = {};
  var selectedId = 'vcream';
  var quizAnswers = {};
  var checkoutBaseUrl = '';
  var serverTotalPrice = 0;
  var checkoutBusy = false;
  var timerSeconds = 1200; // 20 minutes
  var timerInterval = null;

  /* ── Init ─────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function() {
    var raw = sessionStorage.getItem('crx_v1_result');
    if (!raw) { window.location.href = 'index.html'; return; }

    var result;
    try { result = JSON.parse(raw); } catch(e) { window.location.href = 'index.html'; return; }

    checkoutBaseUrl = result.checkoutUrl || '';

    var serverProduct = result.product || {};
    var imgKey = serverProduct.img || '';
    selectedId = IMG_TO_ID[imgKey] || null;
    if (\!selectedId) {
      console.warn('[CRX] IMG_TO_ID miss for "' + imgKey + '" — defaulting to vcream. Check CPID_PRODUCT_MAP img values on server.');
      selectedId = 'vcream';
    }

    // Store server-provided total price as authoritative (Dosable decides pricing)
    serverTotalPrice = (typeof serverProduct.totalPrice === 'number') ? serverProduct.totalPrice : 0;

    try {
      var rawFlags = sessionStorage.getItem('crx_flags');
      if (rawFlags) flags = JSON.parse(rawFlags);
    } catch(e) {}
    flags = Object.assign({
      adhesiveAllergy: false,
      nicotineOrClot: false,
      doseTier: 'normal',
      hysterectomy: false,
      needsProgesterone: true,
      progIntolerance: false,
      vaginalSymptoms: false,
    }, flags);

    // Override local flags with server product data (Dosable is authoritative)
    if (typeof serverProduct.hasProgesterone === 'boolean') {
      flags.needsProgesterone = serverProduct.hasProgesterone;
    }
    if (typeof serverProduct.hasVagAddon === 'boolean') {
      flags.vaginalSymptoms = serverProduct.hasVagAddon;
    }

    try {
      var rawAnswers = sessionStorage.getItem('crx_answers');
      if (rawAnswers) quizAnswers = JSON.parse(rawAnswers);
    } catch(e) {}

    var firstName = result.firstName || sessionStorage.getItem('crx_first_name') || '';
    if (firstName) firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

    // Render all sections
    startTimer();
    renderTimerName(firstName);
    renderHero(firstName);
    renderGoalsList();
    renderChart();
    renderMatchCard();
    renderGoalsGrid();
    renderIncluded();
    renderPricing();
    renderBenefitsBreakdown();
    renderTestimonials();
    renderFaq();
    renderFinalCta(firstName);
    bindCtaButtons();
  });

  /* ── Helpers ──────────────────────────────────────────────────── */
  function getProduct(id) {
    return PRODUCTS.find(function(p) { return p.id === id; }) || PRODUCTS[0];
  }

  function getSelectedSymptoms() {
    var raw = quizAnswers['step-6'] || '';
    if (!raw) return [];
    return raw.split(',').filter(function(s) { return s && SYMPTOM_MAP[s]; });
  }

  function getMonthlyPrice(product) {
    return (flags.doseTier === 'low') ? product.monthlyLow : product.monthly;
  }

  function getProgData() {
    return flags.progIntolerance ? PROG_ADDON.monthlyAlt : PROG_ADDON.monthly;
  }

  function getTotalPrice() {
    // Use server-provided price (Dosable is authoritative)
    if (serverTotalPrice > 0) return serverTotalPrice;
    // Fallback: calculate locally
    var p = getProduct(selectedId);
    var mainPrice = getMonthlyPrice(p).price;
    var progPrice = (flags.needsProgesterone && !p.isCompoundedEP) ? getProgData().price : 0;
    var vagPrice  = (flags.vaginalSymptoms && !p.isVaginalFocused) ? VAGINAL_ADDON.monthly.price : 0;
    return mainPrice + progPrice + vagPrice;
  }

  function getDisplayImage() {
    var p = getProduct(selectedId);
    // For non-compounded products with progesterone, use combo image
    if (flags.needsProgesterone && !p.isCompoundedEP) {
      return p.comboImage;
    }
    return p.soloImage;
  }

  function getDisplayName() {
    var p = getProduct(selectedId);
    if (flags.needsProgesterone && !p.isCompoundedEP) {
      return p.shortName + ' + Progesterone';
    }
    return p.name;
  }

  function svgCheck() {
    return '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';
  }

  /* ── Timer ────────────────────────────────────────────────────── */
  function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(function() {
      timerSeconds--;
      if (timerSeconds <= 0) {
        timerSeconds = 0;
        clearInterval(timerInterval);
      }
      updateTimerDisplay();
    }, 1000);
  }

  function updateTimerDisplay() {
    var m = Math.floor(timerSeconds / 60);
    var s = timerSeconds % 60;
    var display = m + ':' + (s < 10 ? '0' : '') + s;
    ['timer-top', 'timer-mid', 'timer-bottom'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.textContent = display;
    });
  }

  function renderTimerName(firstName) {
    var el = document.getElementById('timer-name-top');
    if (el && firstName) {
      el.textContent = firstName.toUpperCase() + '\u2019S';
    } else if (el) {
      el.textContent = 'YOUR';
    }
  }

  /* ── S1: Hero ────────────────────────────────────────────────── */
  function renderHero(firstName) {
    var symptoms = getSelectedSymptoms();
    var headlineEl = document.getElementById('hero-headline');

    if (headlineEl) {
      var name = firstName ? firstName + ', you\u2019re' : 'You\u2019re';
      headlineEl.innerHTML = name + ' pre-approved for personalized HRT \u2014 <em>here\u2019s your plan.</em>';
    }
  }

  /* ── Goals list (in hero card) ───────────────────────────────── */
  function renderGoalsList() {
    var listEl = document.getElementById('goals-list');
    if (!listEl) return;
    var symptoms = getSelectedSymptoms();
    var goals;

    if (symptoms.length > 0) {
      goals = symptoms.slice(0, 5).map(function(key) {
        return SYMPTOM_MAP[key].label;
      });
    } else {
      goals = ['Reduce hot flashes', 'Sleep through the night', 'Stabilize mood & energy', 'Support hormonal balance'];
    }

    listEl.innerHTML = goals.map(function(g) {
      return '<li>' + svgCheck() + ' ' + g + '</li>';
    }).join('');
  }

  /* ── S2: Effectiveness Chart (multi-line SVG) ────────────────── */
  function renderChart() {
    var wrap = document.getElementById('chart-wrap');
    if (!wrap) return;

    // Multi-line chart showing 4 symptom improvement curves over 12 weeks
    // Font sizes optimized for mobile readability
    wrap.innerHTML =
      '<svg viewBox="0 0 700 310" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">' +
        // Background grid
        '<defs>' +
          '<linearGradient id="bgFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7A9E7E" stop-opacity="0.06"/><stop offset="100%" stop-color="#7A9E7E" stop-opacity="0.01"/></linearGradient>' +
        '</defs>' +
        '<rect x="70" y="20" width="570" height="200" fill="url(#bgFade)" rx="4"/>' +
        // Y-axis labels
        '<text x="62" y="30" text-anchor="end" font-size="22" fill="#6B6B6B" font-family="DM Sans,sans-serif">100%</text>' +
        '<text x="62" y="75" text-anchor="end" font-size="22" fill="#6B6B6B" font-family="DM Sans,sans-serif">75%</text>' +
        '<text x="62" y="120" text-anchor="end" font-size="22" fill="#6B6B6B" font-family="DM Sans,sans-serif">50%</text>' +
        '<text x="62" y="165" text-anchor="end" font-size="22" fill="#6B6B6B" font-family="DM Sans,sans-serif">25%</text>' +
        '<text x="62" y="205" text-anchor="end" font-size="22" fill="#6B6B6B" font-family="DM Sans,sans-serif">0%</text>' +
        // Y-axis title
        '<text x="12" y="120" text-anchor="middle" font-size="18" fill="#6B6B6B" font-family="DM Sans,sans-serif" transform="rotate(-90 15 120)">Improvement</text>' +
        // Grid lines
        '<line x1="70" y1="65" x2="640" y2="65" stroke="#E0D8CF" stroke-width="0.5" stroke-dasharray="4,4"/>' +
        '<line x1="70" y1="110" x2="640" y2="110" stroke="#E0D8CF" stroke-width="0.5" stroke-dasharray="4,4"/>' +
        '<line x1="70" y1="155" x2="640" y2="155" stroke="#E0D8CF" stroke-width="0.5" stroke-dasharray="4,4"/>' +
        // X-axis labels
        '<text x="70" y="260" text-anchor="middle" font-size="22" fill="#6B6B6B" font-family="DM Sans,sans-serif">Start</text>' +
        '<text x="228" y="260" text-anchor="middle" font-size="22" fill="#6B6B6B" font-family="DM Sans,sans-serif">Week 2</text>' +
        '<text x="370" y="260" text-anchor="middle" font-size="22" fill="#6B6B6B" font-family="DM Sans,sans-serif">Week 4</text>' +
        '<text x="510" y="260" text-anchor="middle" font-size="22" fill="#6B6B6B" font-family="DM Sans,sans-serif">Week 8</text>' +
        '<text x="640" y="260" text-anchor="middle" font-size="22" fill="#6B6B6B" font-family="DM Sans,sans-serif">Week 12</text>' +
        // Curve 1: Hot Flashes / Night Sweats (fastest response) — rose
        '<path d="M70,200 C130,185 175,140 228,100 C268,60 310,42 370,35 C440,26 530,24 640,22" fill="none" stroke="#C4826A" stroke-width="2.5" stroke-linecap="round"/>' +
        '<circle cx="640" cy="22" r="4" fill="#C4826A"/>' +
        // Curve 2: Sleep Quality — sage
        '<path d="M70,200 C130,190 175,160 228,130 C268,95 310,65 370,48 C440,34 530,28 640,25" fill="none" stroke="#7A9E7E" stroke-width="2.5" stroke-linecap="round"/>' +
        '<circle cx="640" cy="25" r="4" fill="#7A9E7E"/>' +
        // Curve 3: Mood & Anxiety — forest
        '<path d="M70,200 C130,195 180,180 228,160 C268,125 310,85 370,62 C440,42 530,34 640,30" fill="none" stroke="#2C3E2D" stroke-width="2.5" stroke-linecap="round"/>' +
        '<circle cx="640" cy="30" r="4" fill="#2C3E2D"/>' +
        // Curve 4: Libido / Skin / Energy (slowest) — emerald
        '<path d="M70,200 C130,198 180,192 228,180 C268,155 320,115 370,88 C440,58 530,42 640,35" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round"/>' +
        '<circle cx="640" cy="35" r="4" fill="#059669"/>' +
      '</svg>' +
      // Legend
      '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem 1.25rem;margin-top:.75rem;font-size:.75rem;font-weight:600">' +
        '<span style="display:flex;align-items:center;gap:.3rem"><span style="width:12px;height:3px;background:#C4826A;border-radius:2px;display:inline-block"></span><span style="color:#C4826A">Hot Flashes</span></span>' +
        '<span style="display:flex;align-items:center;gap:.3rem"><span style="width:12px;height:3px;background:#7A9E7E;border-radius:2px;display:inline-block"></span><span style="color:#7A9E7E">Sleep</span></span>' +
        '<span style="display:flex;align-items:center;gap:.3rem"><span style="width:12px;height:3px;background:#2C3E2D;border-radius:2px;display:inline-block"></span><span style="color:#2C3E2D">Mood</span></span>' +
        '<span style="display:flex;align-items:center;gap:.3rem"><span style="width:12px;height:3px;background:#059669;border-radius:2px;display:inline-block"></span><span style="color:#059669">Energy & Libido</span></span>' +
      '</div>';
  }

  /* ── S3: Match Card ──────────────────────────────────────────── */
  function renderMatchCard() {
    var el = document.getElementById('match-card');
    if (!el) return;
    var p = getProduct(selectedId);

    el.innerHTML =
      '<div class="match-card__top">' +
        '<img src="' + getDisplayImage() + '" alt="' + getDisplayName() + '" class="match-card__img">' +
        '<div class="match-card__info">' +
          '<span class="match-card__badge">Your Match</span>' +
          '<div class="match-card__name">' + getDisplayName() + '</div>' +
          '<p class="match-card__desc">' + p.desc + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="match-card__score">' +
        '<div class="match-card__score-text">You have a <strong style="text-decoration:underline">very high chance</strong> of success with this treatment plan.</div>' +
        '<div class="match-card__score-num"><div class="match-card__score-pct">94%</div><div class="match-card__score-label">SUCCESS RATE</div></div>' +
      '</div>';
  }

  /* ── S4: Goals Grid ──────────────────────────────────────────── */
  function renderGoalsGrid() {
    var el = document.getElementById('goals-grid');
    if (!el) return;
    var symptoms = getSelectedSymptoms();
    var goals;

    if (symptoms.length > 0) {
      goals = symptoms.slice(0, 6).map(function(key) {
        var s = SYMPTOM_MAP[key];
        return { icon: s.icon, title: s.goalTitle, desc: s.goalDesc };
      });
    } else {
      goals = DEFAULT_GOALS;
    }

    // Pad to 6 from defaults if fewer
    if (goals.length < 6) {
      for (var di = 0; di < DEFAULT_GOALS.length && goals.length < 6; di++) {
        var next = DEFAULT_GOALS[di];
        var alreadyHas = goals.some(function(g) { return g.title === next.title; });
        if (!alreadyHas) goals.push(next);
      }
    }

    el.innerHTML = goals.map(function(g) {
      return '<div class="goal-row">' +
        '<div class="goal-row__icon" style="background:var(--sage-bg)">' + g.icon + '</div>' +
        '<div><div class="goal-row__title">' + g.title + '</div><div class="goal-row__desc">' + g.desc + '</div></div>' +
      '</div>';
    }).join('');
  }

  /* ── S5: What's Included ─────────────────────────────────────── */
  function renderIncluded() {
    var cardWrap = document.getElementById('included-card-wrap');
    var checksEl = document.getElementById('included-checks');
    if (!cardWrap) return;

    var p = getProduct(selectedId);
    var cards = [];

    // Main product card
    cards.push({
      name: p.name,
      badge: p.isVaginalFocused ? 'Vaginal Application' : (p.isCompoundedEP ? 'Topical Application' : p.subtitle),
      image: p.soloImage,
      ingredients: p.ingredients,
    });

    // Progesterone add-on card
    if (flags.needsProgesterone && !p.isCompoundedEP) {
      cards.push({
        name: PROG_ADDON.name,
        badge: 'Oral \u2014 Taken at Bedtime',
        image: PROG_ADDON.image,
        ingredients: [PROG_ADDON.ingredient],
      });
    }

    // Vaginal add-on card
    if (flags.vaginalSymptoms && !p.isVaginalFocused) {
      cards.push({
        name: VAGINAL_ADDON.name,
        badge: 'Vaginal Tablet',
        image: VAGINAL_ADDON.image,
        ingredients: [VAGINAL_ADDON.ingredient],
      });
    }

    cardWrap.innerHTML = cards.map(function(c) {
      return '<div class="included-card">' +
        '<div class="included-card__product">' +
          '<img src="' + c.image + '" alt="' + c.name + '" class="included-card__product-img">' +
          '<div>' +
            '<div class="included-card__product-name">' + c.name + '</div>' +
            '<span class="included-card__product-badge">' + c.badge + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="included-card__ingredients">' +
          c.ingredients.map(function(ing) {
            return '<div class="included-card__ingredient">' + svgCheck() + ' ' + ing + '</div>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('');

    // Included checks below the cards
    if (checksEl) {
      var checks = [
        'Board-certified doctor review & prescription',
        'Licensed US compounding pharmacy',
        'Free express shipping to your door',
        '24/7 care team support & dosage adjustments',
        '30-day money-back guarantee',
      ];
      checksEl.innerHTML = checks.map(function(c) {
        return '<div class="included-check">' + svgCheck() + ' ' + c + '</div>';
      }).join('');
    }
  }

  /* ── S7: Pricing ─────────────────────────────────────────────── */
  function renderPricing() {
    var el = document.getElementById('pricing-section');
    if (!el) return;
    var p = getProduct(selectedId);
    var totalFull = getTotalPrice();
    var totalDisc = Math.round(totalFull * 0.5);
    var savings = totalFull - totalDisc;

    // Pricing includes list
    var includesList = [
      'Doctor-prescribed bioidentical HRT',
      'Free express shipping',
      '24/7 care team support',
      'Dosage adjustments at no extra cost',
      '30-day money-back guarantee',
    ];

    el.innerHTML =
      // Star rating
      '<div class="pricing__stars">' +
        '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'.repeat(5) +
        '<span>4.9/5 \u2014 2,400+ women treated</span>' +
      '</div>' +
      // Pricing card
      '<div class="pricing__card">' +
        '<img src="' + getDisplayImage() + '" alt="' + getDisplayName() + '" class="pricing__img">' +
        '<div class="pricing__name">' + getDisplayName() + '</div>' +
        '<div class="pricing__rx">Prescription included \u2022 Ships free</div>' +
        '<div class="pricing__price-row">' +
          '<span class="pricing__orig">$' + totalFull + '</span>' +
          '<span class="pricing__disc">$' + totalDisc + '</span>' +
        '</div>' +
        '<div class="pricing__period">one month supply</div>' +
        '<div class="pricing__savings">You save $' + savings + ' today</div>' +
        '<ul class="pricing__includes">' +
          includesList.map(function(item) {
            return '<li>' + svgCheck() + ' ' + item + '</li>';
          }).join('') +
        '</ul>' +
        '<button class="cta-btn" id="cta-pricing">START MY TREATMENT \u2014 50% OFF TODAY</button>' +
        '<p class="cta-note">No commitment \u2022 Cancel anytime \u2022 30-day guarantee</p>' +
      '</div>' +
      '<p style="font-size:.8125rem;color:var(--light);margin-top:1rem">Then $' + totalFull + '/mo. Doctor review included. Cancel anytime.</p>';
  }

  /* ── S9: Price-Anchoring Benefits Breakdown ─────────────── */
  function renderBenefitsBreakdown() {
    var el = document.getElementById('benefits-breakdown');
    if (!el) return;
    var totalFull = getTotalPrice();
    var totalDisc = Math.round(totalFull * 0.5);

    var items = [
      { concern: 'Hot flashes & night sweats', cost: 45 },
      { concern: 'Insomnia & poor sleep', cost: 40 },
      { concern: 'Mood swings, anxiety & low mood', cost: 90 },
      { concern: 'Brain fog & memory', cost: 35 },
      { concern: 'Low libido & sexual discomfort', cost: 50 },
      { concern: 'Vaginal dryness', cost: 55 },
      { concern: 'Weight gain (gym, diet program)', cost: 120 },
      { concern: 'Wrinkles & skin aging', cost: 85 },
      { concern: 'Hair thinning', cost: 45 },
      { concern: 'Fatigue & low energy', cost: 30 },
      { concern: 'Joint pain & stiffness', cost: 40 },
      { concern: 'Bone health supplements', cost: 25 },
    ];
    var separateTotal = 0;
    items.forEach(function(i) { separateTotal += i.cost; });

    el.innerHTML =
      '<p class="benefits-intro">Hormone replacement therapy doesn\u2019t just ease hot flashes \u2014 it can improve sleep, mood, brain fog, weight, skin, libido, and more. Here\u2019s what it typically costs to address each problem separately.</p>' +
      '<div class="benefits-table">' +
        '<div class="benefits-row benefits-header"><span>Symptom or concern</span><span>Typical cost/mo</span></div>' +
        items.map(function(i) {
          return '<div class="benefits-row"><span>' + i.concern + '</span><span>~$' + i.cost + '</span></div>';
        }).join('') +
        '<div class="benefits-row benefits-total"><span>Estimated total if addressed separately</span><span>~$' + separateTotal + '/mo</span></div>' +
        '<div class="benefits-row benefits-crx"><span>Your personalized ClearedRx treatment</span><span class="benefits-crx-price">$' + totalDisc + '/mo</span></div>' +
      '</div>' +
      '<p class="benefits-note">*Individual costs above are estimates. ClearedRx pricing depends on your chosen treatment and refill option.</p>';
  }

  /* ── S8: Testimonials ────────────────────────────────────────── */
  function renderTestimonials() {
    var el = document.getElementById('testimonials');
    if (!el) return;
    el.innerHTML = TESTIMONIALS.map(function(t) {
      return '<div class="testi-card">' +
        '<div class="testi-card__stars">' +
          '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'.repeat(5) +
        '</div>' +
        '<p class="testi-card__text">\u201c' + t.text + '\u201d</p>' +
        '<div class="testi-card__footer">' +
          '<div><span class="testi-card__name">' + t.name + '</span> <span class="testi-card__loc">\u2014 ' + t.loc + '</span></div>' +
          '<span class="testi-card__treatment">' + t.treatment + '</span>' +
        '</div>' +
        '<span class="testi-card__badge">' + t.badge + '</span>' +
      '</div>';
    }).join('');
  }

  /* ── S11: FAQ ────────────────────────────────────────────────── */
  function renderFaq() {
    var el = document.getElementById('faq-list');
    if (!el) return;
    el.innerHTML = FAQ_ITEMS.map(function(item) {
      return '<div class="faq-item">' +
        '<button class="faq-q"><span>' + item.q + '</span><span class="faq-q__toggle">+</span></button>' +
        '<div class="faq-a">' + item.a + '</div>' +
      '</div>';
    }).join('');

    el.querySelectorAll('.faq-q').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var answer = btn.nextElementSibling;
        var isOpen = btn.classList.contains('open');
        // Close all
        el.querySelectorAll('.faq-q').forEach(function(b) { b.classList.remove('open'); });
        el.querySelectorAll('.faq-a').forEach(function(a) { a.classList.remove('open'); });
        if (!isOpen) {
          btn.classList.add('open');
          answer.classList.add('open');
        }
      });
    });
  }

  /* ── S12: Final CTA ──────────────────────────────────────────── */
  function renderFinalCta(firstName) {
    var personalEl = document.getElementById('final-personal');
    if (personalEl && firstName) {
      personalEl.textContent = firstName + ', your pre-approval is waiting. Don\u2019t let it expire.';
    }
  }

  /* ── CTA Buttons ─────────────────────────────────────────────── */
  function bindCtaButtons() {
    var btns = ['cta-pricing', 'cta-final'];
    btns.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', proceedToCheckout);
    });
  }

  function proceedToCheckout() {
    if (checkoutBusy) return;
    checkoutBusy = true;

    document.querySelectorAll('.cta-btn').forEach(function(btn) {
      btn.disabled = true;
      btn.textContent = 'Preparing your checkout\u2026';
    });

    // Fire conversion pixels
    if (typeof fbq === 'function') fbq('track', 'InitiateCheckout');
    if (typeof gtag === 'function') gtag('event', 'begin_checkout');

    // Use the server-provided checkout URL directly.
    // Dosable is the authoritative source for product routing and CPIDs.
    // Do NOT reconstruct CPIDs locally — that risks divergence from Dosable.
    if (\!checkoutBaseUrl) {
      console.error('[CRX] No checkout URL available');
      document.querySelectorAll('.cta-btn').forEach(function(btn) {
        btn.disabled = false;
        btn.textContent = 'START MY TREATMENT \u2014 50% OFF TODAY';
      });
      checkoutBusy = false;
      return;
    }
    console.log('[CRX] Redirecting to Dosable checkout:', checkoutBaseUrl);
    window.location.href = checkoutBaseUrl;
  }

})();
