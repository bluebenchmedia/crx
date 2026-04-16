/* ============================================================
   ClearedRx V1 Treatment Match Page — treatment.js
   ============================================================
   Adapted from v0 treatments.js but for SINGLE matched product.
   No product selector — the server picks the one best product.
   Schedule toggle and vaginal add-on still available.

   The checkout URL is rebuilt client-side from known CPIDs
   because the Dosable session is already completed at this point.
   ============================================================ */
(function() {
  'use strict';

  /* ── Product Catalog (identical to v0) ──────────────────────────────────── */
  var PRODUCTS = [
    {
      id: 'vcream',
      name: 'Estrogen + Progesterone Vaginal Cream',
      subtitle: 'Complete symptom relief, applied once daily',
      image: '../images/vaginal-cream.jpg',
      benefits: [
        'Delivers estrogen and progesterone directly where vaginal tissue needs it most, relieving dryness, irritation, and painful intercourse at the source',
        'Also provides full systemic hormone support for hot flashes, mood, sleep, and bone health',
        'Applied vaginally once daily using a pre-measured applicator &mdash; no pills, patches, or guesswork',
        'Compounded fresh by a licensed US pharmacy to your exact prescribed dose',
        'Progesterone included &mdash; protects the uterine lining and supports better sleep and mood'
      ],
      monthly:      { cpid: 163, price: 189 },
      quarterly:    { cpid: 199, price: 469 },
      monthlyLow:   { cpid: 161, price: 189 },
      quarterlyLow: { cpid: 197, price: 469 },
      isCompoundedEP:  true,
      isVaginalFocused: true,
    },
    {
      id: 'cream',
      name: 'Estrogen + Progesterone Body Cream',
      subtitle: 'Compounded cream, applied once daily',
      image: '../images/compounded-cream.jpg',
      benefits: [
        'Combines estrogen and progesterone in a single daily application &mdash; no separate progesterone pill needed',
        'Applied to clean, dry skin once daily using a medical-grade TopiClick&trade; dispenser that delivers your exact 1g dose every time',
        'Absorbs quickly, non-greasy, and non-comedogenic &mdash; designed for comfortable everyday use',
        'Compounded fresh by a licensed US pharmacy specifically for your prescription',
        'Progesterone included &mdash; protects the uterine lining and supports better sleep and mood'
      ],
      monthly:      { cpid: 73,  price: 189 },
      quarterly:    { cpid: 193, price: 469 },
      monthlyLow:   { cpid: 71,  price: 189 },
      quarterlyLow: { cpid: 191, price: 469 },
      isCompoundedEP:  true,
      isVaginalFocused: false,
    },
    {
      id: 'gel',
      name: 'Estrogen Gel',
      subtitle: 'Gel applied to arm or shoulder, plus a daily progesterone pill',
      image: '../images/estradiol-gel.jpg',
      benefits: [
        'A clear, fast-absorbing gel applied once daily to your upper arm or shoulder &mdash; dries in under a minute with no residue',
        'Delivers estradiol (the primary estrogen your body loses during menopause) through the skin for steady, consistent hormone levels',
        'No adhesive and nothing to swallow &mdash; an ideal option if you have sensitive skin or prefer not to take pills',
        'Easy for your physician to adjust your dose over time as your body responds to treatment',
        'Comes with a daily progesterone pill &mdash; protects the uterine lining and supports better sleep and mood'
      ],
      monthly:      { cpid: 47,  price: 151 },
      quarterly:    { cpid: 169, price: 379 },
      monthlyLow:   { cpid: 45,  price: 151 },
      quarterlyLow: { cpid: 167, price: 379 },
      isCompoundedEP:  false,
      isVaginalFocused: false,
    },
    {
      id: 'patch',
      name: 'Estrogen Patch',
      subtitle: 'Worn on skin, changed twice a week',
      image: '../images/estradiol-patch.jpg',
      benefits: [
        'A small, discreet patch worn on your lower abdomen, buttock, or upper thigh &mdash; changed just twice a week',
        'Delivers a steady, consistent stream of estradiol 24/7 so your hormone levels stay balanced between applications',
        'No daily routine to remember &mdash; apply it and forget about it until your next change day',
        'Water-resistant and designed to stay in place through showers, exercise, and daily life',
        'Comes with a daily progesterone pill &mdash; protects the uterine lining and supports better sleep and mood'
      ],
      monthly:      { cpid: 53,  price: 139 },
      quarterly:    { cpid: 175, price: 379 },
      monthlyLow:   { cpid: 51,  price: 139 },
      quarterlyLow: { cpid: 173, price: 379 },
      isCompoundedEP:  false,
      isVaginalFocused: false,
    },
    {
      id: 'pill',
      name: 'Estrogen Pills',
      subtitle: 'Two small pills taken once daily',
      image: '../images/estradiol-pill.jpg',
      benefits: [
        'One small pill taken once daily &mdash; the simplest possible HRT routine with nothing to apply, stick on, or measure',
        'A familiar format that fits seamlessly into your existing routine, just like any other daily vitamin or medication',
        'Estradiol is absorbed through your digestive system and metabolized by the liver, delivering effective systemic hormone support',
        'Comes with a progesterone pill taken at bedtime &mdash; protects the uterine lining and supports better sleep and mood'
      ],
      monthly:      { cpid: 59,  price: 99 },
      quarterly:    { cpid: 181, price: 269 },
      monthlyLow:   { cpid: 57,  price: 99 },
      quarterlyLow: { cpid: 179, price: 269 },
      isCompoundedEP:  false,
      isVaginalFocused: false,
    },
  ];

  var PROG_ADDON = {
    monthly:      { cpid: 67,  price: 39  },
    quarterly:    { cpid: 187, price: 99  },
    monthlyAlt:   { cpid: 69,  price: 39  },
    quarterlyAlt: { cpid: 189, price: 99  },
  };

  var VAGINAL_ADDON = {
    monthly:   { cpid: 65,  price: 99  },
    quarterly: { cpid: 185, price: 269 },
  };

  /* ── Map server image filename to product ID ──────────────────────────── */
  var IMG_TO_ID = {
    'vaginal-cream.jpg':    'vcream',
    'compounded-cream.jpg': 'cream',
    'estradiol-gel.jpg':    'gel',
    'estradiol-patch.jpg':  'patch',
    'estradiol-pill.jpg':   'pill',
  };

  /* ── State ───────────────────────────────────────────────────────────────── */
  var flags            = {};
  var selectedId       = 'vcream';
  var selectedSchedule = 'monthly';
  var vaginalChecked   = false;
  var checkoutBaseUrl  = '';
  var checkoutBusy     = false;

  /* ── FAQ ─────────────────────────────────────────────────────────────────── */
  var FAQ_ITEMS = [
    { q: 'Is hormone replacement therapy safe?', a: 'For most healthy women under 60 or within 10 years of menopause, the benefits of HRT outweigh the risks. Modern bioidentical hormones are well-studied and considered safe when prescribed by a licensed physician who reviews your full health history. Your ClearedRx physician will evaluate your individual situation before prescribing.' },
    { q: 'How long until I feel results?', a: 'Many women notice improvements in sleep and hot flashes within 2\u20134 weeks. Full benefits \u2014 including mood, energy, and libido \u2014 typically develop over 2\u20133 months as hormone levels stabilize. Your physician may adjust your dose over time to optimize your results.' },
    { q: 'Do I need to see a doctor in person?', a: 'No. ClearedRx is a fully online telehealth service. You complete a detailed health questionnaire, and a board-certified physician reviews your information and writes your prescription if appropriate. Everything is handled remotely \u2014 no office visit required.' },
    { q: 'How is my prescription filled?', a: 'Your prescription is sent to a licensed US compounding pharmacy. Your treatment is prepared fresh for your specific prescription and shipped directly to your door in discreet packaging. Most orders arrive within 5\u20137 business days of physician approval.' },
    { q: 'Can I cancel or change my treatment?', a: 'Yes. You can cancel, pause, or request a treatment change at any time by contacting our support team. There are no long-term commitments. If you\'re not satisfied within the first 30 days of your first order, we offer a full money-back guarantee.' },
    { q: 'What if I have side effects?', a: 'Mild side effects such as breast tenderness, bloating, or spotting can occur during the first few weeks as your body adjusts. These usually resolve on their own. If you experience persistent or concerning symptoms, contact our support team and a physician will review your case and adjust your prescription if needed.' },
    { q: 'Is this covered by insurance?', a: 'ClearedRx treatments are not currently billed through insurance. However, many patients find our pricing comparable to or lower than their insurance copays for traditional HRT, especially with our 50% first-month discount and quarterly supply savings.' },
    { q: 'What is bioidentical hormone therapy?', a: 'Bioidentical hormones are chemically identical to the hormones your body naturally produces. They are derived from plant sources and compounded to match your body\'s own estrogen and progesterone. Many women prefer bioidentical HRT because it closely mimics natural hormone activity.' },
    { q: 'What happens after I purchase?', a: 'When you click \'Get My Treatment,\' your card is authorized but not charged. Within 24 hours, a board-certified ClearedRx physician reviews your health questionnaire and, if everything looks good, approves and signs your prescription. Your card is only charged once the prescription is approved. Your order is then sent to our licensed US compounding pharmacy, where your treatment is prepared fresh to your exact prescribed dose. Once compounded and packaged, it ships to you via USPS Priority Mail and typically arrives within 1\u20132 business days of shipment.' },
  ];

  /* ── Init ────────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function() {
    // Read v1 result from sessionStorage
    var raw = sessionStorage.getItem('crx_v1_result');
    if (!raw) {
      window.location.href = 'index.html';
      return;
    }

    var result;
    try { result = JSON.parse(raw); } catch(e) {
      window.location.href = 'index.html';
      return;
    }

    // Store base checkout URL (has contact info, coupon, etc.)
    checkoutBaseUrl = result.checkoutUrl || '';

    // Map server product to catalog
    var serverProduct = result.product || {};
    var imgKey = serverProduct.img || '';
    selectedId = IMG_TO_ID[imgKey] || 'vcream';

    // Load clinical flags from sessionStorage
    try {
      var rawFlags = sessionStorage.getItem('crx_flags');
      if (rawFlags) flags = JSON.parse(rawFlags);
    } catch(e) {}

    flags = Object.assign({
      adhesiveAllergy:    false,
      nicotineOrClot:     false,
      doseTier:           'normal',
      hysterectomy:       false,
      needsProgesterone:  true,
      progIntolerance:    false,
      vaginalSymptoms:    false,
    }, flags);

    // Personalize greeting
    var firstName = result.firstName || sessionStorage.getItem('crx_first_name') || '';
    var greet = document.getElementById('patient-greeting');
    if (greet) {
      greet.textContent = firstName
        ? firstName + ', your prescription is pre-approved.'
        : 'Your prescription is pre-approved.';
    }

    var matchTitle = document.getElementById('match-title');
    if (matchTitle && firstName) {
      matchTitle.textContent = firstName + ', Here\u2019s Your Personalized Treatment';
    }

    // Pre-check vaginal add-on if patient reported vaginal symptoms
    vaginalChecked = !!flags.vaginalSymptoms;

    renderPanel();
    initDiscoverAccordion();
    initFaq();
  });

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  function getProduct(id) {
    return PRODUCTS.find(function(p) { return p.id === id; }) || PRODUCTS[0];
  }

  function getPanelTitle(p) {
    if (p.isCompoundedEP) return p.name;
    if (!flags.needsProgesterone) return p.name;
    if (p.id === 'pill')  return 'Estrogen + Progesterone Pills';
    if (p.id === 'gel')   return 'Estrogen Gel + Progesterone Pills';
    if (p.id === 'patch') return 'Estrogen Patches + Progesterone Pills';
    return p.name;
  }

  function getPriceData(product, schedule) {
    var isLow = (flags.doseTier === 'low');
    if (schedule === 'quarterly') return isLow ? product.quarterlyLow : product.quarterly;
    return isLow ? product.monthlyLow : product.monthly;
  }

  function getProgData(schedule) {
    var isAlt = !!flags.progIntolerance;
    if (schedule === 'quarterly') return isAlt ? PROG_ADDON.quarterlyAlt : PROG_ADDON.quarterly;
    return isAlt ? PROG_ADDON.monthlyAlt : PROG_ADDON.monthly;
  }

  /* ── Render detail panel ─────────────────────────────────────────────────── */
  function renderPanel() {
    var panel = document.getElementById('product-panel');
    if (!panel) return;

    var p         = getProduct(selectedId);
    var priceData = getPriceData(p, selectedSchedule);

    var needsSeparateProg = flags.needsProgesterone && !p.isCompoundedEP;
    var progData = needsSeparateProg ? getProgData(selectedSchedule) : null;

    var showVagAddon = !p.isVaginalFocused;
    var vagAddonData = showVagAddon
      ? (selectedSchedule === 'quarterly' ? VAGINAL_ADDON.quarterly : VAGINAL_ADDON.monthly)
      : null;

    // Benefits
    var benefitsHtml = p.benefits.map(function(b) {
      return '<div class="panel-benefit"><span class="benefit-check">&#10003;</span>' + b + '</div>';
    }).join('');

    // Vaginal add-on
    var vagHtml = '';
    if (showVagAddon && vagAddonData) {
      var vagNote = flags.vaginalSymptoms
        ? '<div class="addon-recommended">&#10003; Recommended based on your symptoms</div>'
        : '';
      vagHtml =
        '<div class="addon-row addon-row--toggle' + (flags.vaginalSymptoms ? ' addon-row--recommended' : '') + '">' +
          vagNote +
          '<label class="addon-toggle-label">' +
            '<input type="checkbox" id="vag-toggle"' + (vaginalChecked ? ' checked' : '') + '>' +
            '<div class="addon-info">' +
            '<div class="addon-name">+ Estrogen Vaginal Tablets</div>' +
            '<div class="addon-sub">Add-on for vaginal dryness &amp; comfort</div>' +
            '</div>' +
            '<div class="addon-price">+$' + vagAddonData.price + (selectedSchedule === 'quarterly' ? '' : '/mo') + '</div>' +
          '</label>' +
        '</div>';
    }

    // Pricing
    var mainPrice = priceData.price;
    var progPrice = progData ? progData.price : 0;
    var vagPrice  = (showVagAddon && vaginalChecked && vagAddonData) ? vagAddonData.price : 0;
    var totalFull = mainPrice + progPrice + vagPrice;
    var totalDisc = Math.round(totalFull * 0.5);

    // Schedule card prices (include prog cost for non-compounded)
    var mData              = getPriceData(p, 'monthly');
    var qData              = getPriceData(p, 'quarterly');
    var progMonthlyPrice   = needsSeparateProg ? PROG_ADDON.monthly.price   : 0;
    var progQuarterlyPrice = needsSeparateProg ? PROG_ADDON.quarterly.price : 0;
    var schedMonthlyFull   = mData.price + progMonthlyPrice;
    var schedQuarterlyFull = qData.price + progQuarterlyPrice;

    var scheduleHtml =
      '<div class="sched-wrap">' +
        '<div class="sched-card' + (selectedSchedule === 'monthly' ? ' sched-card--active' : '') + '" data-schedule="monthly">' +
          '<div class="sched-card-name">1 Month Supply</div>' +
          '<div class="sched-price-orig">$' + schedMonthlyFull + '</div>' +
          '<div class="sched-price-disc">$' + Math.round(schedMonthlyFull * 0.5) + '</div>' +
          '<div class="sched-detail">Billed monthly</div>' +
        '</div>' +
        '<div class="sched-card' + (selectedSchedule === 'quarterly' ? ' sched-card--active' : '') + '" data-schedule="quarterly">' +
          '<div class="sched-card-name">3 Month Supply</div>' +
          '<div class="sched-price-orig">$' + schedQuarterlyFull + '</div>' +
          '<div class="sched-price-disc">$' + Math.round(schedQuarterlyFull * 0.5) + '</div>' +
          '<div class="sched-detail">Billed every 3 months</div>' +
        '</div>' +
      '</div>';

    // Assemble
    panel.innerHTML =
      '<div class="panel-top">' +
        '<div class="panel-img-wrap">' +
          '<img src="' + p.image + '" alt="' + p.name + '" class="panel-img" ' +
               'onerror="this.src=\'../images/estradiol-gel.jpg\'">' +
        '</div>' +
        '<div class="panel-info">' +
          '<h2 class="panel-name">' + getPanelTitle(p) + '</h2>' +
          '<p class="panel-sub">' + p.subtitle + '</p>' +
          '<div class="panel-benefits">' + benefitsHtml + '</div>' +
        '</div>' +
      '</div>' +
      scheduleHtml +
      '<div class="addons-wrap">' + vagHtml + '</div>' +
      '<div class="total-wrap">' +
        '<div class="total-label">Total:</div>' +
        '<div class="total-prices">' +
          '<span class="total-orig">$' + totalFull + '</span>' +
          '<span class="total-disc" id="total-disc">$' + totalDisc + '</span>' +
        '</div>' +
        (selectedSchedule === 'quarterly'
          ? '<div class="total-then">Then $' + totalFull + ' every 3 months after</div>'
          : '<div class="total-then">Then $' + totalFull + '/mo after</div>') +
      '</div>' +
      '<button class="checkout-btn" id="checkout-btn">Get My Treatment &rarr;</button>' +
      '<p class="checkout-note">Secure checkout &bull; Physician-reviewed &bull; Cancel anytime</p>';

    // Bind schedule cards
    panel.querySelectorAll('.sched-card').forEach(function(card) {
      card.addEventListener('click', function() {
        selectedSchedule = card.dataset.schedule;
        renderPanel();
      });
    });

    // Bind vaginal add-on toggle
    var vagToggle = document.getElementById('vag-toggle');
    if (vagToggle) {
      vagToggle.addEventListener('change', function() {
        vaginalChecked = this.checked;
        renderPanel();
      });
    }

    // Bind checkout
    var checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', proceedToCheckout);
    }
  }

  /* ── Checkout ────────────────────────────────────────────────────────────── */
  function proceedToCheckout() {
    if (checkoutBusy) return;
    checkoutBusy = true;

    var btn = document.getElementById('checkout-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Preparing your checkout\u2026'; }

    // Fire conversion pixels
    if (typeof fbq === 'function') fbq('track', 'InitiateCheckout');
    if (typeof gtag === 'function') gtag('event', 'begin_checkout');

    // Build the correct checkout URL with updated CPIDs based on schedule + add-ons
    var p = getProduct(selectedId);
    var priceData = getPriceData(p, selectedSchedule);
    var cpids = [priceData.cpid + ':1'];

    // Add progesterone for non-compounded products
    if (flags.needsProgesterone && !p.isCompoundedEP) {
      var progData = getProgData(selectedSchedule);
      cpids.push(progData.cpid + ':1');
    }

    // Add vaginal add-on if selected
    if (vaginalChecked && !p.isVaginalFocused) {
      var vagData = selectedSchedule === 'quarterly' ? VAGINAL_ADDON.quarterly : VAGINAL_ADDON.monthly;
      cpids.push(vagData.cpid + ':1');
    }

    try {
      var url = new URL(checkoutBaseUrl);
      url.searchParams.set('products', cpids.join(';'));
      window.location.href = url.toString();
    } catch(e) {
      // Fallback: use original URL if parsing fails
      console.error('URL parse error, using original checkout URL:', e);
      window.location.href = checkoutBaseUrl;
    }
  }

  /* ── Discover accordion ──────────────────────────────────────────────────── */
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

  /* ── FAQ ─────────────────────────────────────────────────────────────────── */
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
