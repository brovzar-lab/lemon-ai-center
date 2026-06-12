import Anthropic from '@anthropic-ai/sdk'
import { getCalendarClient } from '../../googleAuth'
import { readSlips, writeState } from '../data'
import { todayISO } from '../constants'
import { db } from '../../firebase'

/**
 * 18:00 — evening wrap: what happened today, what tomorrow looks like.
 * Powers the Spine's evening mode.
 */
export async function runEveningWrap(uid: string): Promise<void> {
  const date = todayISO()

  // Tasks completed today
  const tasksSnap = await db
    .collection(`users/${uid}/tasks`)
    .where('done', '==', true)
    .get()
  const doneToday = tasksSnap.docs
    .map((d) => d.data())
    .filter((t) => typeof t.doneAt === 'string' && t.doneAt.slice(0, 10) === date)
    .map((t) => String(t.title))

  // Tomorrow's calendar
  const tomorrowEvents: string[] = []
  try {
    const calendar = await getCalendarClient(uid)
    const start = new Date()
    start.setDate(start.getDate() + 1)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setHours(23, 59, 59, 999)
    const events = await calendar.events.list({
      calendarId: 'primary',
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 15,
    })
    for (const e of events.data.items ?? []) {
      const time = e.start?.dateTime
        ? new Date(e.start.dateTime).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/Mexico_City',
          })
        : 'all day'
      tomorrowEvents.push(`${time} — ${e.summary ?? 'Untitled'}`)
    }
  } catch (err) {
    console.warn('[evening-wrap] Calendar read failed:', (err as Error).message)
  }

  const slips = await readSlips(uid)
  const openCritical = slips.filter((s) => s.severity === 'critical').map((s) => s.summary)

  let summary = ''
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      system:
        'You write a 2-3 sentence end-of-day wrap for a CEO. Second person, calm, honest. Mention what got done and what is still hot. Use ONLY the provided facts. No markdown.',
      messages: [
        {
          role: 'user',
          content: `Completed today:\n${doneToday.length ? doneToday.map((t) => `- ${t}`).join('\n') : '- (nothing marked done)'}\n\nStill critical:\n${openCritical.length ? openCritical.map((s) => `- ${s}`).join('\n') : '- nothing critical'}\n\nTomorrow has ${tomorrowEvents.length} events.`,
        },
      ],
    })
    summary = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  } catch (err) {
    console.warn('[evening-wrap] Generation failed:', (err as Error).message)
    summary = `${doneToday.length} tasks done today. ${openCritical.length} critical items still open. ${tomorrowEvents.length} events tomorrow.`
  }

  await writeState(uid, 'eveningWrap', {
    date,
    summary,
    tomorrow: tomorrowEvents,
    generatedAt: new Date().toISOString(),
  })
}
