/**
 * Time mode hook — returns the current edition and greeting.
 *
 * Three editions match Billy's actual rhythm:
 *   morning (5 AM – 12 PM) — tactical: what do I do first?
 *   midday  (12 PM – 5 PM) — triage: what came in, what's coming up?
 *   evening (5 PM – 5 AM)  — strategic: what happened, what's tomorrow?
 */

export type Edition = 'morning' | 'midday' | 'evening'

/** @deprecated Use Edition instead */
export type TimeMode = Edition

export function getEdition(hour?: number): Edition {
  const h = hour ?? new Date().getHours()
  if (h >= 5 && h < 12) return 'morning'
  if (h >= 12 && h < 17) return 'midday'
  return 'evening'
}

/** @deprecated Use getEdition instead */
export const getTimeMode = getEdition

export function getGreeting(hour?: number): string {
  const h = hour ?? new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function useTimeMode(): { edition: Edition; mode: Edition; greeting: string } {
  const now = new Date().getHours()
  const edition = getEdition(now)
  return {
    edition,
    mode: edition, // backward compat
    greeting: getGreeting(now),
  }
}
