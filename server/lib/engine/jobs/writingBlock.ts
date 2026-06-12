import { db } from '../../firebase'
import { readSlips } from '../data'
import { todayISO } from '../constants'

/**
 * Writing protection (spec §8): when a script has gone stale, propose a
 * protected writing block for tomorrow morning. Calendar is outward-facing,
 * so this queues an approval — Billy taps once in the Spine to create it.
 */
export async function proposeWritingBlock(uid: string): Promise<void> {
  const slips = await readSlips(uid)
  const scriptSlip = slips.find((s) => s.kind === 'script')
  if (!scriptSlip) return

  // One pending proposal at a time
  const pending = await db
    .collection(`users/${uid}/actions`)
    .where('approvalStatus', '==', 'pending')
    .get()
  if (pending.docs.some((d) => d.data().type === 'calendar_block')) return

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const date = tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
  const title = `Writing block — ${scriptSlip.summary.split(' untouched')[0]}`
  const now = new Date()

  await db.collection(`users/${uid}/actions`).add({
    type: 'calendar_block',
    target: { kind: 'event', id: '', label: title },
    confidence: 'med',
    initiator: 'ai',
    reversible: true,
    undone: false,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 3_600_000).toISOString(),
    approvalStatus: 'pending',
    payload: { date, startHour: 9, endHour: 11, title, reason: scriptSlip.summary },
  })
  console.log(`[writing-block] Proposed: ${title} on ${date} (${todayISO()})`)
}
