import type { Request, Response, NextFunction } from 'express'

/**
 * C-2: Middleware for Railway Cron → HTTP trigger endpoints.
 * Validates a shared secret instead of a user session.
 *
 * Set ENGINE_CRON_SECRET on both the main service and each Railway Cron service.
 */
export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ENGINE_CRON_SECRET
  if (!expected) {
    res.status(503).json({
      error: { code: 'CRON_NOT_CONFIGURED', message: 'ENGINE_CRON_SECRET not set', retryable: false },
    })
    return
  }

  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token || token !== expected) {
    res.status(401).json({
      error: { code: 'INVALID_CRON_SECRET', message: 'Invalid or missing cron secret', retryable: false },
    })
    return
  }

  next()
}
