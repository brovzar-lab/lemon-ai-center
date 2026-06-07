# Lemon AI Center — Claude Code Guidelines

## Project
Billy Rovzar's CEO command center for Lemon Studios. Full-stack: Vite + React 18 + TypeScript frontend, Express proxy backend, Firebase/Firestore, Google OAuth, Anthropic AI.

## Architecture
- `/src` — frontend (Vite + React + Zustand)
- `/server` — backend (Express, TypeScript → CJS)
- `/shared` — types used by both sides
- Path aliases: `@/*` → `src/`, `@shared/*` → `shared/`

## Dev
```bash
npm run dev       # Vite :5173 + Express :3001
npm test          # Vitest
npm run typecheck # TypeScript check both sides
```

## Key Conventions
- Design tokens in `tailwind.config.ts` — always use `bg-bg-base`, `text-text-primary`, etc.
- Fonts: `font-display` (Fraunces) for brief text, `font-body` (Inter) for everything else
- Stores: one Zustand store per domain in `src/stores/`
- Server responses: `{ data: T }` on success, `{ error: { code, message, retryable } }` on failure
- All `/api/*` routes require auth (`requireAuth` middleware)
- All write routes require CSRF check (`csrfCheck` middleware)
- Seeds in `src/data/seeds.ts` are the offline/demo fallback — stores hydrate from seeds on init

## Security Rules
- Never log access tokens or refresh tokens
- `TOKEN_ENCRYPTION_KEY` never touches Firestore
- Session cookies: `__Host-` prefix, httpOnly, secure, sameSite

## Not in v1
See spec section 10 for explicit exclusions (no subtasks, no drag-drop, no mobile PWA, etc.)
