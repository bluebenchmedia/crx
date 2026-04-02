/* ============================================================
   ClearedRx Treatment Selection Page — treatments.js v7
   CPID mappings verified against proxy server.js PRODUCTS catalog.
   ALL products are estrogen-only; progesterone (CPID 35/145) is
   ALWAYS added separately when needsProgesterone=true.
   No product has includesProgesterone — that flag is removed.
   ============================================================ */

(function() {
  'use strict';

  var PROXY_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : '/api-proxy';

  /* ── Product Catalog ─────────────────────────────────────────
   * CPIDs verified against server.js proxy PRODUCTS object.
   *
   * vcream  → E+P Vaginal Cream compound (cpid 119 monthly, 157 quarterly)
   * cream   → E+P Body Cream compound   (cpid 41  monthly, 151 quarterly)
   * gel     → Estrogen Gel              (cpid 15  monthly, 125 quarterly)
   * patch   → Estrogen Patch            (cpid 21  monthly, 131 quarterly)
   * pill    → Estrogen Oral Tablet      (cpid 27  monthly, 137 quarterly)
   *
   * Progesterone 100mg: cpid 35 (monthly), 145 (quarterly)
   * Progesterone 200mg (intolerance): cpid 37 (monthly), 147 (quarterly)
   *
   * Low-dose variants used when doseTier === 'low':
   * vcream low: cpid 117 monthly, 155 quarterly
   * cream low:  cpid 39  monthly, 149 quarterly
   * gel low:    cpid 13  monthly, 123 quarterly
   * patch low:  cpid 19  monthly, 129 quarterly
   * pill low:   cpid 25  monthly, 135 quarterly
   *
   * Order: vcream first (Most Popular, default), cream, gel, patch, pill
   ─────────────────────────────────────────────────────────── */
  var PRODUCTS = {
    vcream: {
      id: 'vcream',
      name: 'Estrogen + Progesterone Vaginal Cream',
      subtitle: 'Targeted vaginal relief + full systemic HRT',
      badge: 'Most Popular',
      badgeColor: 'rose',
      image: 'images/vaginal-cream.jpg',
      benefits: [
        'Relieves vaginal dryness &amp; discomfort directly',
        'Full systemic estrogen + progesterone protection',
        'Reduces painful intercourse and urgency',
        'Helps prevent recurrent UTIs'
      ],
      monthly:      { cpid: 119, price: 189 },
      quarterly:    { cpid: 157, price: 469 },
      monthlyLow:   { cpid: 117, price: 189 },
      quarterlyLow: { cpid: 155, price: 469 },
      vaginalFocused: true,
    },
    cream: {
      id: 'cream',
      name: 'Estrogen + Progesterone Body Cream',
      subtitle: 'Compounded cream, applied once daily',
      badge: 'All-in-One',
      badgeColor: 'rose',
      image: 'images/compounded-cream.jpg',
      benefits: [
        'Estrogen + progesterone in one application',
        'Compounded to your exact prescribed dose',
        'TopiClick&#8482; dispenser — no measuring',
        'No separate progesterone needed'
      ],
      monthly:      { cpid: 41,  price: 189 },
      quarterly:    { cpid: 151, price: 469 },
      monthlyLow:   { cpid: 39,  price: 189 },
      quarterlyLow: { cpid: 149, price: 469 },
      vaginalFocused: false,
    },
    gel: {
      id: 'gel',
      name: 'Estrogen Gel',
      subtitle: 'Applied to arm or shoulder once daily',
      badge: 'Most Flexible',
      badgeColor: 'green',
      image: 'images/estradiol-gel.jpg',
      benefits: [
        'Apply once daily — absorbs in seconds',
        'Easy to dose-adjust with your physician',
        'No adhesive — great for sensitive skin',
        'Discreet and travel-friendly'
      ],
      monthly:          { cpid: 15,  price: 151 },
      quarterly:        { cpid: 125, price: 379 },
      monthlyLow:       { cpid: 13,  price: 151 },
      quarterlyLow:     { cpid: 123, price: 379 },
      requiresNoAdhesiveAllergy: false,
    },
    patch: {
      id: 'patch',
      name: 'Estrogen Patch',
      subtitle: 'Worn on skin, changed twice a week',
      badge: null,
      image: 'images/estradiol-patch.jpg',
      benefits: [
        'Change twice a week — set and forget',
        'Steady hormone delivery 24/7',
        'No daily routine required',
        'Water-resistant and discreet'
      ],
      monthly:          { cpid: 21,  price: 151 },
      quarterly:        { cpid: 131, price: 379 },
      monthlyLow:       { cpid: 19,  price: 151 },
      quarterlyLow:     { cpid: 129, price: 379 },
      requiresNoAdhesiveAllergy: true,
    },
    pill: {
      id: 'pill',
      name: 'Estrogen Pills',
      subtitle: 'One pill, taken once daily',
      badge: 'Simplest Routine',
      badgeColor: 'sage',
      image: 'images/estradiol-pill.jpg',
      benefits: [
        'One pill, once daily — nothing to apply',
        'Familiar, easy-to-follow format',
        'No topical application needed',
        'Progesterone pill prescribed alongside'
      ],
      monthly:      { cpid: 27,  price: 151 },
      quarterly:    { cpid: 137, price: 379 },
      monthlyLow:   { cpid: 25,  price: 151 },
      quarterlyLow: { cpid: 135, price: 379 },
      requiresNoNicotineClot: true,
    },
  };

  /* ── Progesterone add-on CPIDs ───────────────────────────────
   * Added to checkout for ALL products when needsProgesterone=true.
   * vcream and body cream are compounded (E+P in one), so they do NOT
   * need a separate progesterone add-on.
   * gel, patch, and pill are estrogen-only → need separate prog add-on.
   ─────────────────────────────────────────────────────────── */
  var PROG_ADDON = {
    monthly:         { cpid: 35,  price: 39  },
    quarterly:       { cpid: 145, price: 99  },
    monthlyAlt:      { cpid: 37,  price: 49  },   // 200mg for intolerance
    quarterlyAlt:    { cpid: 147, price: 129 },
  };

  /* ── Products that are compounded E+P (no separate prog needed) */
  var COMPOUNDED_EP = { vcream: true, cream: true };

  /* ── Vaginal add-on (optional toggle for gel/patch patients) */
  var VAGINAL_ADDON = {
    monthly:   { cpid: 31,  price: 49  },
    quarterly: { cpid: 141, price: 129 },
  };

  /* ── State ───────────────────────────────────────────────── */
  var flags = {};
  var selectedId = 'vcream';
  var selectedSchedule = 'monthly';
  var vaginalChecked = false;
  var checkoutBusy = false;

  /* ── Init ────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function() {
    try {
      var raw = sessionStorage.getItem('crx_flags');
      if (raw) flags = JSON.parse(raw);
    } catch(e) {}

    flags = Object.assign({
      adhesiveAllergy:        false,
      nicotineOrClot:         false,
      transdermalSideEffects: false,
      blockPatch:             false,
      blockOral:              false,
      blockTransdermal:       false,
      doseTier:               'normal',
      hysterectomy:           false,
      sleepTenderness:        false,
      progIntolerance:        false,
      needsProgesterone:      false,
      vaginalSymptoms:        false,
      deliveryPreference:     'no-preference',
    }, flags);

    // Personalize greeting
    var name = sessionStorage.getItem('crx_first_name') || '';
    var greet = document.getElementById('patient-greeting');
    if (greet) {
      greet.textContent = name
        ? name + ', your prescription is pre-approved.'
        : 'Your prescription is pre-approved.';
    }

    // vcream is ALWAYS the default — most comprehensive treatment
    var eligible = getEligibleIds();
    if (eligible.indexOf('vcream') !== -1) {
      selectedId = 'vcream';
    } else {
      selectedId = eligible[0] || 'gel';
    }

    buildSelector();
    renderPanel();
    bindBack();
  });

  /* ── Eligible treatments ─────────────────────────────────── */
  function getEligibleIds() {
    var list = [];
    for (var key in PRODUCTS) {
      var p = PRODUCTS[key];
      if (p.requiresNoAdhesiveAllergy && flags.adhesiveAllergy) continue;
      if (p.requiresNoNicotineClot    && flags.nicotineOrClot)  continue;
      if (flags.blockTransdermal && (key === 'gel' || key === 'patch')) continue;
      list.push(key);
    }
    if (list.length === 0) list = ['vcream'];
    return list;
  }

  /* ── Build selector cards ────────────────────────────────── */
  function buildSelector() {
    var container = document.getElementById('treatment-selector');
    if (!container) return;
    container.innerHTML = '';
    var eligible = getEligibleIds();

    if (eligible.indexOf(selectedId) === -1) {
      selectedId = eligible.indexOf('vcream') !== -1 ? 'vcream' : eligible[0];
    }

    eligible.forEach(function(key) {
      var p = PRODUCTS[key];
      var isActive = (key === selectedId);

      var badgeHtml = p.badge
        ? '<span class="tx-badge tx-badge--' + (p.badgeColor || 'green') + '">' + p.badge + '</span>'
        : '';

      var checkHtml = isActive
        ? '<div class="tx-check"><svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="9" fill="#2C3E2D"/><path d="M5 9.5L7.5 12L13 6" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
        : '<div class="tx-check tx-check--empty"></div>';

      // Card name: for gel/patch/pill add "+ Progesterone Pills" when needed
      var cardName = p.name;
      if (!COMPOUNDED_EP[key] && flags.needsProgesterone) {
        if (key === 'pill') {
          cardName = 'Estrogen + Progesterone Pills';
        } else {
          cardName = p.name + ' + Progesterone Pills';
        }
      }

      var card = document.createElement('div');
      card.className = 'tx-card' + (isActive ? ' tx-card--active' : '');
      card.dataset.id = key;
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
        selectedId = key;
        vaginalChecked = false;
        buildSelector();
        renderPanel();
      });
      container.appendChild(card);
    });
  }

  /* ── Price helpers ───────────────────────────────────────── */
  function getPriceData(key, schedule) {
    var p = PRODUCTS[key];
    var isLow = (flags.doseTier === 'low');
    if (schedule === 'quarterly') return isLow ? p.quarterlyLow : p.quarterly;
    return isLow ? p.monthlyLow : p.monthly;
  }

  function getProgData(schedule) {
    var isAlt = flags.progIntolerance;
    if (schedule === 'quarterly') return isAlt ? PROG_ADDON.quarterlyAlt : PROG_ADDON.quarterly;
    return isAlt ? PROG_ADDON.monthlyAlt : PROG_ADDON.monthly;
  }

  /* ── Render detail panel ─────────────────────────────────── */
  function renderPanel() {
    var panel = document.getElementById('product-panel');
    if (!panel) return;

    var p         = PRODUCTS[selectedId];
    var priceData = getPriceData(selectedId, selectedSchedule);

    // Determine if this product needs a separate progesterone add-on
    var needsSeparateProg = flags.needsProgesterone && !COMPOUNDED_EP[selectedId];
    var progData = needsSeparateProg ? getProgData(selectedSchedule) : null;

    // Vaginal add-on toggle: only for non-vaginal products when patient has vaginal symptoms
    var showVagAddon = flags.vaginalSymptoms && !p.vaginalFocused;
    var vagAddonData = showVagAddon
      ? (selectedSchedule === 'quarterly' ? VAGINAL_ADDON.quarterly : VAGINAL_ADDON.monthly)
      : null;

    // Benefits HTML
    var benefitsHtml = p.benefits.map(function(b) {
      return '<div class="panel-benefit"><span class="benefit-check">&#10003;</span>' + b + '</div>';
    }).join('');

    // Progesterone row HTML
    var progHtml = '';
    if (progData) {
      progHtml =
        '<div class="addon-row">' +
          '<div class="addon-info">' +
            '<div class="addon-name">+ Progesterone 100mg Pills</div>' +
            '<div class="addon-sub">Required for uterine protection</div>' +
          '</div>' +
          '<div class="addon-price">+$' + progData.price + '/mo</div>' +
        '</div>';
    } else if (COMPOUNDED_EP[selectedId] && flags.needsProgesterone) {
      progHtml =
        '<div class="addon-row addon-row--included">' +
          '<div class="addon-info">' +
            '<div class="addon-name">&#10003; Progesterone Included</div>' +
            '<div class="addon-sub">Compounded together — no separate pill needed</div>' +
          '</div>' +
          '<div class="addon-price addon-price--included">Included</div>' +
        '</div>';
    }

    // Vaginal add-on row HTML
    var vagHtml = '';
    if (showVagAddon) {
      vagHtml =
        '<div class="addon-row addon-row--toggle">' +
          '<label class="addon-toggle-label">' +
            '<input type="checkbox" id="vag-toggle"' + (vaginalChecked ? ' checked' : '') + '>' +
            '<div class="addon-info">' +
              '<div class="addon-name">+ Vaginal Estrogen Cream</div>' +
              '<div class="addon-sub">Optional add-on for vaginal dryness relief</div>' +
            '</div>' +
            '<div class="addon-price">+$' + vagAddonData.price + '/mo</div>' +
          '</label>' +
        '</div>';
    }

    // Pricing
    var mainPrice  = priceData.price;
    var progPrice  = progData  ? progData.price  : 0;
    var vagPrice   = (showVagAddon && vaginalChecked && vagAddonData) ? vagAddonData.price : 0;
    var totalFull  = mainPrice + progPrice + vagPrice;
    var totalDisc  = Math.round(totalFull * 0.5);

    // Quarterly per-month equivalent
    var qData    = getPriceData(selectedId, 'quarterly');
    var qPerMo   = Math.round(qData.price / 3);
    var mPerMo   = getPriceData(selectedId, 'monthly').price;
    var qSave    = mPerMo - qPerMo;

    var scheduleHtml =
      '<div class="sched-wrap">' +
        '<div class="sched-card' + (selectedSchedule === 'monthly' ? ' sched-card--active' : '') + '" data-schedule="monthly">' +
          '<div class="sched-card-name">Monthly Supply</div>' +
          '<div class="sched-price-orig">$' + mPerMo + '/mo</div>' +
          '<div class="sched-price-disc">$' + Math.round(mPerMo * 0.5) + ' first month</div>' +
          '<div class="sched-detail">Billed monthly</div>' +
        '</div>' +
        '<div class="sched-card' + (selectedSchedule === 'quarterly' ? ' sched-card--active' : '') + '" data-schedule="quarterly">' +
          (qSave > 0 ? '<div class="sched-save-badge">Save $' + qSave + '/mo</div>' : '') +
          '<div class="sched-card-name">3-Month Supply</div>' +
          '<div class="sched-price-orig">$' + qPerMo + '/mo</div>' +
          '<div class="sched-price-disc">$' + Math.round(qPerMo * 0.5) + ' first month equiv.</div>' +
          '<div class="sched-detail">$' + qData.price + ' billed every 3 months</div>' +
        '</div>' +
      '</div>';

    panel.innerHTML =
      '<div class="panel-top">' +
        '<div class="panel-img-wrap">' +
          '<img src="' + p.image + '" alt="' + p.name + '" class="panel-img" ' +
               'onerror="this.src=\'images/estradiol-gel.jpg\'">' +
        '</div>' +
        '<div class="panel-info">' +
          '<h2 class="panel-name">' + p.name + '</h2>' +
          '<p class="panel-sub">' + p.subtitle + '</p>' +
          '<div class="panel-benefits">' + benefitsHtml + '</div>' +
        '</div>' +
      '</div>' +
      scheduleHtml +
      '<div class="addons-wrap">' + progHtml + vagHtml + '</div>' +
      '<div class="total-wrap">' +
        '<div class="total-label">Total for your first month:</div>' +
        '<div class="total-prices">' +
          '<span class="total-orig">$' + totalFull + '</span>' +
          '<span class="total-disc" id="total-disc">$' + totalDisc + '</span>' +
        '</div>' +
        '<div class="total-then">Then $' + totalFull + '/mo from month 2 onwards</div>' +
      '</div>' +
      '<button class="checkout-btn" id="checkout-btn">Get My Treatment &rarr;</button>' +
      '<p class="checkout-note">&#128274; Secure checkout &bull; Physician-reviewed &bull; Cancel anytime</p>';

    // Bind schedule card clicks
    panel.querySelectorAll('.sched-card').forEach(function(card) {
      card.addEventListener('click', function() {
        selectedSchedule = card.dataset.schedule;
        renderPanel();
      });
    });

    // Bind vaginal toggle
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

  /* ── Proceed to checkout ─────────────────────────────────── */
  function proceedToCheckout() {
    if (checkoutBusy) return;
    checkoutBusy = true;

    var btn = document.getElementById('checkout-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Preparing your checkout\u2026'; }

    var p         = PRODUCTS[selectedId];
    var priceData = getPriceData(selectedId, selectedSchedule);
    var products  = [{ cpid: priceData.cpid, qty: 1 }];

    // ── Add progesterone if needed ────────────────────────────
    // Compounded E+P products (vcream, cream) already contain progesterone
    // in the compound — no separate CPID needed.
    // All other products (gel, patch, pill) are estrogen-only and require
    // a separate progesterone pill CPID.
    if (flags.needsProgesterone && !COMPOUNDED_EP[selectedId]) {
      var progData = getProgData(selectedSchedule);
      products.push({ cpid: progData.cpid, qty: 1 });
    }

    // ── Add optional vaginal cream add-on ─────────────────────
    if (flags.vaginalSymptoms && vaginalChecked && !p.vaginalFocused) {
      var vagCpid = (selectedSchedule === 'quarterly')
        ? VAGINAL_ADDON.quarterly.cpid
        : VAGINAL_ADDON.monthly.cpid;
      products.push({ cpid: vagCpid, qty: 1 });
    }

    var sessionId = sessionStorage.getItem('crx_session_id') || '';
    var firstName = sessionStorage.getItem('crx_first_name') || '';
    var lastName  = sessionStorage.getItem('crx_last_name')  || '';
    var email     = sessionStorage.getItem('crx_email')      || '';
    var phone     = sessionStorage.getItem('crx_phone')      || '';
    var state     = sessionStorage.getItem('crx_state')      || 'CA';

    function buildUrl(prods, sid) {
      var base = 'https://staging-buy-hrt.clearedrx.com/checkout';
      var ps   = prods.map(function(x) { return x.cpid + ':' + x.qty; }).join(';');
      var q    = 'products=' + ps;
      if (sid)       q += '&cc_custom_created=' + encodeURIComponent(sid);
      if (firstName) q += '&firstName='         + encodeURIComponent(firstName);
      if (lastName)  q += '&lastName='          + encodeURIComponent(lastName);
      if (email)     q += '&emailAddress='      + encodeURIComponent(email);
      if (phone)     q += '&phoneNumber='       + encodeURIComponent(phone);
      if (state)     q += '&shipState='         + encodeURIComponent(state);
      return base + '?' + q;
    }

    if (sessionId) {
      var quizAnswers = {};
      try { quizAnswers = JSON.parse(sessionStorage.getItem('crx_answers') || '{}'); } catch(e) {}
      var flagsToSend = {};
      try { flagsToSend = JSON.parse(sessionStorage.getItem('crx_flags')   || '{}'); } catch(e) {}

      fetch(PROXY_BASE + '/api/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId:   sessionId,
          products:    products,
          quizAnswers: quizAnswers,
          flags:       flagsToSend,
          contactInfo: {
            firstName: firstName,
            lastName:  lastName,
            email:     email,
            phone:     phone,
            state:     state,
          },
        }),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var url = data.checkoutUrl || data.checkout_url || data.url || '';
        window.location.href = url || buildUrl(products, sessionId);
      })
      .catch(function() {
        window.location.href = buildUrl(products, sessionId);
      });
    } else {
      window.location.href = buildUrl(products, '');
    }
  }

  /* ── Back button ─────────────────────────────────────────── */
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
