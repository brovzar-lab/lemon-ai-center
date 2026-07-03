if (process.env.NODE_ENV === 'production') require('module-alias/register')
import 'dotenv/config'
import express from 'express'
import path from 'path'
import crypto from 'crypto'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import session = require('express-session')
import { FirestoreSessionStore } from './lib/session'
import { authRouter } from './routes/auth'
import { claudeRouter } from './routes/claude'
import { gmailRouter } from './routes/gmail'
import { calendarRouter } from './routes/calendar'
// DEPRECATED: Notion data now flows through vault pipeline (Notion → extraction scripts → Obsidian Brain → Git → Railway)
// import { notionRouter } from './routes/notion'
import { voiceRouter } from './routes/voice'
import { draftReplyRouter } from './routes/draftReply'
import { capturesRouter } from './routes/captures'
import { actionsRouter } from './routes/actions'
import { delegationsRouter } from './routes/delegations'
import { ttsRouter } from './routes/tts'
import { brainRouter } from './routes/brain'
import { correctionsRouter } from './routes/corrections'
import { tasksRouter } from './routes/tasks'
import { todayRouter } from './routes/today'
import { readyRouter } from './routes/ready'
import { scanRouter } from './routes/scan'
import { engineRouter } from './routes/engine'
import { slateRouter } from './routes/slate'
import { initBrainEngine } from './lib/brain'
import { initVaultSync } from './lib/vaultSync'
import { initEngine, stopEngine } from './lib/engine'
import { requireAuth } from './middleware/requireAuth'

export const app = express()

const isProd = process.env.NODE_ENV === 'production'

// Trust the full proxy chain (Cloudflare edge → Cloudflare Tunnel → Railway edge)
// so req.secure reflects the client's original HTTPS. With a single-hop value,
// an internal http hop can make Express think the request is insecure, which
// makes express-session silently DROP the `secure` session cookie — the user
// then lands in demo mode on every refresh. Trusting the chain fixes that.
app.set('trust proxy', true)

// Healthcheck — before any middleware so Railway's agent (no Origin header) isn't blocked by CORS
app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

// C-2: Cron trigger — before CORS so server-to-server requests (no Origin) aren't rejected
import { requireCronSecret } from './middleware/cronAuth'
import { runJob, JOBS } from './lib/engine'
import type { EngineJobId } from '@shared/types'

const CRON_VALID_JOBS = new Set<string>([...JOBS.map((j) => j.id), 'seed_from_vault'])

app.post('/api/engine/cron/:jobId', requireCronSecret, express.json(), async (req, res) => {
  const uid = process.env.CEO_UID
  if (!uid) {
    res.status(503).json({ error: { code: 'NO_UID', message: 'CEO_UID not configured', retryable: false } })
    return
  }
  const jobId = req.params.jobId
  if (!CRON_VALID_JOBS.has(jobId)) {
    res.status(400).json({ error: { code: 'UNKNOWN_JOB', message: `Unknown job: ${jobId}`, retryable: false } })
    return
  }
  const startedAt = Date.now()
  try {
    await runJob(uid, jobId as EngineJobId)
    res.json({ data: { ok: true, jobId, durationMs: Date.now() - startedAt } })
  } catch (err) {
    res.status(500).json({ error: { code: 'JOB_FAILED', message: (err as Error).message, retryable: true } })
  }
})

