if (process.env.NODE_ENV === 'production') require('module-alias/register')
import 'dotenv/config'
import express from 'express'
import path from 'path'
import crypto from 'crypto'
import cron from 'node-cron'
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
import { initBrainEngine } from './lib/brain'
import { initVaultSync } from './lib/vaultSync'
import { requireAuth } from './middleware/requireAuth'

export const app = express()

const isProd = process.env.NODE_ENV === 'production'

// Trust Cloudflare Tunnel / reverse proxy headers (X-Forwarded-For, X-Forwarded-Proto)
app.set('trust proxy', 1)

// Security & logging
app.use(helmet({
  contentSecurityPolicy: isProd
    ? {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
          connectSrc: [
            "'self'",
            // Firebase / Firestore client SDK
            'https://firestore.googleapis.com',
            'https://*.firebaseio.com',
            'wss://*.firebaseio.com',
            'https://firebase.googleapis.com',
            'https://identitytoolkit.googleapis.com',
            'https://securetoken.googleapis.com',
            // Google APIs (OAuth, Gmail, Calendar)
            'https://www.googleapis.com',
            'https://oauth2.googleapis.com',
            'https://accounts.google.com',
            // Anthropic
            'https://api.anthropic.com',
          ],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
        },
      }
    : false,
}))
app.use(morgan(isProd ? 'combined' : 'dev'))
app.use(cors({
  origin: (origin, cb) => {
    // Allow: no origin (curl/mobile), localhost, tunnel, and lemonfilms.com
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
    store: new FirestoreSessionStore(),
    cookie: {
      httpOnly: true,
      secure: false, // Cloudflare Tunnel terminates TLS; Railway sees HTTP internally. Secure:true causes redirect loops.
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    },
  }),
)

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

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
  app.listen(PORT, async () => {
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
    // Daily cron: trigger precompute at 6:30 AM local time
    cron.schedule('30 6 * * *', async () => {
      console.log('[cron] 6:30 AM — triggering daily precompute')
      try {
        const { runPrecompute } = await import('./lib/precompute')
        const { assembleContext } = await import('./routes/claude')
        // Use a known uid from env, or skip if not configured
        const cronUid = process.env.CEO_UID
        if (cronUid) {
          await runPrecompute(cronUid, assembleContext)
          console.log('[cron] Daily precompute completed')
        } else {
          console.warn('[cron] CEO_UID not set — skipping precompute')
        }
      } catch (err) {
        console.error('[cron] Precompute failed:', (err as Error).message)
      }
    })
  })
}
