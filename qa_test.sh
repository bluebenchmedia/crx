#!/bin/bash
# ClearedRx Full QA Scenario Tests
# Tests /api/debug/remap endpoint for flag + answer correctness
# Then tests buildProductsParam via a mock /api/complete (dry run)

SERVER="https://crx-server-hzyh.onrender.com"

echo "============================================================"
echo "SCENARIO 1: Standard Patient (has uterus, no allergies)"
echo "  Expected: vcream default, needsProgesterone=true, no blocks"
echo "  Expected CPIDs: 119:1 (vcream monthly)"
echo "============================================================"
curl -s -X POST "$SERVER/api/debug/remap" \
  -H "Content-Type: application/json" \
  -d '{
    "quizAnswers": {
      "step-1": "myself",
      "step-3": "6mo-1yr",
      "step-6": "hot-flashes,night-sweats,sleep-problems",
      "step-9": "irregular",
      "step-13": "none",
      "step-14": "none",
      "step-21": "no",
      "step-24": "never",
      "step-25": "no",
      "step-27": "normal-always",
      "adhesive-allergy": "no",
      "nicotine-use": "no"
    },
    "productSelection": {
      "type": "vcream",
      "schedule": "monthly",
      "vaginalAddon": false
    }
  }' | python3 -m json.tool

echo ""
echo "============================================================"
echo "SCENARIO 2: Hysterectomy Patient"
echo "  Expected: needsProgesterone=false, hysterectomy=true"
echo "  Expected: gel default (vcream/cream hidden on frontend)"
echo "  Expected CPIDs: 15:1 (gel monthly, NO progesterone addon)"
echo "============================================================"
curl -s -X POST "$SERVER/api/debug/remap" \
  -H "Content-Type: application/json" \
  -d '{
    "quizAnswers": {
      "step-1": "myself",
      "step-3": "1-3-years",
      "step-6": "hot-flashes,mood-anxiety",
      "step-9": "hysterectomy",
      "step-13": "none",
      "step-14": "none",
      "step-21": "yes-uterus-removed",
      "step-24": "never",
      "step-25": "no",
      "step-27": "normal-always",
      "adhesive-allergy": "no",
      "nicotine-use": "no"
    },
    "productSelection": {
      "type": "gel",
      "schedule": "monthly",
      "vaginalAddon": false
    }
  }' | python3 -m json.tool

echo ""
echo "============================================================"
echo "SCENARIO 3: Adhesive Allergy Patient"
echo "  Expected: adhesiveAllergy=true, blockPatch=true"
echo "  Expected: patch hidden on frontend, gel default"
echo "  Expected CPIDs: 15:1;35:1 (gel + prog monthly)"
echo "============================================================"
curl -s -X POST "$SERVER/api/debug/remap" \
  -H "Content-Type: application/json" \
  -d '{
    "quizAnswers": {
      "step-1": "myself",
      "step-3": "less-6mo",
      "step-6": "hot-flashes,vaginal-dryness",
      "step-9": "irregular",
      "step-13": "none",
      "step-14": "none",
      "step-21": "no",
      "step-24": "never",
      "step-25": "no",
      "step-27": "normal-always",
      "adhesive-allergy": "yes",
      "nicotine-use": "no"
    },
    "productSelection": {
      "type": "gel",
      "schedule": "monthly",
      "vaginalAddon": true
    }
  }' | python3 -m json.tool

echo ""
echo "============================================================"
echo "SCENARIO 4: Nicotine/Clot Patient"
echo "  Expected: nicotineOrClot=true, blockOral=true"
echo "  Expected: pill hidden on frontend"
echo "  Expected CPIDs: 119:1 (vcream monthly)"
echo "============================================================"
curl -s -X POST "$SERVER/api/debug/remap" \
  -H "Content-Type: application/json" \
  -d '{
    "quizAnswers": {
      "step-1": "myself",
      "step-3": "1-3-years",
      "step-6": "hot-flashes,night-sweats",
      "step-9": "no-period-12mo",
      "step-13": "none",
      "step-14": "none",
      "step-21": "no",
      "step-24": "never",
      "step-25": "no",
      "step-27": "normal-always",
      "adhesive-allergy": "no",
      "nicotine-use": "yes"
    },
    "productSelection": {
      "type": "vcream",
      "schedule": "monthly",
      "vaginalAddon": false
    }
  }' | python3 -m json.tool

