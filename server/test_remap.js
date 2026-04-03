'use strict';
// Test the remapAnswers function from server.js

const fs = require('fs');
const code = fs.readFileSync(__dirname + '/server.js', 'utf8');

// Extract Q object (lines 108-152) and remapAnswers function (lines 177-453)
const lines = code.split('\n');

// Q object: line 108 to 152 (0-indexed: 107 to 151)
const qCode = lines.slice(107, 152).join('\n');
// remapAnswers: line 177 to 453 (0-indexed: 176 to 452)
const fnCode = lines.slice(176, 453).join('\n');

// Evaluate
eval(qCode);
eval(fnCode);

// Test scenarios
const scenarios = [
  {
    name: 'Default → Patch',
    answers: { 'adhesive-allergy': 'no', 'nicotine-use': 'no', 'step-3': 'less-than-5', 'step-6': 'hot-flashes', 'step-13': 'none', 'step-14': 'none', 'step-21': 'no', 'step-22': 'neither', 'step-24': 'never' },
    product: { type: 'patch', schedule: 'monthly', vaginalAddon: false },
  },
  {
    name: 'Adhesive Allergy → Gel',
    answers: { 'adhesive-allergy': 'yes', 'nicotine-use': 'no', 'step-3': 'less-than-5', 'step-6': 'hot-flashes', 'step-13': 'none', 'step-14': 'none', 'step-21': 'no', 'step-22': 'neither', 'step-24': 'never' },
    product: { type: 'gel', schedule: 'monthly', vaginalAddon: false },
  },
  {
    name: 'Compounded Cream → vcream',
    answers: { 'adhesive-allergy': 'no', 'nicotine-use': 'no', 'step-3': 'less-than-5', 'step-6': 'hot-flashes', 'step-13': 'none', 'step-14': 'none', 'step-21': 'no', 'step-22': 'neither', 'step-24': 'never' },
    product: { type: 'vcream', schedule: 'monthly', vaginalAddon: false },
  },
  {
    name: 'Hysterectomy → No Prog',
    answers: { 'adhesive-allergy': 'no', 'nicotine-use': 'no', 'step-3': 'less-than-5', 'step-6': 'hot-flashes', 'step-13': 'none', 'step-14': 'none', 'step-21': 'yes', 'step-22': 'neither', 'step-24': 'never' },
    product: { type: 'patch', schedule: 'monthly', vaginalAddon: false },
  },
];

for (const s of scenarios) {
  const { apiAnswers, flags } = remapAnswers(s.answers, s.product);
  console.log(`\n=== ${s.name} ===`);
  console.log('flags.adhesiveAllergy:', flags.adhesiveAllergy);
  console.log('flags.hysterectomy:', flags.hysterectomy);
  console.log('flags.needsProgesterone:', flags.needsProgesterone);
  console.log('Q3215 (adhesive_allergy):', JSON.stringify(apiAnswers[3215]));
  console.log('Q3224 (hysterectomy):', JSON.stringify(apiAnswers[3224]));
  console.log('Q3242 (formulation_pref):', JSON.stringify(apiAnswers[3242]));
}
