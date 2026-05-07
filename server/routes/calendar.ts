import { Router } from 'express'
import { getCalendarClient } from '../lib/googleAuth'
import { requireAuth } from '../middleware/requireAuth'
import { calendarLimit } from '../middleware/rateLimit'
import type { MeetingEvent } from '@shared/types'

export const calendarRouter = Router()
calendarRouter.use(requireAuth)

calendarRouter.get('/events', calendarLimit, async (req, res) => {
  const uid = req.session.uid!
  try {
    const calendar = await getCalendarClient(uid)
    const now = new Date()
    const endOfTomorrow = new Date(now)
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 2)
    endOfTomorrow.setHours(23, 59, 59, 999)

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: endOfTomorrow.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    })

    const items = response.data.items ?? []

    // Filter: only show events with "BR" in title (Billy Rovzar's meetings)
    // Per briefing-rules.md: "only flag events with 'BR' in the title"
    const brEvents = items.filter((item: any) => {
      const title = (item.summary || '').toUpperCase()
      return title.includes('BR')
    })

    const events: MeetingEvent[] = brEvents.map((item: any) => ({
      id: item.id,
      title: item.summary || '(No title)',
      start: item.start?.dateTime || item.start?.date || '',
      end: item.end?.dateTime || item.end?.date || '',
      attendees: (item.attendees ?? []).map((a: any) => a.email),
      isRequired: true, // All BR events are required
      location: item.location,
      description: item.description,
      meetLink: item.hangoutLink,
    }))

    res.json({ data: events })
  } catch (err: any) {
    if (err.code === 403) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Calendar access denied', retryable: false } })
    }
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Calendar unavailable', retryable: true } })
  }
})

calendarRouter.get('/events/:id', calendarLimit, async (req, res) => {
  const uid = req.session.uid!
  try {
    const calendar = await getCalendarClient(uid)
    const event = await calendar.events.get({ calendarId: 'primary', eventId: req.params.id })
    res.json({ data: event.data })
  } catch {
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Event not found', retryable: false } })
  }
})
