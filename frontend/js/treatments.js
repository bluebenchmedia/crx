/* ============================================================
   ClearedRx Treatment Selection Page — treatments.js v10
   ============================================================
   KEY DESIGN PRINCIPLES:
   1. The vaginal cream add-on is ALWAYS shown for all products
      (pre-checked + highlighted if vaginalSymptoms=true, unchecked
      but available otherwise). vcream itself never shows the add-on.
   2. vcream is ALWAYS the default selected product.
   3. Checkout calls /api/complete on the server, which remaps
      quiz answers so Dosable natively returns the correct URL.
      We NEVER manually construct or override the products= param.
   4. The URL returned by Dosable is passed through UNTOUCHED.
   5. Hard disqualifiers (adhesiveAllergy, nicotineOrClot) are
      enforced here by hiding ineligible products — they are NEVER
      overridden by the server regardless of treatment selection.

   PRODUCT ORDER (always shown in this order):
   vcream → cream → gel → patch → pill

   PROGESTERONE LOGIC:
   - needsProgesterone = !hysterectomy (everyone with a uterus)
   - vcream and cream are compounded E+P — no separate prog add-on
   - gel, patch, pill are estrogen-only → separate prog add-on shown
   ============================================================ */

(function() {
  'use strict';

  // Same-origin in production; localhost in dev
  var PROXY_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : 'https://crx-server-hzyh.onrender.com';

  /* ── Product Catalog ─────────────────────────────────────────────────────
   * CPIDs verified against server.js PRODUCTS catalog.
   * All prices shown are the regular (non-discounted) price.
   * The 50% first-month discount is applied in the UI display only.
   * ─────────────────────────────────────────────────────────────────────── */
  var PRODUCTS = [
    {
      id: 'vcream',
      name: 'Estrogen + Progesterone Vaginal Cream',
      subtitle: 'Complete symptom relief, applied once daily',
      badge: 'Most Popular',
      badgeColor: 'rose',
      image: 'images/vaginal-cream.jpg',
      benefits: [
        'Delivers estrogen and progesterone directly where vaginal tissue needs it most, relieving dryness, irritation, and painful intercourse at the source',
        'Also provides full systemic hormone support for hot flashes, mood, sleep, and bone health',
        'Applied vaginally once daily using a pre-measured applicator &mdash; no pills, patches, or guesswork',
        'Compounded fresh by a licensed US pharmacy to your exact prescribed dose',
        'Progesterone included &mdash; protects the uterine lining and supports better sleep and mood'
      ],
      monthly:      { cpid: 119, price: 189 },
      quarterly:    { cpid: 157, price: 567 },
      monthlyLow:   { cpid: 117, price: 189 },
      quarterlyLow: { cpid: 155, price: 567 },
      isCompoundedEP:  true,
      isVaginalFocused: true,
      requiresNoAdhesiveAllergy: false,
      requiresNoNicotineClot:    false,
    },
    {
      id: 'cream',
      name: 'Estrogen + Progesterone Body Cream',
      subtitle: 'Compounded cream, applied once daily',
      badge: null,
      badgeColor: null,
      image: 'images/compounded-cream.jpg',
      benefits: [
        'Combines estrogen and progesterone in a single daily application &mdash; no separate progesterone pill needed',
        'Applied to clean, dry skin once daily using a medical-grade TopiClick&trade; dispenser that delivers your exact 1g dose every time',
        'Absorbs quickly, non-greasy, and non-comedogenic &mdash; designed for comfortable everyday use',
        'Compounded fresh by a licensed US pharmacy specifically for your prescription',
        'Progesterone included &mdash; protects the uterine lining and supports better sleep and mood'
      ],
      monthly:      { cpid: 41,  price: 189 },
      quarterly:    { cpid: 151, price: 567 },
      monthlyLow:   { cpid: 39,  price: 189 },
      quarterlyLow: { cpid: 149, price: 567 },
      isCompoundedEP:  true,
      isVaginalFocused: false,
      requiresNoAdhesiveAllergy: false,
      requiresNoNicotineClot:    false,
    },
    {
      id: 'gel',
      name: 'Estrogen Gel',
      subtitle: 'Gel applied to arm or shoulder, plus a daily progesterone pill',
      badge: null,
      badgeColor: null,
      image: 'images/estradiol-gel.jpg',
      benefits: [
        'A clear, fast-absorbing gel applied once daily to your upper arm or shoulder &mdash; dries in under a minute with no residue',
        'Delivers estradiol (the primary estrogen your body loses during menopause) through the skin for steady, consistent hormone levels',
        'No adhesive and nothing to swallow &mdash; an ideal option if you have sensitive skin or prefer not to take pills',
        'Easy for your physician to adjust your dose over time as your body responds to treatment',
        'Comes with a daily progesterone pill &mdash; protects the uterine lining and supports better sleep and mood'
      ],
      monthly:      { cpid: 15,  price: 149 },
      quarterly:    { cpid: 125, price: 447 },
      monthlyLow:   { cpid: 13,  price: 149 },
      quarterlyLow: { cpid: 123, price: 447 },
      isCompoundedEP:  false,
      isVaginalFocused: false,
      requiresNoAdhesiveAllergy: false,
      requiresNoNicotineClot:    false,
    },
    {
      id: 'patch',
      name: 'Estrogen Patch',
      subtitle: 'Worn on skin, changed twice a week',
      badge: null,
      image: 'images/estradiol-patch.jpg',
      benefits: [
        'A small, discreet patch worn on your lower abdomen, buttock, or upper thigh &mdash; changed just twice a week',
        'Delivers a steady, consistent stream of estradiol 24/7 so your hormone levels stay balanced between applications',
        'No daily routine to remember &mdash; apply it and forget about it until your next change day',
        'Water-resistant and designed to stay in place through showers, exercise, and daily life',
        'Comes with a daily progesterone pill &mdash; protects the uterine lining and supports better sleep and mood'
      ],
      monthly:      { cpid: 21,  price: 139 },
      quarterly:    { cpid: 131, price: 417 },
      monthlyLow:   { cpid: 19,  price: 139 },
      quarterlyLow: { cpid: 129, price: 417 },
      isCompoundedEP:  false,
      isVaginalFocused: false,
      requiresNoAdhesiveAllergy: true,   // HARD DISQUALIFIER — never overridden
      requiresNoNicotineClot:    false,
    },
    {
      id: 'pill',
      name: 'Estrogen Pills',
      subtitle: 'Two small pills taken once daily',
      badge: null,
      badgeColor: null,
      image: 'images/estradiol-pill.jpg',
      benefits: [
        'One small pill taken once daily &mdash; the simplest possible HRT routine with nothing to apply, stick on, or measure',
        'A familiar format that fits seamlessly into your existing routine, just like any other daily vitamin or medication',
        'Estradiol is absorbed through your digestive system and metabolized by the liver, delivering effective systemic hormone support',
        'Comes with a progesterone pill taken at bedtime &mdash; protects the uterine lining and supports better sleep and mood'
      ],
      monthly:      { cpid: 27,  price: 99 },
      quarterly:    { cpid: 137, price: 297 },
      monthlyLow:   { cpid: 25,  price: 99 },
      quarterlyLow: { cpid: 135, price: 297 },
      isCompoundedEP:  false,
      isVaginalFocused: false,
      requiresNoAdhesiveAllergy: false,
      requiresNoNicotineClot:    true,   // HARD DISQUALIFIER — never overridden
    },
  ];

  /* ── Progesterone add-on CPIDs ───────────────────────────────────────────
   * Added to checkout for gel/patch/pill when needsProgesterone=true.
   * vcream and cream are compounded E+P — no separate add-on needed.
   * ─────────────────────────────────────────────────────────────────────── */
  var PROG_ADDON = {
    monthly:      { cpid: 35,  price: 39  },
    quarterly:    { cpid: 145, price: 99  },
    monthlyAlt:   { cpid: 37,  price: 49  },   // 200mg for progesterone intolerance
    quarterlyAlt: { cpid: 147, price: 129 },
  };

  /* ── Vaginal add-on ──────────────────────────────────────────────────────
   * Shown for ALL products except vcream (which is already vaginal-focused).
   * Pre-checked if vaginalSymptoms=true; unchecked but available otherwise.
   * ─────────────────────────────────────────────────────────────────────── */
  var VAGINAL_ADDON = {
    monthly:   { cpid: 31,  price: 99  },
    quarterly: { cpid: 141, price: 297 },
  };

  /* ── State ───────────────────────────────────────────────────────────────── */
  var flags = {};
  var selectedId       = 'vcream';
  var selectedSchedule = 'monthly';
  var vaginalChecked   = false;
  var checkoutBusy     = false;

  /* ── Init ────────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function() {
    // Load clinical flags from sessionStorage
    try {
      var raw = sessionStorage.getItem('crx_flags');
      if (raw) flags = JSON.parse(raw);
    } catch(e) {}

    // Apply defaults for any missing flags
    flags = Object.assign({
      adhesiveAllergy:        false,
      nicotineUse:            false,
      nicotineOrClot:         false,
      transdermalSideEffects: false,
      blockPatch:             false,
      blockOral:              false,
      blockTransdermal:       false,
      doseTier:               'normal',
      hysterectomy:           false,
      needsProgesterone:      true,   // default: assume uterus intact
      progIntolerance:        false,
      vaginalSymptoms:        false,
      deliveryPreference:     'no-preference',
    }, flags);

    // Personalize greeting
    var name  = sessionStorage.getItem('crx_first_name') || '';
    var greet = document.getElementById('patient-greeting');
    if (greet) {
      greet.textContent = name
        ? name + ', your prescription is pre-approved.'
        : 'Your prescription is pre-approved.';
    }

    // Pre-check vaginal add-on if patient reported vaginal symptoms
    vaginalChecked = !!flags.vaginalSymptoms;

    // vcream is the default for patients with a uterus; gel for hysterectomy patients
    var eligible = getEligibleProducts();
    if (flags.hysterectomy) {
      // Hysterectomy: default to gel (first non-compounded option)
      selectedId = eligible.some(function(p) { return p.id === 'gel'; }) ? 'gel' : (eligible.length > 0 ? eligible[0].id : 'gel');
    } else if (eligible.some(function(p) { return p.id === 'vcream'; })) {
      selectedId = 'vcream';
    } else {
      selectedId = eligible.length > 0 ? eligible[0].id : 'gel';
    }

    buildSelector();
    renderPanel();
    bindBack();
    initDiscoverAccordion();
    initFaq();
  });

  /* ── Discover accordion (sidebar nav tabs) ────────────────────────────────── */
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

  /* ── FAQ accordion ─────────────────────────────────────────────────────────── */
  var FAQ_ITEMS = [
    {
      q: 'Is hormone replacement therapy safe?',
      a: 'For most healthy women under 60 or within 10 years of menopause, the benefits of HRT outweigh the risks. Modern bioidentical hormones are well-studied and considered safe when prescribed by a licensed physician who reviews your full health history. Your ClearedRx physician will evaluate your individual situation before prescribing.'
    },
    {
      q: 'How long until I feel results?',
      a: 'Many women notice improvements in sleep and hot flashes within 2–4 weeks. Full benefits — including mood, energy, and libido — typically develop over 2–3 months as hormone levels stabilize. Your physician may adjust your dose over time to optimize your results.'
    },
    {
      q: 'Do I need to see a doctor in person?',
      a: 'No. ClearedRx is a fully online telehealth service. You complete a detailed health questionnaire, and a board-certified physician reviews your information and writes your prescription if appropriate. Everything is handled remotely — no office visit required.'
    },
    {
      q: 'How is my prescription filled?',
      a: 'Your prescription is sent to a licensed US compounding pharmacy. Your treatment is prepared fresh for your specific prescription and shipped directly to your door in discreet packaging. Most orders arrive within 5–7 business days of physician approval.'
    },
    {
      q: 'Can I cancel or change my treatment?',
      a: 'Yes. You can cancel, pause, or request a treatment change at any time by contacting our support team. There are no long-term commitments. If you’re not satisfied within the first 30 days of your first order, we offer a full money-back guarantee.'
    },
    {
      q: 'What if I have side effects?',
      a: 'Mild side effects such as breast tenderness, bloating, or spotting can occur during the first few weeks as your body adjusts. These usually resolve on their own. If you experience persistent or concerning symptoms, contact our support team and a physician will review your case and adjust your prescription if needed.'
    },
    {
      q: 'Is this covered by insurance?',
      a: 'ClearedRx treatments are not currently billed through insurance. However, many patients find our pricing comparable to or lower than their insurance copays for traditional HRT, especially with our 50% first-month discount and quarterly supply savings.'
    },
    {
      q: 'What is bioidentical hormone therapy?',
      a: 'Bioidentical hormones are chemically identical to the hormones your body naturally produces. They are derived from plant sources and compounded to match your body\'s own estrogen and progesterone. Many women prefer bioidentical HRT because it closely mimics natural hormone activity.'
    },
    {
      q: 'What happens after I purchase?',
      a: 'When you click \'Get My Treatment,\' your card is authorized but not charged. Within 24 hours, a board-certified ClearedRx physician reviews your health questionnaire and, if everything looks good, approves and signs your prescription. Your card is only charged once the prescription is approved. Your order is then sent to our licensed US compounding pharmacy, where your treatment is prepared fresh to your exact prescribed dose. Once compounded and packaged, it ships to you via USPS Priority Mail and typically arrives within 1–2 business days of shipment.'
    },
  ];

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
        // Close all
        list.querySelectorAll('.faq-body').forEach(function(b) { b.classList.remove('open'); });
        list.querySelectorAll('.faq-btn').forEach(function(b) { b.classList.remove('open'); });
        // Toggle clicked
        if (!open) {
          body.classList.add('open');
          btn.classList.add('open');
        }
      });
    });
  }

  /* ── Get eligible products (respects hard disqualifiers) ─────────────────── */
  function getEligibleProducts() {
    return PRODUCTS.filter(function(p) {
      if (p.requiresNoAdhesiveAllergy && flags.adhesiveAllergy)  return false;
      if (p.requiresNoNicotineClot    && flags.nicotineOrClot)   return false;
      if (flags.blockTransdermal && (p.id === 'gel' || p.id === 'patch')) return false;
      // Compounded E+P products contain progesterone — hide for hysterectomy patients
      if (p.isCompoundedEP && flags.hysterectomy) return false;
      return true;
    });
  }

  /* ── Get product by ID ───────────────────────────────────────────────────── */
  function getProduct(id) {
    return PRODUCTS.find(function(p) { return p.id === id; }) || PRODUCTS[0];
  }

  /* ── Panel title helper ─────────────────────────────────────────────── */
  function getPanelTitle(p) {
    if (p.isCompoundedEP) return p.name; // Already says "Estrogen + Progesterone ..."
    if (!flags.needsProgesterone) return p.name; // Hysterectomy — estrogen only
    // Non-compounded + needs progesterone: show the full pair
    if (p.id === 'pill') return 'Estrogen + Progesterone Pills';
    if (p.id === 'gel')  return 'Estrogen Gel + Progesterone Pills';
    if (p.id === 'patch') return 'Estrogen Patches + Progesterone Pills';
    return p.name;
  }

  /* ── Price helpers ───────────────────────────────────────────────────────── */
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

  /* ── Build selector cards ────────────────────────────────────────────────── */
  function buildSelector() {
    var container = document.getElementById('treatment-selector');
    if (!container) return;
    container.innerHTML = '';

    var eligible = getEligibleProducts();
    if (!eligible.some(function(p) { return p.id === selectedId; })) {
      selectedId = eligible.length > 0 ? eligible[0].id : 'vcream';
    }

    eligible.forEach(function(p) {
      var isActive = (p.id === selectedId);

      // Card display name: append "+ Progesterone Pills" for non-compounded products
      var cardName = p.name;
      if (!p.isCompoundedEP && flags.needsProgesterone) {
        cardName = (p.id === 'pill')
          ? 'Estrogen + Progesterone Pills'
          : p.name + ' + Progesterone Pills';
      }

      var badgeHtml = p.badge
        ? '<span class="tx-badge tx-badge--' + (p.badgeColor || 'green') + '">' + p.badge + '</span>'
        : '';

      var checkHtml = isActive
        ? '<div class="tx-check"><svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="9" fill="#2C3E2D"/><path d="M5 9.5L7.5 12L13 6" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
        : '<div class="tx-check tx-check--empty"></div>';

      var card = document.createElement('div');
      card.className = 'tx-card' + (isActive ? ' tx-card--active' : '');
      card.dataset.id = p.id;
      card.innerHTML =
        '<div class="tx-card-img-wrap">' +
          '<img src="' + p.image + '" alt="' + p.name + '" class="tx-card-img" ' +
               'onerror="this.src=\'images/estradiol-gel.jpg\'">' +
        '</div>' +
        '<div class="tx-card-body">' +
          badgeHtml +
          '<div class="tx-card-name">' + cardName + '</div>' +
          '<div class="tx-card-sub">' + p.subtitle + '</div>' +
        '</div>' +
        checkHtml;

      card.addEventListener('click', function() {
        if (selectedId !== p.id) {
          selectedId = p.id;
          // Reset vaginal add-on to match symptom flag when switching products
          vaginalChecked = !!flags.vaginalSymptoms;
          buildSelector();
          renderPanel();
        }
      });

      container.appendChild(card);
    });
  }

  /* ── Render detail panel ─────────────────────────────────────────────────── */
  function renderPanel() {
    var panel = document.getElementById('product-panel');
    if (!panel) return;

    var p         = getProduct(selectedId);
    var priceData = getPriceData(p, selectedSchedule);

    // Separate progesterone add-on: only for non-compounded products
    var needsSeparateProg = flags.needsProgesterone && !p.isCompoundedEP;
    var progData = needsSeparateProg ? getProgData(selectedSchedule) : null;

    // Vaginal add-on: shown for ALL products except vcream (already vaginal-focused)
    var showVagAddon = !p.isVaginalFocused;
    var vagAddonData = showVagAddon
      ? (selectedSchedule === 'quarterly' ? VAGINAL_ADDON.quarterly : VAGINAL_ADDON.monthly)
      : null;

    // ── Benefits HTML ─────────────────────────────────────────────────────
    var benefitsHtml = p.benefits.map(function(b) {
      return '<div class="panel-benefit"><span class="benefit-check">&#10003;</span>' + b + '</div>';
    }).join('');

    // ── Progesterone row removed ────────────────────────────────────────────────
    // Progesterone pill row removed per design decision — included in product description
    var progHtml = '';

    // ── Vaginal add-on row HTML ───────────────────────────────────────────────
    // Always shown (except for vcream). Pre-checked if vaginalSymptoms=true.
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

    // ── Pricing ───────────────────────────────────────────────────────────
    var mainPrice = priceData.price;
    var progPrice = progData ? progData.price : 0;
    var vagPrice  = (showVagAddon && vaginalChecked && vagAddonData) ? vagAddonData.price : 0;
    var totalFull = mainPrice + progPrice + vagPrice;
    var totalDisc = Math.round(totalFull * 0.5);

    // Quarterly savings
    var qData  = getPriceData(p, 'quarterly');
    var mData  = getPriceData(p, 'monthly');
    var qPerMo = Math.round(qData.price / 3);
    var mPerMo = mData.price;
    var qSave  = mPerMo - qPerMo;

    // ── Schedule cards ────────────────────────────────────────────────────
    // Include progesterone cost in schedule card prices for non-compounded products
    var progMonthlyPrice   = needsSeparateProg ? PROG_ADDON.monthly.price   : 0;
    var progQuarterlyPrice = needsSeparateProg ? PROG_ADDON.quarterly.price : 0;
    var schedMonthlyFull   = mPerMo + progMonthlyPrice;
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

    // ── Assemble panel ────────────────────────────────────────────────────
    panel.innerHTML =
      '<div class="panel-top">' +
        '<div class="panel-img-wrap">' +
          '<img src="' + p.image + '" alt="' + p.name + '" class="panel-img" ' +
               'onerror="this.src=\'images/estradiol-gel.jpg\'">' +
        '</div>' +
        '<div class="panel-info">' +
          '<h2 class="panel-name">' + getPanelTitle(p) + '</h2>' +
          '<p class="panel-sub">' + p.subtitle + '</p>' +
          '<div class="panel-benefits">' + benefitsHtml + '</div>' +
        '</div>' +
      '</div>' +
      scheduleHtml +
      '<div class="addons-wrap">' + progHtml + vagHtml + '</div>' +
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

    // Bind schedule card clicks
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

    // Bind checkout button
    var checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', proceedToCheckout);
    }
  }

  /* ── Proceed to checkout ─────────────────────────────────────────────────── */
  // The server's /api/complete endpoint handles all soft-routing:
  // it takes the selectedProductId + flags and remaps the quiz answers
  // so that Dosable natively returns the correct checkout URL.
  // We pass that URL through UNTOUCHED — we never manipulate products= ourselves.
  function proceedToCheckout() {
    if (checkoutBusy) return;
    checkoutBusy = true;

    var btn = document.getElementById('checkout-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Preparing your checkout\u2026'; }

    var sessionId  = sessionStorage.getItem('crx_session_id')    || '';
    var firstName  = sessionStorage.getItem('crx_first_name')    || '';
    var lastName   = sessionStorage.getItem('crx_last_name')     || '';
    var email      = sessionStorage.getItem('crx_email')         || '';
    var phone      = sessionStorage.getItem('crx_phone')         || '';
    var state      = sessionStorage.getItem('crx_state')         || 'CA';
    var dob        = sessionStorage.getItem('crx_dob')           || '';
    var coupon     = sessionStorage.getItem('crx_coupon')        || '50';
    var customCid  = sessionStorage.getItem('crx_cc_custom_cid') || '';

    var quizAnswers = {};
    var flagsToSend = {};
    try { quizAnswers = JSON.parse(sessionStorage.getItem('crx_answers') || '{}'); } catch(e) {}
    try { flagsToSend = JSON.parse(sessionStorage.getItem('crx_flags')   || '{}'); } catch(e) {}

    // sessionId may be empty if lead capture failed (e.g. 409 conflict) — server will create one
    // Only block if we also have no contact info to create a new session
    if (!sessionId && !email) {
      showCheckoutError(btn, 'Your session has expired. Please retake the quiz to continue.');
      return;
    }

    fetch(PROXY_BASE + '/api/complete', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId:         sessionId,
        selectedProductId: selectedId,
        selectedSchedule:  selectedSchedule,
        vaginalAddon:      vaginalChecked && !getProduct(selectedId).isVaginalFocused,
        quizAnswers:       quizAnswers,
        flags:             flagsToSend,
        clickId:           customCid,
        contactInfo: {
          firstName: firstName,
          lastName:  lastName,
          email:     email,
          phone:     phone,
          state:     state,
          dob:       dob,
        },
      }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        showCheckoutError(btn, data.error || 'Unable to prepare checkout. Please try again.');
      }
    })
    .catch(function(err) {
      console.error('Checkout error:', err);
      showCheckoutError(btn, 'Connection error. Please check your internet and try again.');
    });
  }

  function showCheckoutError(btn, message) {
    checkoutBusy = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Get My Treatment \u2192'; }
    var errEl = document.getElementById('checkout-error');
    if (!errEl) {
      errEl = document.createElement('p');
      errEl.id = 'checkout-error';
      errEl.style.cssText = 'color:#c0392b;font-size:14px;margin-top:8px;text-align:center;';
      var checkoutBtn = document.getElementById('checkout-btn');
      if (checkoutBtn && checkoutBtn.parentNode) {
        checkoutBtn.parentNode.insertBefore(errEl, checkoutBtn.nextSibling);
      }
    }
    errEl.textContent = message;
  }

  /* ── Back button ─────────────────────────────────────────────────────────── */
  function bindBack() {
    var btn = document.getElementById('back-btn');
    if (btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        window.history.back();
      });
    }
  }

})();
