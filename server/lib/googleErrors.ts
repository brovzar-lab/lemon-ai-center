import type { Response } from 'express'

/**
 * If `err` means the user's Google connection is dead (revoked/expired refresh
 * token), send a distinct REAUTH_REQUIRED response and return true so the
 * caller stops. Otherwise return false and let the caller fall through to its
 * own generic error handling.
 *
 * Matches on the error's `code` (set by ReauthRequiredError in googleAuth.ts)
 * rather than `instanceof`, so it stays correct across module mocks and any
 * error that carries the code.
 *
 * This is the server half of "never show fake success": a dead Google token
 * must reach the client as "reconnect your account", NOT as a retryable
 * "unavailable" that silently never recovers.
 */
export function respondIfReauthRequired(res: Response, err: unknown): boolean {
  if ((err as { code?: string } | null)?.code === 'REAUTH_REQUIRED') {
    res.status(409).json({
      error: {
        code: 'REAUTH_REQUIRED',
        message: 'Your Google account needs to be reconnected.',
        retryable: false,
      },
    })
    return true
  }
  return false
}
