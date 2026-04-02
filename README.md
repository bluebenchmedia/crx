# ClearedRx HRT Funnel

Full-stack HRT intake funnel with quiz, treatment selection, and Dosable API integration.

## Architecture

```
clearedrx-repo/
├── frontend/          # Static HTML/CSS/JS quiz + treatment page
│   ├── index.html     # 32-step quiz funnel
│   ├── treatments.html # Treatment selection + checkout
│   ├── css/
│   │   ├── quiz.css
│   │   └── treatments.css
│   ├── js/
│   │   ├── quiz.js    # Quiz logic, step navigation, clinical flags
│   │   └── treatments.js # Treatment selection, CPID routing, checkout
│   └── images/        # Product images, lifestyle photos, icons
└── server/            # Node.js Express proxy server
    ├── server.js      # Main proxy — Dosable API + ClearedRx checkout
    ├── package.json
    └── package-lock.json
```

## How It Works

1. **Quiz** (`frontend/index.html`) — Patient answers 32 questions. Clinical flags are computed (needsProgesterone, vaginalSymptoms, adhesiveAllergy, nicotineOrClot, etc.) and stored in `sessionStorage`.
2. **Treatment Page** (`frontend/treatments.html`) — Shows eligible treatments based on flags. Vaginal Cream is always pre-selected as the default (Most Popular). Patient selects their preferred treatment + schedule (monthly/quarterly).
3. **Proxy Server** (`server/server.js`) — Receives quiz answers + product selection from the frontend. Calls Dosable API to create/complete the intake session, then returns the checkout URL.
4. **Checkout** — Patient is redirected to `staging-buy-hrt.clearedrx.com` (or production equivalent) with the correct product CPIDs in the URL.

## Environment Variables

Copy `server/.env.example` to `server/.env` and fill in the values:

```
DOSABLE_API_KEY=84b2da8db33ee0ef838728b4b474c3b338e1f131f7f44fab50bf406e79042f68
DOSABLE_BASE_URL=https://staging.intake.dosable.com
DOSABLE_TENANT_ID=32
CHECKOUT_BASE_URL=https://staging-buy-hrt.clearedrx.com/checkout
FRONTEND_URL=http://localhost:3000
PORT=3001
```

> **Note:** Switch `DOSABLE_BASE_URL` and `CHECKOUT_BASE_URL` to production values when going live.

## Local Development

### Run the proxy server
```bash
cd server
npm install
cp .env.example .env   # fill in your values
npm start
# Server runs on http://localhost:3001
```

### Serve the frontend
Any static file server works. With Python:
```bash
cd frontend
python3 -m http.server 3000
# Open http://localhost:3000
```

Or with Node:
```bash
npx serve frontend -p 3000
```

### Update the API base URL in the frontend
In `frontend/js/quiz.js` and `frontend/js/treatments.js`, the proxy URL is set to:
```js
const API_BASE = 'http://localhost:3001';
```
Change this to your deployed Render URL for production.

## Render Deployment

### Proxy Server (Web Service)
- **Root directory:** `server`
- **Build command:** `npm install`
- **Start command:** `node server.js`
- **Environment variables:** Set all vars from `.env.example` in the Render dashboard

### Frontend (Static Site)
- **Root directory:** `frontend`
- **Build command:** *(none — pure static)*
- **Publish directory:** `frontend`

Or serve the frontend from the same Node server by adding Express static middleware (see `server/server.js` — there's a commented section for this).

## Key Files

| File | Purpose |
|------|---------|
| `server/server.js` | Main proxy — all Dosable API calls, answer remapping, checkout URL construction |
| `frontend/js/quiz.js` | Quiz step navigation, clinical flag computation, consent flow |
| `frontend/js/treatments.js` | Treatment card rendering, CPID mapping, checkout button |

## Dosable API

- **Tenant ID:** 32
- **Staging:** `https://staging.intake.dosable.com`
- **API Key:** Set in environment variable `DOSABLE_API_KEY`
- **Key endpoints used:**
  - `POST /leads/` — Create patient lead
  - `POST /sessions/` — Create intake session
  - `PUT /sessions/{id}` — Bulk save quiz answers
  - `POST /sessions/{id}/complete` — Complete session, get checkout URL

## Product CPID Reference

| Treatment | Monthly CPID | Quarterly CPID | Notes |
|-----------|-------------|----------------|-------|
| Vaginal Cream (E+P compounded) | 119 | 157 | Always shown, default selection |
| Body Cream (E+P compounded) | 41 | 151 | |
| Estrogen Gel | 15 | 125 | + Prog 35/145 if needsProgesterone |
| Estrogen Patch | 21 | 131 | + Prog 35/145 if needsProgesterone; hidden if adhesiveAllergy |
| Estrogen Pill | 27 | 137 | + Prog 35/145 if needsProgesterone; hidden if nicotineOrClot |
| Progesterone 100mg | 35 | 145 | Add-on for gel/patch/pill when uterus intact |

## Clinical Flag Logic

Flags are computed in `frontend/js/quiz.js` → `computeClinicalFlags()`:

| Flag | Trigger | Effect |
|------|---------|--------|
| `needsProgesterone` | Has uterus (no hysterectomy) | Adds progesterone CPID to gel/patch/pill checkout |
| `vaginalSymptoms` | Selected vaginal dryness/pain | Shows vaginal add-on toggle on non-vcream treatments |
| `adhesiveAllergy` | Selected adhesive allergy | Hides patch card |
| `nicotineOrClot` | Nicotine use OR blood clot history | Hides pill card |
| `transdermalSideEffects` | Prior bad reaction to patches/gels | Hides gel + patch cards |

## TODO / Known Issues

- [ ] Dosable staging API routing logic needs to be verified with Dosable support (currently returns same default product regardless of answers)
- [ ] Once Dosable routing is confirmed working, remove the `replaceProductsParam` override in `server.js` and let Dosable's clinical routing drive the checkout products
- [ ] Answer manipulation layer: when user selects a specific treatment, proxy should send the correct answer set to Dosable to get that treatment returned natively (no URL override)
- [ ] Production API keys and checkout URL need to be configured before go-live
