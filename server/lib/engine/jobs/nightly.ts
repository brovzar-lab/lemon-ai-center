import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { db } from '../../firebase'
import { getGmailClient, getCalendarClient } from '../../googleAuth'
import { readTrackers, writeState, readSlips } from '../data'
import { scoreBurnout } from '../burnout'
import { committedMXN } from '../ranker'
import { todayISO, ENGINE_TZ, daysBetween } from '../constants'
import type { BurnoutDay } from '@shared/types'

/**
 * 23:00 — close the day:
 * 1. Refresh script lastTouchedAt from vault file activity
 * 2. Compute today's burnout metrics (calendar density, late-night email)
 * 3. Write the daily digest back into the Obsidian vault (git push if remote)
 */
export async function runNightly(uid: string): Promise<void> {
  const errors: string[] = []

  try {
    await refreshScriptTouches(uid)
  } catch (err) {
    errors.push(`scripts: ${(err as Error).message}`)
  }

  try {
    await computeBurnout(uid)
  } catch (err) {
    errors.push(`burnout: ${(err as Error).message}`)
  }

  try {
    await writeVaultDigest(uid)
  } catch (err) {
    errors.push(`vault digest: ${(err as Error).message}`)
  }

  if (errors.length) throw new Error(`Nightly partial failure — ${errors.join('; ')}`)
}

/** Update lastTouchedAt for scripts whose vault note moved since we last looked. */
async function refreshScriptTouches(uid: string): Promise<void> {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH
  if (!vaultPath) return

  const snap = await db.collection(`users/${uid}/scripts`).get()
  const updates: Promise<unknown>[] = []
  for (const doc of snap.docs) {
    const data = doc.data()
    if (!data.vaultPath) continue
    const filePath = path.join(vaultPath, data.vaultPath)
    try {
      const mtime = fs.statSync(filePath).mtime.toISOString()
      if (!data.lastTouchedAt || mtime > data.lastTouchedAt) {
        updates.push(doc.ref.update({ lastTouchedAt: mtime }))
      }
    } catch {
      // Note missing/renamed in vault — leave manual value alone
    }
  }
  await Promise.all(updates)
}

function hourInTz(date: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ENGINE_TZ,
      hour: 'numeric',
      hour12: false,
    }).format(date),
  )
}

async function computeBurnout(uid: string): Promise<BurnoutDay> {
  const date = todayISO()
  const now = new Date()

  // ── Meeting hours today (timed events only) ──
  let meetingHours = 0
  try {
    const calendar = await getCalendarClient(uid)
    const dayStart = new Date(`${date}T00:00:00`)
    const dayEnd = new Date(`${date}T23:59:59`)
    const events = await calendar.events.list({
      calendarId: 'primary',
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      maxResults: 50,
    })
    for (const e of events.data.items ?? []) {
      if (!e.start?.dateTime || !e.end?.dateTime) continue // skip all-day
      const ms = new Date(e.end.dateTime).getTime() - new Date(e.start.dateTime).getTime()
      if (ms > 0) meetingHours += ms / 3_600_000
    }
    meetingHours = Math.round(meetingHours * 10) / 10
  } catch (err) {
    console.warn('[nightly] Calendar read failed:', (err as Error).message)
  }

  // ── Late-night sent emails (22:00–06:00 in CDMX) ──
  let lateNightEmails = 0
  let sentToday = 0
  try {
    const gmail = await getGmailClient(uid)
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:sent newer_than:1d',
      maxResults: 25,
    })
    const ids = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean)
    sentToday = ids.length
    const dates = await Promise.allSettled(
      ids.map(async (id) => {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['Date'],
        })
        const header = msg.data.payload?.headers?.find((h) => h.name === 'Date')
        return header?.value ? new Date(header.value) : null
      }),
    )
    for (const r of dates) {
      if (r.status !== 'fulfilled' || !r.value || Number.isNaN(r.value.getTime())) continue
      const hour = hourInTz(r.value)
      if (hour >= 22 || hour < 6) lateNightEmails++
    }
  } catch (err) {
    console.warn('[nightly] Gmail sent read failed:', (err as Error).message)
  }

  const dow = new Intl.DateTimeFormat('en-US', { timeZone: ENGINE_TZ, weekday: 'short' }).format(now)
  const isWeekend = dow === 'Sat' || dow === 'Sun'
  const weekendActive = isWeekend && (meetingHours > 0 || sentToday > 0)

  // ── History-derived signals ──
  const historySnap = await db
    .collection(`users/${uid}/burnout_days`)
    .orderBy('date', 'desc')
    .limit(14)
    .get()
  const history = historySnap.docs.map((d) => d.data() as BurnoutDay).filter((d) => d.date !== date)

  const workedToday = meetingHours > 1 || lateNightEmails > 0 || sentToday > 3
  let daysSinceBreak = workedToday ? 1 : 0
  if (workedToday) {
    for (const day of history) {
      if (day.meetingHours > 1 || day.lateNightEmails > 0) daysSinceBreak++
      else break
    }
  }

  // Writing proxy: scripts touched in the trailing 7 days ≈ 60 min each
  const trackers = await readTrackers(uid)
  const touchedThisWeek = trackers.scripts.filter(
    (s) => s.lastTouchedAt && daysBetween(s.lastTouchedAt, now) <= 7,
  ).length
  const writingMinutesWeek = touchedThisWeek * 60

  const day = scoreBurnout({
    date,
    meetingHours,
    lateNightEmails,
    weekendActive,
    daysSinceBreak,
    writingMinutesWeek,
  })

  const trend = [...history.slice(0, 6).map((d) => d.score).reverse(), day.score]

  await Promise.all([
    db.doc(`users/${uid}/burnout_days/${date}`).set(day),
    writeState(uid, 'burnout', { ...day, trend }),
  ])
  return day
}

