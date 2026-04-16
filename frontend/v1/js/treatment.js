/* ============================================================
   ClearedRx V1 Pre-Approval Page — treatment.js
   ============================================================
   Redesigned pre-approval page. No schedule selector, no add-on
   toggles. Product combo is auto-determined from clinical flags.
   Dynamic personalization from quiz answers.
   ============================================================ */
(function() {
  'use strict';

  /* ── Product Catalog ─────────────────────────────────────────────────────── */
  var PRODUCTS = [
    {
      id: 'vcream',
      name: 'Estrogen + Progesterone Vaginal Cream',
      shortName: 'Vaginal Cream',
      subtitle: 'Complete symptom relief, applied once daily',
      image: '../images/vaginal-cream.jpg',
      desc: 'Delivers estrogen and progesterone directly where vaginal tissue needs it most, while also providing full systemic hormone support.',
      monthly:      { cpid: 163, price: 189 },
      monthlyLow:   { cpid: 161, price: 189 },
      isCompoundedEP:  true,
      isVaginalFocused: true,
    },
    {
      id: 'cream',
      name: 'Estrogen + Progesterone Body Cream',
      shortName: 'Body Cream',
      subtitle: 'Compounded cream, applied once daily',
      image: '../images/compounded-cream.jpg',
      desc: 'Combines estrogen and progesterone in a single daily application using a medical-grade TopiClick dispenser. Absorbs quickly, non-greasy.',
      monthly:      { cpid: 73,  price: 189 },
      monthlyLow:   { cpid: 71,  price: 189 },
      isCompoundedEP:  true,
      isVaginalFocused: false,
    },
    {
      id: 'gel',
      name: 'Estrogen Gel',
      shortName: 'Estrogen Gel',
      subtitle: 'Clear gel applied to arm or shoulder',
      image: '../images/estradiol-gel.jpg',
      desc: 'A clear, fast-absorbing gel applied once daily to your upper arm or shoulder. Dries in under a minute with no residue.',
      monthly:      { cpid: 47,  price: 151 },
      monthlyLow:   { cpid: 45,  price: 151 },
      isCompoundedEP:  false,
      isVaginalFocused: false,
    },
    {
      id: 'patch',
      name: 'Estrogen Patch',
      shortName: 'Estrogen Patch',
      subtitle: 'Worn on skin, changed twice a week',
      image: '../images/estradiol-patch.jpg',
      desc: 'A small, discreet patch worn on your lower abdomen or thigh. Delivers steady estradiol 24/7. Changed just twice a week.',
      monthly:      { cpid: 53,  price: 139 },
      monthlyLow:   { cpid: 51,  price: 139 },
      isCompoundedEP:  false,
      isVaginalFocused: false,
    },
    {
      id: 'pill',
      name: 'Estrogen Pills',
      shortName: 'Estrogen Pills',
      subtitle: 'One small pill taken once daily',
      image: '../images/estradiol-pill.jpg',
      desc: 'The simplest possible HRT routine. One small pill taken once daily, just like any other vitamin or medication.',
      monthly:      { cpid: 59,  price: 99 },
      monthlyLow:   { cpid: 57,  price: 99 },
      isCompoundedEP:  false,
      isVaginalFocused: false,
    },
  ];

  var PROG_ADDON = {
    monthly:    { cpid: 67,  price: 39 },
    monthlyAlt: { cpid: 69,  price: 39 },
  };

  var VAGINAL_ADDON = {
    monthly: { cpid: 65, price: 99 },
  };

  var IMG_TO_ID = {
    'vaginal-cream.jpg':    'vcream',
    'compounded-cream.jpg': 'cream',
    'estradiol-gel.jpg':    'gel',
    'estradiol-patch.jpg':  'patch',
    'estradiol-pill.jpg':   'pill',
  };

  /* ── Symptom mapping for personalization ──────────────────────────────────── */
  var SYMPTOM_MAP = {
    'hot-flashes':     { label: 'Hot Flashes',         tag: 'Hot Flashes',      headline: 'Ending Hot Flashes',             week2: 'Hot flash frequency starts decreasing',     week4: 'Hot flashes significantly reduced',          week8: 'Hot flashes under control' },
    'night-sweats':    { label: 'Night Sweats',        tag: 'Night Sweats',     headline: 'Stopping Night Sweats',           week2: 'Night sweats begin easing',                  week4: 'Night sweats significantly reduced',         week8: 'Restful, uninterrupted sleep' },
    'sleep-problems':  { label: 'Sleep Problems',      tag: 'Better Sleep',     headline: 'Sleeping Through the Night',      week2: 'Sleep quality begins improving',             week4: 'Falling asleep faster, staying asleep',      week8: 'Deep, restorative sleep returns' },
    'mood-anxiety':    { label: 'Mood & Anxiety',      tag: 'Mood Balance',     headline: 'Feeling Like Yourself Again',     week2: 'Mood swings start to stabilize',             week4: 'Emotional balance noticeably better',        week8: 'Calm, steady mood throughout the day' },
    'brain-fog':       { label: 'Brain Fog',           tag: 'Mental Clarity',   headline: 'Clearing the Brain Fog',          week2: 'Mental clarity starts returning',            week4: 'Focus and memory improving',                 week8: 'Sharp, clear thinking restored' },
    'vaginal-dryness': { label: 'Vaginal Dryness',     tag: 'Vaginal Comfort',  headline: 'Restoring Comfort and Intimacy',  week2: 'Vaginal tissue begins responding',           week4: 'Dryness and discomfort easing',              week8: 'Comfort and intimacy restored' },
    'low-libido':      { label: 'Low Libido',          tag: 'Libido',           headline: 'Reigniting Your Desire',          week2: 'Hormone levels begin stabilizing',           week4: 'Interest and desire returning',              week8: 'Healthy libido restored' },
    'fatigue':         { label: 'Fatigue',             tag: 'Energy',           headline: 'Getting Your Energy Back',        week2: 'Energy levels start to lift',                week4: 'Sustained energy throughout the day',        week8: 'Vitality and motivation fully restored' },
    'weight-changes':  { label: 'Weight Changes',      tag: 'Metabolism',       headline: 'Stabilizing Your Metabolism',     week2: 'Metabolism begins to respond',               week4: 'Cravings and bloating reduced',              week8: 'Healthy weight management support' },
  };

  /* ── State ─────────────────────────────────────────────────────────────────── */
  var flags         = {};
  var selectedId    = 'vcream';
  var quizAnswers   = {};
  var checkoutBaseUrl = '';
  var checkoutBusy  = false;

  /* ── FAQ items ─────────────────────────────────────────────────────────────── */
  var FAQ_ITEMS = [
    { q: 'Is hormone replacement therapy safe?', a: 'For most healthy women under 60 or within 10 years of menopause, the benefits of HRT outweigh the risks. Modern bioidentical hormones are well-studied and considered safe when prescribed by a licensed physician who reviews your full health history. Your ClearedRx physician will evaluate your individual situation before prescribing.' },
    { q: 'How long until I feel results?', a: 'Many women notice improvements in sleep and hot flashes within 2\u20134 weeks. Full benefits \u2014 including mood, energy, and libido \u2014 typically develop over 2\u20133 months as hormone levels stabilize. Your physician may adjust your dose over time to optimize your results.' },
    { q: 'Do I need to see a doctor in person?', a: 'No. ClearedRx is a fully online telehealth service. You complete a detailed health questionnaire, and a board-certified physician reviews your information and writes your prescription if appropriate. Everything is handled remotely \u2014 no office visit required.' },
    { q: 'How is my prescription filled?', a: 'Your prescription is sent to a licensed US compounding pharmacy. Your treatment is prepared fresh for your specific prescription and shipped directly to your door in discreet packaging. Most orders arrive within 5\u20137 business days of physician approval.' },
    { q: 'Can I cancel or change my treatment?', a: 'Yes. You can cancel, pause, or request a treatment change at any time by contacting our support team. There are no long-term commitments. If you\'re not satisfied within the first 30 days of your first order, we offer a full money-back guarantee.' },
    { q: 'What if I have side effects?', a: 'Mild side effects such as breast tenderness, bloating, or spotting can occur during the first few weeks as your body adjusts. These usually resolve on their own. If you experience persistent or concerning symptoms, contact our support team and a physician will review your case and adjust your prescription if needed.' },
    { q: 'Is this covered by insurance?', a: 'ClearedRx treatments are not currently billed through insurance. However, many patients find our pricing comparable to or lower than their insurance copays for traditional HRT, especially with our 50% first-month discount.' },
    { q: 'What is bioidentical hormone therapy?', a: 'Bioidentical hormones are chemically identical to the hormones your body naturally produces. They are derived from plant sources and compounded to match your body\'s own estrogen and progesterone. Many women prefer bioidentical HRT because it closely mimics natural hormone activity.' },
    { q: 'What happens after I purchase?', a: 'When you click \u2018Start My Treatment,\u2019 your card is authorized but not charged. Within 24 hours, a board-certified ClearedRx physician reviews your health questionnaire and, if everything looks good, approves and signs your prescription. Your card is only charged once the prescription is approved. Your order is then sent to our licensed US compounding pharmacy, where your treatment is prepared fresh. Once packaged, it ships to you via USPS Priority Mail and typically arrives within 1\u20132 business days of shipment.' },
  ];

  /* ── Init ──────────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function() {
    var raw = sessionStorage.getItem('crx_v1_result');
    if (!raw) { window.location.href = 'index.html'; return; }

    var result;
    try { result = JSON.parse(raw); } catch(e) { window.location.href = 'index.html'; return; }

    checkoutBaseUrl = result.checkoutUrl || '';

    var serverProduct = result.product || {};
    var imgKey = serverProduct.img || '';
    selectedId = IMG_TO_ID[imgKey] || 'vcream';

    // Load flags
    try {
      var rawFlags = sessionStorage.getItem('crx_flags');
      if (rawFlags) flags = JSON.parse(rawFlags);
    } catch(e) {}
    flags = Object.assign({
      adhesiveAllergy:   false,
      nicotineOrClot:    false,
      doseTier:          'normal',
      hysterectomy:      false,
      needsProgesterone: true,
      progIntolerance:   false,
      vaginalSymptoms:   false,
    }, flags);

    // Load quiz answers for personalization
    try {
      var rawAnswers = sessionStorage.getItem('crx_answers');
      if (rawAnswers) quizAnswers = JSON.parse(rawAnswers);
    } catch(e) {}

    var firstName = result.firstName || sessionStorage.getItem('crx_first_name') || '';

    renderPreapprovalBar(firstName);
    renderHero(firstName);
    renderSymptomTags();
    renderTimeline();
    renderPlan();
    renderPricing();
    bindCheckoutButtons();
    initDiscoverAccordion();
    initFaq();
  });

  /* ── Helpers ──────────────────────────────────────────────────────────────── */
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

  /* ── Pre-approval bar ────────────────────────────────────────────────────── */
  function renderPreapprovalBar(firstName) {
    var el = document.getElementById('preapproval-text');
    if (!el) return;
    el.textContent = firstName
      ? firstName + ', your prescription plan is pre-approved'
      : 'Your prescription plan is pre-approved';
  }

  /* ── Hero section ────────────────────────────────────────────────────────── */
  function renderHero(firstName) {
    var symptoms = getSelectedSymptoms();
    var headlineEl = document.getElementById('hero-headline');
    var subEl = document.getElementById('hero-sub');

    if (headlineEl && symptoms.length >= 2) {
      var s1 = SYMPTOM_MAP[symptoms[0]];
      var s2 = SYMPTOM_MAP[symptoms[1]];
      headlineEl.innerHTML = (firstName ? firstName + ', Your' : 'Your') +
        ' Doctor-Matched Plan for ' + s1.headline + ' and ' + s2.headline;
    } else if (headlineEl && symptoms.length === 1) {
      var s = SYMPTOM_MAP[symptoms[0]];
      headlineEl.innerHTML = (firstName ? firstName + ', Your' : 'Your') +
        ' Doctor-Matched Plan for ' + s.headline;
    } else if (headlineEl && firstName) {
      headlineEl.innerHTML = firstName + ', Your Doctor-Matched Treatment Plan';
    }

    if (subEl) {
      subEl.textContent = 'Based on your symptoms and health profile, our physicians have matched you with a treatment plan designed specifically for you.';
    }

    // Also personalize the second CTA headline
    var ctaHeadline = document.getElementById('cta-headline');
    if (ctaHeadline && firstName) {
      ctaHeadline.textContent = firstName + ', Ready to Feel Like Yourself Again?';
    }
  }

  /* ── Symptom tags ────────────────────────────────────────────────────────── */
  function renderSymptomTags() {
    var container = document.getElementById('symptom-tags');
    if (!container) return;
    var symptoms = getSelectedSymptoms();
    if (symptoms.length === 0) { container.style.display = 'none'; return; }

    container.innerHTML = symptoms.map(function(key) {
      var s = SYMPTOM_MAP[key];
      return '<span class="symptom-tag">' + s.tag + '</span>';
    }).join('');
  }

  /* ── Timeline ────────────────────────────────────────────────────────────── */
  function renderTimeline() {
    var graphEl = document.getElementById('timeline-graph');
    var milestonesEl = document.getElementById('timeline-milestones');
    if (!graphEl || !milestonesEl) return;

    var symptoms = getSelectedSymptoms();

    // SVG improvement curve
    graphEl.innerHTML =
      '<svg viewBox="0 0 600 180" xmlns="http://www.w3.org/2000/svg" style="max-width:600px;margin:0 auto;display:block;">' +
        '<defs><linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7A9E7E" stop-opacity="0.3"/><stop offset="100%" stop-color="#7A9E7E" stop-opacity="0.02"/></linearGradient></defs>' +
        '<path d="M30,140 C100,135 150,110 250,70 C350,30 450,18 570,12" fill="none" stroke="#7A9E7E" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M30,140 C100,135 150,110 250,70 C350,30 450,18 570,12 L570,160 L30,160 Z" fill="url(#curveGrad)"/>' +
        '<circle cx="30" cy="140" r="5" fill="#C4826A"/><text x="30" y="165" text-anchor="middle" font-size="11" fill="#6B6B6B" font-family="DM Sans,sans-serif">Today</text>' +
        '<circle cx="175" cy="100" r="5" fill="#7A9E7E"/><text x="175" y="165" text-anchor="middle" font-size="11" fill="#6B6B6B" font-family="DM Sans,sans-serif">Week 2</text>' +
        '<circle cx="340" cy="45" r="5" fill="#7A9E7E"/><text x="340" y="165" text-anchor="middle" font-size="11" fill="#6B6B6B" font-family="DM Sans,sans-serif">Week 4</text>' +
        '<circle cx="570" cy="12" r="6" fill="#059669"/><text x="570" y="165" text-anchor="middle" font-size="11" fill="#6B6B6B" font-family="DM Sans,sans-serif">Week 8</text>' +
        '<text x="48" y="137" font-size="10" fill="#C4826A" font-family="DM Sans,sans-serif" font-weight="600">Symptoms</text>' +
        '<text x="530" y="32" font-size="10" fill="#059669" font-family="DM Sans,sans-serif" font-weight="600">Relief</text>' +
      '</svg>';

    // Build milestones from symptoms or defaults
    var week2Text = 'Sleep quality begins improving, night sweats start to ease';
    var week4Text = 'Hot flash frequency decreases, mood stabilizes';
    var week6Text = 'Energy returns, brain fog clears';
    var week8Text = 'Full relief realized across all symptoms';

    if (symptoms.length >= 1) week2Text = SYMPTOM_MAP[symptoms[0]].week2;
    if (symptoms.length >= 2) week4Text = SYMPTOM_MAP[symptoms[1]].week4;
    if (symptoms.length >= 3) week6Text = SYMPTOM_MAP[symptoms[2]].week4;
    if (symptoms.length >= 1) week8Text = SYMPTOM_MAP[symptoms[0]].week8;

    milestonesEl.innerHTML =
      '<div class="milestone"><div class="milestone__week">Week 1-2</div><div class="milestone__text">' + week2Text + '</div></div>' +
      '<div class="milestone"><div class="milestone__week">Week 2-4</div><div class="milestone__text">' + week4Text + '</div></div>' +
      '<div class="milestone"><div class="milestone__week">Week 4-6</div><div class="milestone__text">' + week6Text + '</div></div>' +
      '<div class="milestone"><div class="milestone__week">Week 6-8</div><div class="milestone__text">' + week8Text + '</div></div>';
  }

  /* ── Plan items (auto-built from product + flags) ────────────────────────── */
  function renderPlan() {
    var container = document.getElementById('plan-items');
    if (!container) return;

    var p = getProduct(selectedId);
    var items = [];

    // Main product
    items.push({
      name: p.name,
      desc: p.desc,
      image: p.image,
      price: getMonthlyPrice(p).price,
    });

    // Auto-add progesterone if needed and product doesn't include it
    if (flags.needsProgesterone && !p.isCompoundedEP) {
      items.push({
        name: 'Progesterone Pills',
        desc: 'Taken at bedtime to protect the uterine lining and support better sleep and mood. Included in your plan.',
        image: '../images/progesterone-pill.jpg',
        price: getProgData().price,
      });
    }

    // Auto-add vaginal tablets if patient has vaginal symptoms and main product isn't vaginal-focused
    if (flags.vaginalSymptoms && !p.isVaginalFocused) {
      items.push({
        name: 'Estrogen Vaginal Tablets',
        desc: 'Targeted relief for vaginal dryness and discomfort. Added based on the symptoms you reported.',
        image: '../images/vaginal-tablet.jpg',
        price: VAGINAL_ADDON.monthly.price,
      });
    }

    container.innerHTML = items.map(function(item) {
      return '<div class="plan-item">' +
        '<img src="' + item.image + '" alt="' + item.name + '" class="plan-item__img" onerror="this.src=\'../images/estradiol-gel.jpg\'">' +
        '<div class="plan-item__info">' +
          '<div class="plan-item__name">' + item.name + '</div>' +
          '<div class="plan-item__desc">' + item.desc + '</div>' +
        '</div>' +
        '<div class="plan-item__price">$' + item.price + '/mo</div>' +
      '</div>';
    }).join('');
  }

  /* ── Pricing block ───────────────────────────────────────────────────────── */
  function renderPricing() {
    var container = document.getElementById('pricing-block');
    if (!container) return;

    var p = getProduct(selectedId);
    var mainPrice = getMonthlyPrice(p).price;
    var progPrice = (flags.needsProgesterone && !p.isCompoundedEP) ? getProgData().price : 0;
    var vagPrice  = (flags.vaginalSymptoms && !p.isVaginalFocused) ? VAGINAL_ADDON.monthly.price : 0;
    var totalFull = mainPrice + progPrice + vagPrice;
    var totalDisc = Math.round(totalFull * 0.5);
    var savings   = totalFull - totalDisc;

    container.innerHTML =
      '<div class="pricing-block__label">Your First Month</div>' +
      '<div class="pricing-block__prices">' +
        '<span class="pricing-block__orig">$' + totalFull + '</span>' +
        '<span class="pricing-block__disc">$' + totalDisc + '</span>' +
        '<span class="pricing-block__period">/mo</span>' +
      '</div>' +
      '<div class="pricing-block__then">Then $' + totalFull + '/mo after &bull; Cancel anytime</div>' +
      '<div class="pricing-block__savings">You save $' + savings + ' this month</div>';
  }

  /* ── Checkout ──────────────────────────────────────────────────────────────── */
  function bindCheckoutButtons() {
    var btn1 = document.getElementById('cta-btn');
    var btn2 = document.getElementById('cta-btn-2');
    if (btn1) btn1.addEventListener('click', proceedToCheckout);
    if (btn2) btn2.addEventListener('click', proceedToCheckout);
  }

  function proceedToCheckout() {
    if (checkoutBusy) return;
    checkoutBusy = true;

    var btns = document.querySelectorAll('.cta-btn');
    btns.forEach(function(btn) { btn.disabled = true; btn.textContent = 'Preparing your checkout\u2026'; });

    // Fire conversion pixels
    if (typeof fbq === 'function') fbq('track', 'InitiateCheckout');
    if (typeof gtag === 'function') gtag('event', 'begin_checkout');

    // Build checkout URL with CPIDs — always monthly
    var p = getProduct(selectedId);
    var priceData = getMonthlyPrice(p);
    var cpids = [priceData.cpid + ':1'];

    // Progesterone for non-compounded
    if (flags.needsProgesterone && !p.isCompoundedEP) {
      cpids.push(getProgData().cpid + ':1');
    }

    // Vaginal add-on if symptoms flagged and not vaginal product
    if (flags.vaginalSymptoms && !p.isVaginalFocused) {
      cpids.push(VAGINAL_ADDON.monthly.cpid + ':1');
    }

    try {
      var url = new URL(checkoutBaseUrl);
      url.searchParams.set('products', cpids.join(';'));
      window.location.href = url.toString();
    } catch(e) {
      console.error('URL parse error, using original checkout URL:', e);
      window.location.href = checkoutBaseUrl;
    }
  }

  /* ── Discover accordion (kept) ─────────────────────────────────────────── */
  function initDiscoverAccordion() {
    var navBtns = document.querySelectorAll('.discover-nav-btn');
    var panels  = document.querySelectorAll('.discover-panel');
    navBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = btn.getAttribute('data-panel');
        navBtns.forEach(function(b) { b.classList.remove('active'); });
        panels.forEach(function(p) { p.classList.remove('active'); });
        btn.classList.add('active');
        var targetPanel = document.getElementById('panel-' + target);
        if (targetPanel) targetPanel.classList.add('active');
      });
    });
  }

  /* ── FAQ (kept) ────────────────────────────────────────────────────────── */
  function initFaq() {
    var list = document.getElementById('faq-list');
    if (!list) return;
    list.innerHTML = FAQ_ITEMS.map(function(item, i) {
      return '<div class="faq-item">' +
        '<button class="faq-btn" data-faq="' + i + '">' +
          '<div class="faq-btn__q">' +
            '<span class="faq-btn__icon">' + (i + 1) + '</span>' +
            '<span class="faq-btn__text">' + item.q + '</span>' +
          '</div>' +
          '<span class="faq-btn__toggle">+</span>' +
        '</button>' +
        '<div class="faq-body" id="faq-body-' + i + '">' + item.a + '</div>' +
      '</div>';
    }).join('');

    list.querySelectorAll('.faq-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx  = btn.getAttribute('data-faq');
        var body = document.getElementById('faq-body-' + idx);
        var open = body.classList.contains('open');
        list.querySelectorAll('.faq-body').forEach(function(b) { b.classList.remove('open'); });
        list.querySelectorAll('.faq-btn').forEach(function(b) { b.classList.remove('open'); });
        if (!open) {
          body.classList.add('open');
          btn.classList.add('open');
        }
      });
    });
  }

})();