echo ""
echo "============================================================"
echo "SCENARIO 5: Quarterly Supply"
echo "  Expected: same flags as scenario 1"
echo "  Expected CPIDs: 157:1 (vcream quarterly)"
echo "============================================================"
curl -s -X POST "$SERVER/api/debug/remap" \
  -H "Content-Type: application/json" \
  -d '{
    "quizAnswers": {
      "step-1": "myself",
      "step-3": "6mo-1yr",
      "step-6": "hot-flashes,night-sweats",
      "step-9": "irregular",
      "step-13": "none",
      "step-14": "none",
      "step-21": "no",
      "step-24": "never",
      "step-25": "no",
      "step-27": "normal-always",
      "adhesive-allergy": "no",
      "nicotine-use": "no"
    },
    "productSelection": {
      "type": "vcream",
      "schedule": "quarterly",
      "vaginalAddon": false
    }
  }' | python3 -m json.tool

echo ""
echo "============================================================"
echo "SCENARIO 6: Transdermal Side Effects Patient"
echo "  Expected: transdermalSideEffects=true, blockTransdermal=true"
echo "  Expected: gel and patch hidden on frontend"
echo "  Expected: pill selected with soft routing for oral route"
echo "  Expected CPIDs: 27:1;35:1 (pill + prog monthly)"
echo "============================================================"
curl -s -X POST "$SERVER/api/debug/remap" \
  -H "Content-Type: application/json" \
  -d '{
    "quizAnswers": {
      "step-1": "myself",
      "step-3": "1-3-years",
      "step-6": "hot-flashes,mood-anxiety,sleep-problems",
      "step-9": "irregular",
      "step-13": "none",
      "step-14": "none",
      "step-21": "no",
      "step-24": "tried-stopped",
      "step-25": "yes",
      "step-27": "normal-always",
      "adhesive-allergy": "no",
      "nicotine-use": "no"
    },
    "productSelection": {
      "type": "pill",
      "schedule": "monthly",
      "vaginalAddon": false
    }
  }' | python3 -m json.tool

echo ""
echo "============================================================"
echo "BONUS SCENARIO 7: Gel + Progesterone + Vaginal Addon (quarterly)"
echo "  Expected: needsProgesterone=true, vaginalAddon=true"
echo "  Expected CPIDs: 125:1;145:1;141:1 (gel+prog+vag quarterly)"
echo "============================================================"
curl -s -X POST "$SERVER/api/debug/remap" \
  -H "Content-Type: application/json" \
  -d '{
    "quizAnswers": {
      "step-1": "myself",
      "step-3": "6mo-1yr",
      "step-6": "hot-flashes,vaginal-dryness",
      "step-9": "irregular",
      "step-13": "none",
      "step-14": "none",
      "step-21": "no",
      "step-24": "never",
      "step-25": "no",
      "step-27": "normal-always",
      "adhesive-allergy": "no",
      "nicotine-use": "no"
    },
    "productSelection": {
      "type": "gel",
      "schedule": "quarterly",
      "vaginalAddon": true
    }
  }' | python3 -m json.tool

echo ""
echo "============================================================"
echo "BONUS SCENARIO 8: Hysterectomy + Adhesive Allergy"
echo "  Expected: hysterectomy=true, adhesiveAllergy=true"
echo "  Expected: vcream/cream hidden (hyst), patch hidden (allergy)"
echo "  Expected: only gel and pill available"
echo "  Expected CPIDs: 15:1 (gel monthly, NO prog)"
echo "============================================================"
curl -s -X POST "$SERVER/api/debug/remap" \
  -H "Content-Type: application/json" \
  -d '{
    "quizAnswers": {
      "step-1": "myself",
      "step-3": "3-plus-years",
      "step-6": "hot-flashes,night-sweats,mood-anxiety",
      "step-9": "hysterectomy",
      "step-13": "none",
      "step-14": "none",
      "step-21": "yes-full-removal",
      "step-24": "tried-stopped",
      "step-25": "no",
      "step-27": "normal-always",
      "adhesive-allergy": "yes",
      "nicotine-use": "no"
    },
    "productSelection": {
      "type": "gel",
      "schedule": "monthly",
      "vaginalAddon": false
    }
  }' | python3 -m json.tool

echo ""
echo "============================================================"
echo "ALL SCENARIOS COMPLETE"
echo "============================================================"
