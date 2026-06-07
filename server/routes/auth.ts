import { Router } from 'express'
import { google } from 'googleapis'
import crypto from 'crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/firebase'
import { encrypt } from '../lib/encryption'
import { setAccessToken } from '../lib/tokenCache'
import { writeAuditLog } from '../lib/auditLog'

export const authRouter = Router()

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'email',
  'profile',
]

function makeOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  )
}

// ── /auth/google/start ──────────────────────────────────────────────────────
authRouter.get('/google/start', (req, res) => {
  const state = crypto.randomBytes(32).toString('hex')

  // Store state SERVER-SIDE in the session (Firestore-backed).
  req.session.oauthState = state

  req.session.save((err) => {
    if (err) {
      console.error('[auth] Failed to save session before OAuth redirect:', err)
      return res.status(500).send('Session error — please try again')
    }

    const redirectUri = process.env.GOOGLE_REDIRECT_URI!
    console.log('[auth] Starting OAuth. redirectUri:', redirectUri, 'sessionID:', req.sessionID)

    const oauth2Client = makeOAuth2Client()
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state,
      prompt: 'consent',
      login_hint: process.env.ALLOWED_EMAILS?.split(',')[0] || '',
      hd: 'lemonfilms.com',
    })

    res.redirect(url)
  })
})

// ── /auth/google/callback ───────────────────────────────────────────────────
authRouter.get('/google/callback', async (req, res) => {
  const { code, state } = req.query as Record<string, string>
  const storedState = req.session.oauthState

  console.log('[auth] Callback. sessionID:', req.sessionID, 'stored:', storedState?.slice(0, 8), 'got:', state?.slice(0, 8))

  if (!state || !storedState || state !== storedState) {
    console.error('[auth] State mismatch — stored:', storedState?.slice(0, 8), 'received:', state?.slice(0, 8))
    return res.status(403).send(`
      <h2>Login failed — state mismatch</h2>
      <p>This usually means your session cookie was lost between steps.</p>
      <p><a href="/auth/google/start">Try again</a></p>
    `)
  }

  // Clear state immediately after validation
  delete req.session.oauthState

  const redirectUri = process.env.GOOGLE_REDIRECT_URI!
  const oauth2Client = makeOAuth2Client()

  let tokens: any
  try {
    const result = await oauth2Client.getToken(code)
    tokens = result.tokens
  } catch (err) {
    console.error('[auth] Token exchange failed:', err)
    return res.status(400).send('Token exchange failed — please try logging in again.')
  }

  oauth2Client.setCredentials(tokens)
  const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2Client })

  let userInfo: any
  try {
    const response = await oauth2Api.userinfo.get()
    userInfo = response.data
  } catch (err) {
    console.error('[auth] Failed to fetch user info:', err)
    return res.status(500).send('Failed to fetch user info from Google. Please try again.')
  }

  const email = userInfo.email!
  const uid = userInfo.id!

  const allowed = (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
  if (!allowed.includes(email.toLowerCase())) {
    return res.status(403).send('Email not authorized')
  }

  const encrypted = encrypt(tokens.refresh_token!)
  await db.collection(`users/${uid}/google_tokens`).doc('token').set({
    refreshToken: encrypted,
    tokenExpiry: new Date(tokens.expiry_date!),
    scope: tokens.scope || '',
    updatedAt: FieldValue.serverTimestamp(),
  })

  setAccessToken(uid, tokens.access_token!, tokens.expiry_date!)

  await db.collection('users').doc(uid).set(
    {
      email,
      displayName: userInfo.name || '',
      photoURL: userInfo.picture || '',
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  req.session.uid = uid
  req.session.email = email

  await db.collection('sessions').doc(req.sessionID).set(
    {
      uid,
      email,
      lastSeenAt: FieldValue.serverTimestamp(),
      absoluteExpiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      userAgent: req.headers['user-agent'] || '',
      ip: req.ip || '',
    },
    { merge: true },
  )

  await writeAuditLog(uid, 'login', req.ip || '', req.headers['user-agent'] || '')
  res.redirect(process.env.ALLOWED_ORIGIN || '/')
})

// ── /auth/google/logout ─────────────────────────────────────────────────────
authRouter.get('/google/logout', async (req, res) => {
  const uid = req.session?.uid
  if (uid) {
    await writeAuditLog(uid, 'logout', req.ip || '', req.headers['user-agent'] || '')
  }
  req.session.destroy(() => {})
  res.clearCookie('sid', { path: '/' })
  res.redirect(process.env.ALLOWED_ORIGIN || '/')
})
