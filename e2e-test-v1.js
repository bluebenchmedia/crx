// E2E Test Script for V1 Quiz Funnel
// Tests all major product routing scenarios through the actual Dosable API

const BASE = 'https://crx-server-hzyh.onrender.com';

// Test personas: different answer combinations that should route to different products
const scenarios = [
  {
    name: 'Standard user — no hysterectomy, no special conditions',
    desc: 'Should get compounded cream or whatever Dosable routes',
    contactInfo: {
      firstName: 'TestStandard', lastName: 'User',
      email: `test.standard.${Date.now()}@test.clearedrx.com`,
      phone: '5551234567', dob: '1975-03-15', state: 'CA'
    },
    quizAnswers: {
      'step-3': '1-3-years',
      'step-6': 'hot-flashes,night-sweats,sleep-problems,mood-anxiety',
      'step-13': '', // no medical conditions
      'step-14': '', // no medications
      'step-18': 'no-allergies',
      'step-19': 'no', // no adhesive allergy
      'step-20': 'no', // no nicotine
      'step-21': 'no', // no hysterectomy
      'step-24': 'never', // never used HRT
    }
  },
  {
    name: 'Hysterectomy user — no progesterone needed',
    desc: 'Should get estrogen-only (gel, patch, or pill), NO progesterone',
    contactInfo: {
      firstName: 'TestHyst', lastName: 'User',
      email: `test.hyst.${Date.now()}@test.clearedrx.com`,
      phone: '5551234568', dob: '1970-06-20', state: 'TX'
    },
    quizAnswers: {
      'step-3': '1-3-years',
      'step-6': 'hot-flashes,mood-anxiety,fatigue',
      'step-13': '',
      'step-14': '',
      'step-18': 'no-allergies',
      'step-19': 'no',
      'step-20': 'no',
      'step-21': 'yes-uterus-removed', // hysterectomy
      'step-21-reason': 'Medical necessity',
      'step-24': 'never',
    }
  },
  {
    name: 'Adhesive allergy user',
    desc: 'Should NOT get patch, likely gel or cream or pill',
    contactInfo: {
      firstName: 'TestAdhesive', lastName: 'User',
      email: `test.adhesive.${Date.now()}@test.clearedrx.com`,
      phone: '5551234569', dob: '1972-09-10', state: 'FL'
    },
    quizAnswers: {
      'step-3': '6mo-1year',
      'step-6': 'hot-flashes,vaginal-dryness,low-libido',
      'step-13': '',
      'step-14': '',
      'step-18': 'no-allergies',
      'step-19': 'yes', // adhesive allergy
      'step-20': 'no',
      'step-21': 'no',
      'step-24': 'never',
    }
  },
  {
    name: 'Long-duration symptoms (3+ years) — low dose tier',
    desc: 'Should get low-dose variant of whatever product',
    contactInfo: {
      firstName: 'TestLongDur', lastName: 'User',
      email: `test.longdur.${Date.now()}@test.clearedrx.com`,
      phone: '5551234570', dob: '1968-01-25', state: 'NY'
    },
    quizAnswers: {
      'step-3': '3-plus-years', // long duration
      'step-6': 'hot-flashes,sleep-problems,brain-fog',
      'step-13': '',
      'step-14': '',
      'step-18': 'no-allergies',
      'step-19': 'no',
      'step-20': 'no',
      'step-21': 'no',
      'step-24': 'never',
    }
  },
  {
    name: 'Vaginal symptoms focus + hysterectomy',
    desc: 'Should get estrogen-only (no prog) but with possible vaginal addon',
    contactInfo: {
      firstName: 'TestVagHyst', lastName: 'User',
      email: `test.vaghyst.${Date.now()}@test.clearedrx.com`,
      phone: '5551234571', dob: '1969-11-05', state: 'OH'
    },
    quizAnswers: {
      'step-3': '1-3-years',
      'step-6': 'vaginal-dryness,low-libido,hot-flashes',
      'step-13': '',
      'step-14': '',
      'step-18': 'no-allergies',
      'step-19': 'no',
      'step-20': 'no',
      'step-21': 'yes-full-removal', // hysterectomy
      'step-21-reason': 'Fibroids',
      'step-24': 'never',
    }
  },
  {
    name: 'Nicotine user — should still qualify',
    desc: 'Nicotine user, honest pass-through to Dosable',
    contactInfo: {
      firstName: 'TestNicotine', lastName: 'User',
      email: `test.nicotine.${Date.now()}@test.clearedrx.com`,
      phone: '5551234572', dob: '1974-04-12', state: 'PA'
    },
    quizAnswers: {
      'step-3': '6mo-1year',
      'step-6': 'hot-flashes,night-sweats,mood-anxiety',
      'step-13': '',
      'step-14': '',
      'step-18': 'no-allergies',
      'step-19': 'no',
      'step-20': 'yes', // nicotine user
      'step-21': 'no',
      'step-24': 'never',
    }
  },
];

