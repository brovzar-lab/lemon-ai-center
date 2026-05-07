if (process.env.NODE_ENV === 'production') require('module-alias/register')
import 'dotenv/config'
import express from 'express'
import path from 'path'
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
import { notionRouter } from './routes/notion'
import { voiceRouter } from './routes/voice'
import { draftReplyRouter } from './routes/draftReply'
import { capturesRouter } from './routes/captures'
import { actionsRouter } from './routes/actions'
import { delegationsRouter } from './routes/delegations'
import { ttsRouter } from './routes/tts'
import { brainRouter } from './routes/brain'
import { correctionsRouter } from './routes/corrections'
import { initBrainEngine } from './lib/brain'
import { initVaultSync } from './lib/vaultSync'
import { requireAuth } from './middleware/requireAuth'

export const app = express()

const isProd = process.env.NODE_ENV === 'production'

// Trust Cloudflare Tunnel / reverse proxy headers (X-Forwarded-For, X-Forwarded-Proto)
app.set('trust proxy', 1)

// Security & logging
app.use(helmet({ contentSecurityPolicy: isProd ? undefined : false }))
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
app.use(
  session({
    name: 'sid', // No __Host- prefix — incompatible with Cloudflare Tunnel proxy
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    store: new FirestoreSessionStore(),
    cookie: {
      httpOnly: true,
      secure: false, // Cloudflare terminates TLS; we see HTTP internally
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    },
  }),
)

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/csrf', (req, res) => {
  res.json({ data: { token: req.sessionID } })
})

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ data: { uid: req.session.uid, email: req.session.email } })
})

app.use('/auth', authRouter)
app.use('/api/claude', claudeRouter)
app.use('/api/gmail', gmailRouter)
app.use('/api/calendar', calendarRouter)
app.use('/api/notion', notionRouter)
app.use('/api/voice-profile', voiceRouter)
app.use('/api/claude/draft-reply', draftReplyRouter)
app.use('/api/captures', capturesRouter)
app.use('/api/actions', actionsRouter)
app.use('/api/delegations', delegationsRouter)
app.use('/api/tts', ttsRouter)
app.use('/api/brain', brainRouter)
app.use('/api/corrections', correctionsRouter)

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
  })
}
