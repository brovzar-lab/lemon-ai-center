import type { Request, Response, NextFunction } from 'express'

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Must match the CORS allowlist in server/index.ts
const ALLOWED_ORIGIN_PATTERNS = [
  /^http:\/\/localhost/,
  /\.lemonfilms\.com$/,
  /\.cloudflareaccess\.com$/,
  /\.billyrovzar\.com$/,
]

// Ad-hoc Cloudflare quick tunnels (*.trycloudflare.com) are anyone-can-mint,
// so they are trusted only OUTSIDE production (local dev / phone previews).
// Prod runs on the stable billyrovzar.com tunnel and must never trust them.
const DEV_ONLY_ORIGIN_PATTERNS = [/\.trycloudflare\.com$/]

export function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) return true
  if (process.env.NODE_ENV !== 'production' && DEV_ONLY_ORIGIN_PATTERNS.some((re) => re.test(origin))) return true
  if (process.env.ALLOWED_ORIGIN && origin === process.env.ALLOWED_ORIGIN) return true
  return false
}

export function csrfCheck(req: Request, res: Response, next: NextFunction): void {
  if (WRITE_METHODS.has(req.method)) {
    const origin = req.headers.origin
    if (!origin || !isAllowedOrigin(origin)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'CSRF check failed', retryable: false },
      })
      return
    }
  }
  next()
}
