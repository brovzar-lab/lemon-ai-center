import { Router } from 'express'
import { getBrainEngine } from '../lib/brain'

export const readyRouter = Router()

/**
 * GET /api/ready
 * Unauthenticated ops snapshot: env wiring + Obsidian brain stats (no secrets).
 * Use after deploy to confirm Gmail OAuth vars, AI keys, and vault indexing.
 */
readyRouter.get('/', (_req, res) => {
  const brain = getBrainEngine()
  const brainReady = !!(brain && brain.isReady())
  const stats = brainReady ? brain!.getStats() : null

  const googleOAuthConfigured = !!(
    process.env.GOOGLE_CLIENT_ID?.trim()
    && process.env.GOOGLE_CLIENT_SECRET?.trim()
    && process.env.GOOGLE_REDIRECT_URI?.trim()
  )

  res.json({
    data: {
      googleOAuthConfigured,
      allowedOriginConfigured: !!process.env.ALLOWED_ORIGIN?.trim(),
      allowedEmailsConfigured: !!process.env.ALLOWED_EMAILS?.trim(),
      anthropicConfigured: !!process.env.ANTHROPIC_API_KEY?.trim(),
      geminiConfigured: !!process.env.GEMINI_API_KEY?.trim(),
      vaultConfigured: !!(
        process.env.OBSIDIAN_VAULT_GIT_URL?.trim() || process.env.OBSIDIAN_VAULT_PATH?.trim()
      ),
      brain: brainReady && stats
        ? {
            ready: true,
            docCount: stats.docCount,
            chunkCount: stats.chunkCount,
            totalBytes: stats.totalBytes,
            lastIndexedAt: stats.lastIndexedAt,
          }
        : {
            ready: false,
            docCount: 0,
            chunkCount: 0,
            totalBytes: 0,
            lastIndexedAt: null,
          },
    },
  })
})
