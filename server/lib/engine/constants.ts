/**
 * Engine tuning constants — every slip/burnout threshold lives here
 * so behavior is tunable in one place (spec §4).
 */

export const THRESHOLDS = {
  /** Active deal with no movement for this many days is stalled. */
  DEAL_STALL_DAYS: 7,
  /** Script untouched in the vault for this many days is stale. */
  SCRIPT_STALE_DAYS: 14,
  /** Deadlines within this many days produce a warn slip. */
  DEADLINE_WARN_DAYS: 30,
  /** Deadlines within this many days produce a critical slip. */
  DEADLINE_CRITICAL_DAYS: 7,
} as const

export const BURNOUT = {
  /** Points per meeting-hour in a day. */
  MEETING_HOUR_WEIGHT: 6,
  /** Points per email sent between 22:00 and 06:00. */
  LATE_NIGHT_EMAIL_WEIGHT: 5,
  /** Points added when there was work activity on a weekend day. */
  WEEKEND_ACTIVITY_WEIGHT: 10,
  /** Points per day since the last full day off. */
  DAYS_SINCE_BREAK_WEIGHT: 2,
  /** Points added when a whole week passed with zero writing minutes. */
  NO_WRITING_WEEK_WEIGHT: 15,
  /** Score at or above this is flagged to the Advisor. */
  ALERT_SCORE: 65,
} as const

/** Timezone every schedule and date computation uses. */
export const ENGINE_TZ = 'America/Mexico_City'

/** Today's YYYY-MM-DD in the engine timezone. */
export function todayISO(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: ENGINE_TZ })
}

export function daysBetween(fromISO: string, to: Date = new Date()): number {
  const from = new Date(fromISO).getTime()
  if (Number.isNaN(from)) return 0
  return Math.floor((to.getTime() - from) / 86_400_000)
}
