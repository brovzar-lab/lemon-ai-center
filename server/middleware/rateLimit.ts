import rateLimit from 'express-rate-limit'
import type { Request } from 'express'

export function makeRateLimit(windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // We key on sessionID first (single-user CEO app), so the app-wide
    // `trust proxy: true` doesn't actually enable IP-spoofed limit bypass —
    // silence express-rate-limit's permissive-trust-proxy validation error.
    validate: { trustProxy: false },
    keyGenerator: (req: Request) => (req as any).sessionID || req.ip || 'anonymous',
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests', retryable: true },
      })
    },
  })
}

export const briefLimit = makeRateLimit(60_000, 5)
export const chatLimit = makeRateLimit(60_000, 30)
export const sparkLimit = makeRateLimit(60_000, 5)
export const gmailSendLimit = makeRateLimit(60_000, 5)
export const gmailLimit = makeRateLimit(60_000, 60)
export const calendarLimit = makeRateLimit(60_000, 30)
export const notionLimit = makeRateLimit(60_000, 20)
// Email-archaeology generator burns Gmail quota per call (up to 45 thread.get
// fetches) — keep tight so accidental double-clicks don't sting.
export const tasksGenerateLimit = makeRateLimit(60_000, 4)
