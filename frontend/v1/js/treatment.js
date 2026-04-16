/* ═══════════════════════════════════════════════════════════════════════════════
   ClearedRx V1 — Treatment Match Page
   Reads the matched product from sessionStorage (set by quiz.js after
   /api/v1/complete returns) and displays a single product card.
   ═══════════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  // Read result from sessionStorage
  var raw = sessionStorage.getItem('crx_v1_result');
  if (\!raw) {
    // No result — redirect back to quiz
    window.location.href = 'index.html';
    return;
  }

  var result;
  try {
    result = JSON.parse(raw);
  } catch(e) {
    window.location.href = 'index.html';
    return;
  }

  var product     = result.product     || {};
  var checkoutUrl = result.checkoutUrl || '';
  var firstName   = result.firstName   || '';

  // ── Populate page ──────────────────────────────────────────────────────────

  // Approval banner with name
  var banner = document.getElementById('approvalBanner');
  if (banner && firstName) {
    banner.textContent = firstName + ', your prescription is pre-approved.';
  }

  // Header with name
  var headerTitle = document.getElementById('headerTitle');
  if (headerTitle && firstName) {
    headerTitle.textContent = firstName + ', Here\u2019s Your Treatment Match';
  }

  // Product image
  var imgEl = document.getElementById('productImg');
  if (imgEl && product.img) {
    imgEl.src = '../images/' + product.img;
    imgEl.alt = product.name || 'Treatment';
  }

  // Product name
  var nameEl = document.getElementById('productName');
  if (nameEl) nameEl.textContent = product.name || 'Your Treatment';

  // Product description
  var descEl = document.getElementById('productDesc');
  if (descEl) descEl.textContent = product.description || '';

  // "Why this treatment" — personalize based on flags
  var whyEl = document.getElementById('productWhy');
  if (whyEl) {
    var whyText = '<strong>Why this treatment?</strong> ';
    var flags = result.flags || {};

    if (product.name && product.name.indexOf('Compound') \!== -1) {
      // Compound cream
      whyText += 'Based on your preference for our compound cream, ';
      if (flags.vaginalSymptoms) {
        whyText += 'and because you reported vaginal symptoms, we\u2019ve matched you with our vaginal formula \u2014 it delivers relief directly where you need it most while providing full systemic hormone support.';
      } else {
        whyText += 'this all-in-one formula combines estrogen and progesterone so there\u2019s nothing extra to take. Applied once daily for complete hormone support.';
      }
    } else if (product.name && product.name.indexOf('Gel') \!== -1) {
      whyText += 'Based on your health profile, a transdermal gel is your best match \u2014 it absorbs quickly, has no adhesive, and delivers steady hormone levels through the skin.';
    } else if (product.name && product.name.indexOf('Patch') \!== -1) {
      whyText += 'Based on your profile, patches are your ideal match \u2014 applied twice weekly for consistent 24/7 hormone delivery with minimal daily effort.';
    } else if (product.name && product.name.indexOf('Pill') \!== -1) {
      whyText += 'Based on your health history, an oral tablet is your best-matched option \u2014 the simplest daily routine with proven results.';
    } else {
      whyText += 'This treatment was selected by our system based on your symptoms, health history, and preferences to give you the best possible outcome.';
    }
    whyEl.innerHTML = whyText;
  }

  // Pricing (50% off first month)
  var totalPrice = product.totalPrice || 0;
  var discountedPrice = Math.round(totalPrice * 50) / 100; // 50% off
  var priceMain = document.getElementById('priceMain');
  var priceWas  = document.getElementById('priceWas');
  if (priceMain) priceMain.textContent = '$' + discountedPrice.toFixed(0);
  if (priceWas)  priceWas.textContent  = '$' + totalPrice;

  // CTA button
  var ctaBtn = document.getElementById('ctaBtn');
  if (ctaBtn && checkoutUrl) {
    ctaBtn.href = checkoutUrl;
    ctaBtn.addEventListener('click', function() {
      // Fire conversion pixel
      if (typeof fbq === 'function') fbq('track', 'InitiateCheckout');
      if (typeof gtag === 'function') gtag('event', 'begin_checkout');
    });
  }

  // Badge text
  var badgeEl = document.getElementById('productBadge');
  if (badgeEl) {
    badgeEl.textContent = 'Matched For You';
  }

})();