/** Daily digest written back into the vault — the dashboard contributes to the brain. */
async function writeVaultDigest(uid: string): Promise<void> {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH
  if (!vaultPath || !fs.existsSync(vaultPath)) return

  const date = todayISO()
  const [trackers, slips] = await Promise.all([readTrackers(uid), readSlips(uid)])
  const target = trackers.fundState?.targetMXN ?? 300_000_000
  const committed = committedMXN(trackers.investors)
  const pct = target ? Math.round((committed / target) * 100) : 0

  const lines: string[] = [
    '---',
    `title: Dashboard digest ${date}`,
    'type: dashboard-digest',
    `date-created: ${date}`,
    '---',
    '',
    `# Dashboard digest — ${date}`,
    '',
    `## Fund`,
    `- Lemon Trust I: ${Math.round(committed / 1e6)}M / ${Math.round(target / 1e6)}M MXN (${pct}%)`,
    ...trackers.investors
      .filter((i) => i.stage !== 'passed')
      .map((i) => `- ${i.name}: ${i.stage}${i.nextAction ? ` — next: ${i.nextAction}` : ''}`),
    '',
    `## Scripts`,
    ...trackers.scripts.map(
      (s) =>
        `- ${s.title}: ${s.stage}${s.draftNumber ? ` ${s.draftNumber}` : ''}${s.lastTouchedAt ? ` (touched ${s.lastTouchedAt.slice(0, 10)})` : ''}`,
    ),
    '',
    `## Slipping`,
    ...(slips.length ? slips.map((s) => `- [${s.severity}] ${s.summary}`) : ['- Nothing slipping today']),
    '',
    trackers.burnout ? `## You\n- Burnout ${trackers.burnout.score}/100` : '',
  ]

  const digestDir = path.join(vaultPath, 'Jarvis', 'dashboard')
  fs.mkdirSync(digestDir, { recursive: true })
  fs.writeFileSync(path.join(digestDir, `${date}.md`), lines.filter(Boolean).join('\n'), 'utf-8')

  // Push to the vault remote when one is configured (Railway). Local vaults just keep the file.
  if (process.env.OBSIDIAN_VAULT_GIT_URL) {
    exec(
      `git add Jarvis/dashboard && git commit -m "dashboard digest ${date}" --quiet && git push --quiet`,
      { cwd: vaultPath, timeout: 60_000 },
      (err) => {
        if (err) console.warn('[nightly] Vault digest push failed:', err.message)
      },
    )
  }
}
