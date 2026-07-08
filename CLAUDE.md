# Lemon AI Center

Billy's CEO command center for Lemon Studios: one dashboard over Gmail + Google Calendar + Obsidian Brain + Anthropic AI. Full-stack Vite + React 18 + TS frontend, Express proxy backend, Firebase/Firestore, Google OAuth. Prod: https://ceo.billyrovzar.com (single Railway service, fronted by a Cloudflare Tunnel).

## Commands
| Task | Command |
|------|---------|
| Install | `npm install` |
| Dev | `npm run dev` (Vite :5175 + `tsx watch server/index.ts` :3001, via concurrently) |
| Build | `npm run build` (`vite build` + `tsc -p server/tsconfig.json`) |
| Start prod | `npm start` (runs built `server/dist/server/index.js`, serves `dist/`) |
| Test | `npm test` (`vitest run`) / `npm run test:watch` |
| Typecheck | `npm run typecheck` (`tsc --noEmit` for `src` + `tsc -p server/tsconfig.json --noEmit`) |

Vite dev proxies `/api` and `/auth` to `localhost:3001`, so hit the app at **http://localhost:5175**, not the Express port.

## Architecture
```
src/            frontend (React 18 + Zustand + Tailwind)
  components/     UI; views/ = top-level screens, editions/ = time-of-day briefings, spine/, workspace/
  stores/         one Zustand store per domain (use*Store.ts); lemon/ = LEMON workspace stores
  data/seeds.ts   offline/demo fallback — stores hydrate from seeds on init
  lib/            apiClient, firebaseAuth, firestore, firestoreLemon, mutationQueue
server/         Express backend, TypeScript -> CommonJS (index.ts is the entry)
  routes/         21 route modules (auth, gmail, calendar, brain, engine, brief, tts, ...) + colocated *.test.ts
  middleware/     requireAuth, csrfCheck, cronAuth, rateLimit
  lib/brain/      Obsidian vault indexer + FlexSearch (the "Brain")
  lib/engine/     Mission Control engine; lib/engine/jobs/ = scheduled jobs (inboxScan, morningAssembly, slipDetect, weeklyReview, ...)
shared/         types + constants used by BOTH sides (models.ts, seeds.ts, types.ts, constants.ts)
skills/         bundled agent skills (co-writer, film-finance, lemon-coverage, chivo, story-ninja, dev-exec)
```
Aliases: frontend `@/*`->`src/`, `@shared/*`->`shared/`. Server compiles `@shared/*` to `server/dist/shared` via `_moduleAliases` in package.json (module-alias resolves it at runtime).

## Key Files
- `server/index.ts` — Express entry; `PORT` env or 3001; serves `dist/` in prod; wires `/health`, cron route, session.
- `src/main.tsx` / `src/App.tsx` — frontend entry.
- `DESIGN.md` — single source of truth for all styling (read before any UI work).
- `firestore.rules`, `firebase.json`, `railway.json` — deploy/security config.

## Environment
Copy `.env.example` -> `.env`. Server vars: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GEMINI_TTS_VOICE`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY` (32-byte hex / 64 chars), `SESSION_SECRET`, `ALLOWED_EMAILS`, `ALLOWED_ORIGIN`, `CEO_UID`, `ENGINE_CRON_SECRET`, `OBSIDIAN_VAULT_GIT_URL` (prod) or `OBSIDIAN_VAULT_PATH` (local), `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY`, `NOTION_API_KEY`, `NOTION_BRAIN_PAGE_ID`, `FINNHUB_API_KEY`. Frontend build-time (public): `VITE_FIREBASE_*`, `VITE_LEMON_FIREBASE_*`, `VITE_APP_TITLE`, feature flags `VITE_NEW_DASHBOARD` / `VITE_OPS_VIEWS`.

## Conventions
- Styling: obey **DESIGN.md**. Never use warm/brown/cream/terracotta/amber/gold colors — the whole design system exists to remove that look.
- Stores: one Zustand store per domain in `src/stores/`.
- Server responses: `{ data: T }` on success, `{ error: { code, message, retryable } }` on failure.
- All `/api/*` routes require auth (`requireAuth`); all write routes require CSRF (`csrfCheck`).
- Types shared by client and server go in `shared/`, never duplicated.

## Security
- Never log access or refresh tokens.
- `TOKEN_ENCRYPTION_KEY` never touches Firestore (used only in `server/lib/encryption.ts`).
- Session cookie is named `sid` — **deliberately NO `__Host-` prefix** (incompatible with the Cloudflare Tunnel proxy). It is `httpOnly`, `sameSite: 'lax'`, and `secure` only in prod (`secure: isProd`). Do not "harden" it back to `__Host-` or it will break login behind the tunnel.

## Gotchas
- **Build toolchain lives in `dependencies`, not `devDependencies` — on purpose.** Railway/Railpack runs `npm ci` with `NODE_ENV=production` (skips devDeps). Anything `npm run build` needs (vite, @vitejs/plugin-react, tailwind, autoprefixer, postcss, tsc, the server's `@types/*`) MUST stay a regular dependency or the build dies with `vite: not found` (exit 127). Do not "tidy" these into devDependencies. (See the `comments` block in package.json.)
- **Build before `npm start`.** `npm start` runs `server/dist/server/index.js`; without a prior `npm run build` it won't exist. `@shared` imports resolve to `server/dist/shared` at runtime, so a stale/partial build breaks server imports.
- **The Engine needs `CEO_UID` + `ENGINE_CRON_SECRET`.** Scheduled jobs (inbox scan, morning assembly, slip detection, metrics, weekly review) run as `CEO_UID`; without it the engine is disabled and only manual triggers work. Railway Cron hits `POST /api/engine/cron/:jobId`, guarded by `ENGINE_CRON_SECRET` (`requireCronSecret`).
- **Brain (Obsidian) is off unless a vault is wired.** Prod needs `OBSIDIAN_VAULT_GIT_URL` (cloned at startup); local needs `OBSIDIAN_VAULT_PATH`. Without either: `[brain] No vault available — brain disabled`, and vault write-back no-ops. Verify with `GET /api/ready` (`brain.ready`, `brain.chunkCount`).
- **`OBSIDIAN_VAULT_GIT_URL` must embed a token — the vault repo is private.** Format: `https://x-access-token:<PAT>@github.com/brovzar-lab/obsidian-brain.git`. Current PAT: fine-grained `railway-obsidian-brain-readonly` (Contents read-only, obsidian-brain only, no expiration, created 2026-07-07). A bare URL doesn't fail the deploy — the clone dies at boot, `[vault-sync] Failed to clone`, and the Brain silently serves `ready:false, docCount:0` (bit us 2026-07-07: prod Brain was down after the first redeploy since June because the token was missing).
- **CSRF is a single `ALLOWED_ORIGIN`** (`csrfCheck.ts`) but CORS may allow more origins — if writes 403 from a tunnel/preview host, `ALLOWED_ORIGIN` must match the site origin exactly.
- Health/ops without auth: `GET /health` -> `{ ok: true }` (Railway healthcheck); `GET /api/ready` -> config + brain status (no secrets).
- Two Firebase apps: primary (app data) and the secondary legacy LEMON workspace (`lemon-es-tu-dios`, read-mostly, via `src/lib/firestoreLemon.ts`). Blank `VITE_LEMON_FIREBASE_*` disables Deals/Projects/Memory/Archive views.