async function runTest(scenario) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST: ${scenario.name}`);
  console.log(`DESC: ${scenario.desc}`);
  console.log('='.repeat(70));

  try {
    const res = await fetch(`${BASE}/api/v1/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactInfo: scenario.contactInfo,
        quizAnswers: scenario.quizAnswers,
      }),
    });

    const data = await res.json();

    if (\!data.ok) {
      console.log(`❌ FAILED: ${JSON.stringify(data)}`);
      return { name: scenario.name, pass: false, error: data.error || 'Unknown error' };
    }

    console.log(`✅ Status: OK`);
    console.log(`   Product: ${data.product.name}`);
    console.log(`   Price: $${data.product.totalPrice}`);
    console.log(`   Image: ${data.product.img}`);
    console.log(`   Has Progesterone: ${data.product.hasProgesterone}`);
    console.log(`   Has Vag Addon: ${data.product.hasVagAddon}`);
    console.log(`   Checkout URL: ${data.checkoutUrl}`);

    // Parse products from checkout URL
    const url = new URL(data.checkoutUrl);
    const products = url.searchParams.get('products');
    console.log(`   Checkout Products param: ${products}`);
    const coupon = url.searchParams.get('couponCode');
    console.log(`   Coupon: ${coupon}`);

    // Validate coupon
    if (coupon \!== '50') {
      console.log(`   ⚠️  WARNING: couponCode is not "50"\!`);
    }

    // Validate image is in known set
    const knownImgs = ['vaginal-cream.jpg','compounded-cream.jpg','estradiol-gel.jpg','estradiol-patch.jpg','estradiol-pill.jpg'];
    if (\!knownImgs.includes(data.product.img)) {
      console.log(`   ⚠️  WARNING: Unknown product image "${data.product.img}" — IMG_TO_ID will miss\!`);
    }

    return {
      name: scenario.name,
      pass: true,
      product: data.product.name,
      price: data.product.totalPrice,
      img: data.product.img,
      hasProg: data.product.hasProgesterone,
      hasVag: data.product.hasVagAddon,
      checkoutProducts: products,
    };
  } catch (e) {
    console.log(`❌ ERROR: ${e.message}`);
    return { name: scenario.name, pass: false, error: e.message };
  }
}

async function main() {
  console.log('ClearedRx V1 E2E Test Suite');
  console.log(`Server: ${BASE}`);
  console.log(`Time: ${new Date().toISOString()}`);

  const results = [];
  for (const s of scenarios) {
    const r = await runTest(s);
    results.push(r);
    // Small delay between tests
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  let passed = 0, failed = 0;
  for (const r of results) {
    if (r.pass) {
      passed++;
      console.log(`✅ ${r.name}: ${r.product} ($${r.price}) [prog:${r.hasProg} vag:${r.hasVag}] — products=${r.checkoutProducts}`);
    } else {
      failed++;
      console.log(`❌ ${r.name}: ${r.error}`);
    }
  }
  console.log(`\nTotal: ${passed} passed, ${failed} failed out of ${results.length}`);
}

main().catch(console.error);
