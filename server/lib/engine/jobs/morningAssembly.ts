import { runSlipDetect } from './slipDetect'
import { generateAdvisorNote } from './advisor'
import { proposeWritingBlock } from './writingBlock'

/**
 * 05:30 — the morning is assembled before Billy wakes up:
 * 1. Fresh slips + front ranking
 * 2. Advisor daily note
 * 3. Priority precompute (powers One Thing / Priority Stack)
 *
 * Each phase is independent; one failing must not block the others.
 */
export async function runMorningAssembly(uid: string): Promise<void> {
  const errors: string[] = []

  try {
    await runSlipDetect(uid)
  } catch (err) {
    errors.push(`slips/fronts: ${(err as Error).message}`)
  }

  try {
    await generateAdvisorNote(uid)
  } catch (err) {
    errors.push(`advisor: ${(err as Error).message}`)
  }

  try {
    await proposeWritingBlock(uid)
  } catch (err) {
    errors.push(`writing block: ${(err as Error).message}`)
  }

  try {
    const { runPrecompute } = await import('../../precompute')
    const { assembleContext } = await import('../../../routes/claude')
    await runPrecompute(uid, assembleContext)
  } catch (err) {
    errors.push(`precompute: ${(err as Error).message}`)
  }

  if (errors.length) {
    throw new Error(`Morning assembly partial failure — ${errors.join('; ')}`)
  }
}
