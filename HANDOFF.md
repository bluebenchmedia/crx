# Handoff Notes for Polsia

## What This Is

A complete HRT intake funnel for ClearedRx. Patients go through a 32-step medical questionnaire, select their preferred HRT treatment, and are routed to checkout via the Dosable telehealth API.

## Quick Start

1. **Clone / add to your existing repo**
2. **Set environment variables** (see `server/.env.example`)
3. **Deploy server** to your existing Render instance (root dir: `server`, start: `node server.js`)
4. **Deploy frontend** as a static site (root dir: `frontend`)
5. **Update the API_BASE URL** in the frontend JS files (see below)

## Proxy URL — Auto-Detected (No Change Needed for Standard Setup)

The frontend JS files already auto-detect the environment:

```js
var PROXY_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3001'
  : '/api-proxy';
```

- **Local dev:** Calls `http://localhost:3001` directly
- **Production:** Calls `/api-proxy` (relative path)

**For production on Render**, you need a reverse proxy rule so that requests to `/api-proxy/*` on the frontend domain are forwarded to the Node server. Two options:

**Option A — Same Render service (recommended):** Serve the frontend static files from the same Node.js Express server by adding:
```js
app.use(express.static(path.join(__dirname, '../frontend')));
```
This way everything runs on one Render service and `/api-proxy` routes work automatically.

**Option B — Separate services:** Set up a Render redirect/rewrite rule on the static site so `/api-proxy/*` proxies to your Node service URL. Or change the production URL in the JS to the full Render URL of your proxy service.

## Environment Variables to Set in Render

| Variable | Value |
|----------|-------|
| `DOSABLE_API_KEY` | `84b2da8db33ee0ef838728b4b474c3b338e1f131f7f44fab50bf406e79042f68` |
| `DOSABLE_BASE_URL` | `https://staging.intake.dosable.com` (staging) |
| `DOSABLE_TENANT_ID` | `32` |
| `CHECKOUT_BASE_URL` | `https://staging-buy-hrt.clearedrx.com/checkout` (staging) |
| `FRONTEND_URL` | Your deployed frontend URL (for CORS) |
| `PORT` | `3001` |

## Current State of the API Integration

The Dosable staging API is currently returning the same default product (`products=23:1;35:1` — High Estrogen Patch + Progesterone) regardless of quiz answers. This appears to be a staging environment configuration issue — the routing logic may not be active on staging.

**Current workaround:** The proxy server (`server/server.js`) overrides the Dosable `products=` param with the user's actual treatment selection from the treatment page. This means checkout works correctly, but the Dosable-stored answers may not perfectly align with the checkout product.

**Ideal solution:** Once Dosable confirms staging routing is active (or production access is granted), the proxy should be updated to:
1. Send the correct answer set to Dosable based on the user's treatment selection
2. Use Dosable's returned checkout URL as-is (no products override)

See `README.md` → TODO section for full details.

## Key Technical Contacts

- **Dosable API:** Tenant 32, staging at `https://staging.intake.dosable.com`
- **ClearedRx Checkout:** `https://staging-buy-hrt.clearedrx.com/checkout`

## File Map

```
frontend/
  index.html          ← 32-step quiz (DO NOT change step structure without updating quiz.js)
  treatments.html     ← Treatment selection page
  js/quiz.js          ← All quiz logic, clinical flag computation
  js/treatments.js    ← Treatment cards, CPID routing, checkout
  css/quiz.css        ← Quiz styles
  css/treatments.css  ← Treatment page styles
  images/             ← All product + lifestyle images

server/
  server.js           ← Main proxy server (Express)
  package.json
  .env.example        ← Copy to .env and fill in values
```
