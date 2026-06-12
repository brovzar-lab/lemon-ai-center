import type { BurnoutDay } from '@shared/types'
import { BURNOUT } from './constants'

export interface BurnoutSignals {
  date: string
  meetingHours: number
  lateNightEmails: number
  weekendActive: boolean
  daysSinceBreak: number
  /** Total writing minutes over the trailing 7 days (0 = none all week). */
  writingMinutesWeek: number
}

/** Pure 0–100 burnout score. Higher = closer to the edge. */
export function scoreBurnout(s: BurnoutSignals): BurnoutDay {
  const raw =
    s.meetingHours * BURNOUT.MEETING_HOUR_WEIGHT +
    s.lateNightEmails * BURNOUT.LATE_NIGHT_EMAIL_WEIGHT +
    (s.weekendActive ? BURNOUT.WEEKEND_ACTIVITY_WEIGHT : 0) +
    s.daysSinceBreak * BURNOUT.DAYS_SINCE_BREAK_WEIGHT +
    (s.writingMinutesWeek === 0 ? BURNOUT.NO_WRITING_WEEK_WEIGHT : 0)

  return {
    date: s.date,
    meetingHours: s.meetingHours,
    lateNightEmails: s.lateNightEmails,
    weekendActive: s.weekendActive,
    writingMinutes: s.writingMinutesWeek,
    daysSinceBreak: s.daysSinceBreak,
    score: Math.max(0, Math.min(100, Math.round(raw))),
  }
}
