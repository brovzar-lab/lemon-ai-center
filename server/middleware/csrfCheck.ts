import type { Request, Response, NextFunction } from 'express'

const WRITE_METHODS = new Set(['POST', 'PATCH', 'DELETE'])

// Must match the CORS allowlist in server/index.ts
const ALLOWED_ORIGIN_PATTERNS = [
  /^http:\/\/localhost/,
  /\.trycloudflare\.com$/,
  /\.lemonfilms\.com$/,
  /\.cloudflareaccess\.com$/,
  /\.billyrovzar\.com$/,
]

export function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) return true
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