// Security & logging
app.use(helmet({
  contentSecurityPolicy: isProd
    ? {
        directives: {
          defaultSrc: ["'self'"],
          // Cloudflare Tunnel injects its analytics beacon
          scriptSrc: ["'self'", 'https://static.cloudflareinsights.com'],
          // Google Fonts stylesheet (Playfair Display / Schibsted Grotesk)
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
          // TTS audio is fetched from /api/tts and played as a blob: URL
          mediaSrc: ["'self'", 'blob:', 'data:'],
          connectSrc: [
            "'self'",
            // Firebase / Firestore client SDK
            'https://firestore.googleapis.com',
            'https://*.firebaseio.com',
            'wss://*.firebaseio.com',
            'https://firebase.googleapis.com',
            'https://*.firebaseapp.com',
            'https://identitytoolkit.googleapis.com',
            'https://securetoken.googleapis.com',
            'https://www.gstatic.com',
            // Google APIs (OAuth, Gmail, Calendar)
            'https://www.googleapis.com',
            'https://oauth2.googleapis.com',
            'https://accounts.google.com',
            // Anthropic
            'https://api.anthropic.com',
            // Cloudflare analytics beacon
            'https://static.cloudflareinsights.com',
          ],
          // Firebase Auth runs an iframe on the project's authDomain to manage
          // client auth state. 'none' here breaks signInWithCustomToken with
          // auth/network-request-failed, which blocks every Firestore read.
          frameSrc: [
            "'self'",
            'https://*.firebaseapp.com',
            'https://accounts.google.com',
          ],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
        },
      }
    : false,
}))
app.use(morgan(isProd ? 'combined' : 'dev'))
app.use(cors({
  origin: (origin, cb) => {
    // No Origin header = same-origin navigation or server-to-server request.
    // Safe to allow — CSRF is handled by sameSite cookies + csrfCheck middleware.
    if (!origin) return cb(null, true)
    const allowed = [
      /^http:\/\/localhost/,
      /\.trycloudflare\.com$/,
      /\.lemonfilms\.com$/,
      /\.cloudflareaccess\.com$/,
      /\.billyrovzar\.com$/,
    ]
    if (allowed.some((re) => re.test(origin))) return cb(null, true)
    // Also allow the ALLOWED_ORIGIN env var if set
    if (process.env.ALLOWED_ORIGIN && origin === process.env.ALLOWED_ORIGIN) return cb(null, true)
    cb(new Error(`CORS: origin not allowed — ${origin}`))
  },
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())
// S-6: Fail-fast if SESSION_SECRET is missing — prevents signing cookies with a known default
const sessionSecret = process.env.SESSION_SECRET
if (!sessionSecret && isProd) throw new Error('SESSION_SECRET environment variable is required in production')

app.use(
  session({
    name: 'sid', // No __Host- prefix — incompatible with Cloudflare Tunnel proxy
    secret: sessionSecret || 'dev-secret-change-me-local-only',
    resave: false,
    saveUninitialized: false,
    // Re-issue the cookie (with a fresh 30-day expiry) on every response so an
    // authenticated session keeps renewing as long as the dashboard is used.
    rolling: true,
    store: new FirestoreSessionStore(),
    cookie: {
      httpOnly: true,
      // C-1: trust proxy (line 41) makes Express check X-Forwarded-Proto from
      // Cloudflare Tunnel, so secure:true works correctly behind the reverse proxy.
      secure: isProd,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    },
  }),
)


app.use('/api/ready', readyRouter)

// S-8: Use a dedicated random CSRF token — never expose the sessionID to JavaScript
app.get('/api/csrf', (req, res) => {
  if (!(req.session as any).csrfToken) {
    (req.session as any).csrfToken = crypto.randomBytes(32).toString('hex')
  }
  res.json({ data: { token: (req.session as any).csrfToken } })
})

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ data: { uid: req.session.uid, email: req.session.email } })
})

// Firebase custom token — lets the browser authenticate the Firestore
// client SDK as the session user, so security rules can enforce
// request.auth.uid == userId on users/{uid}/** reads/writes.
app.get('/api/firebase-token', requireAuth, async (req, res) => {
  try {
    const { getAuth } = await import('firebase-admin/auth')
    const token = await getAuth().createCustomToken(req.session.uid!)
    res.json({ data: { token } })
  } catch (err) {
    console.error('[auth] Custom token failed:', (err as Error).message)
    res.status(500).json({
      error: { code: 'TOKEN_FAILED', message: 'Could not mint Firebase token', retryable: true },
    })
  }
})

app.use('/auth', authRouter)
app.use('/api/claude', claudeRouter)
app.use('/api/gmail', gmailRouter)
app.use('/api/calendar', calendarRouter)
// app.use('/api/notion', notionRouter)  // DEPRECATED — vault is the single source of truth
app.use('/api/voice-profile', voiceRouter)
app.use('/api/claude/draft-reply', draftReplyRouter)
app.use('/api/captures', capturesRouter)
app.use('/api/actions', actionsRouter)
app.use('/api/delegations', delegationsRouter)
app.use('/api/tts', ttsRouter)
app.use('/api/brain', brainRouter)
app.use('/api/corrections', correctionsRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api', todayRouter)
app.use('/api/scan', scanRouter)
app.use('/api/engine', engineRouter)
app.use('/api/slate', slateRouter)

if (isProd) {
  // Use process.cwd() — always the project root regardless of how tsx is invoked
  const distPath = path.resolve(process.cwd(), 'dist')
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

if (require.main === module) {
  const PORT = process.env.PORT || 3001
  const server = app.listen(PORT, async () => {
    console.log(`Server running on :${PORT}`)

    // On Railway: clone vault from GitHub. Locally: use OBSIDIAN_VAULT_PATH.
    const vaultPath = initVaultSync()
    if (vaultPath) {
      try {
        await initBrainEngine(vaultPath)
      } catch (err) {
        console.error('[brain] Failed to initialize:', (err as Error).message)
      }
    } else {
      console.warn('[brain] No vault available — brain disabled')
    }
    // The Engine: all scheduled jobs (inbox scan, morning assembly,
    // slip detection, nightly metrics, evening wrap, weekly review,
    // watchlist) + boot catch-up. Replaces the old 6:30 precompute cron —
    // precompute now runs inside morning_assembly at 5:30.
    initEngine()
  })

  // M-5: Graceful shutdown — Railway sends SIGTERM before killing containers.
  // Stop accepting connections, drain running engine jobs, then exit.
  process.on('SIGTERM', () => {
    console.log('[server] SIGTERM received — draining...')
    server.close(async () => {
      console.log('[server] HTTP server closed')
      await stopEngine(25_000) // 25s budget (Railway gives 30s)
      process.exit(0)
    })
    // Force exit after 28s if drain doesn't finish
    setTimeout(() => {
      console.warn('[server] Forced exit after timeout')
      process.exit(1)
    }, 28_000)
  })
}
