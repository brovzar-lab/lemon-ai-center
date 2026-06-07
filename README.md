# Lemon AI Center

Billy Rovzar's command center for Lemon Studios. Gmail + Google Calendar + Obsidian Brain + Anthropic AI in one dashboard.

**Production URL:** [https://ceo.billyrovzar.com/](https://ceo.billyrovzar.com/) — canonical. Same Railway service as any legacy hostname; see **[docs/OPERATIONS.md](docs/OPERATIONS.md)** for DNS, OAuth, and cleanup in plain language.

## Setup

1. Clone repo
2. Copy `.env.example` to `.env` and fill in values
3. `npm install`
4. `npm run dev` — opens at http://localhost:5173

## Environment Variables

See `.env.example`. All server-side vars go in Railway. Never commit `.env`.

### Railway deployment checklist

Confirm these **Variables** on the **lemon-ai-center** service (see `.env.example` for descriptions):

| Variable | Notes |
|----------|--------|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth for Gmail + Calendar |
| `GOOGLE_REDIRECT_URI` | Must exactly match Google Cloud Console, e.g. `https://ceo.billyrovzar.com/auth/google/callback` |
| `ALLOWED_EMAILS` | e.g. `billy@lemonfilms.com` |
| `ALLOWED_ORIGIN` | Must match the site origin for CSRF on writes, e.g. `https://ceo.billyrovzar.com` |
| `ANTHROPIC_API_KEY` | Briefing + task generation |
| `GEMINI_API_KEY` | Optional (e.g. TTS) |
| `OBSIDIAN_VAULT_GIT_URL` | **Production:** private Git URL for the Obsidian vault; server clones to `./vault` at startup and indexes the Brain. Without this (and without `OBSIDIAN_VAULT_PATH` on disk), Brain stays disabled. |
| `TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET` | Sessions |
| Firebase Admin + client vars | As in `.env.example` |

### Obsidian Brain on Railway

1. Set **`OBSIDIAN_VAULT_GIT_URL`** to the same vault you edit locally (HTTPS with deploy token or SSH URL Railway can use).
2. Redeploy and watch logs for `[vault-sync] Vault ready` and `[brain] Indexed … docs`.
3. If you see `[brain] No vault available — brain disabled`, fix Git access or set **`OBSIDIAN_VAULT_PATH`** only for environments where the vault is already on disk (local dev).

### Verification after deploy

1. Load balancer: `GET /health` → `{ "ok": true }`
2. Ops snapshot (no auth, no secrets): `GET /api/ready` → JSON with `googleOAuthConfigured`, `vaultConfigured`, `brain.ready`, `brain.chunkCount`, etc.
3. Logged-in UI: open the app, sign in with Google; inbox and calendar should populate.
4. Authenticated: `GET /api/brain/status` — `ready: true` and non-zero `chunkCount` when indexing succeeded.

Example:

```bash
curl -s https://ceo.billyrovzar.com/health
curl -s https://ceo.billyrovzar.com/api/ready | jq .
```

## Commands

```bash
npm run dev       # Vite :5173 + Express :3001
npm run build     # Production build
npm start         # Run production build
npm test          # Vitest
npm run typecheck # TypeScript check
```

## Deploy

Single Railway service. Push to main → auto-deploy. Express serves `dist/` in production.
