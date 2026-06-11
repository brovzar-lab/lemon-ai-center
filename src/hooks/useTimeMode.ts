/**
 * Time mode hook — returns the current work phase and greeting based on hour of day.
 * Used across components to display time-aware UI text.
 */

export type TimeMode =
  | 'morning-prep'
  | 'deep-work'
  | 'midday-pulse'
  | 'execution'
  | 'wrap-up'
  | 'evening-scan'

export function getTimeMode(hour?: number): TimeMode {
  const h = hour ?? new Date().getHours()
  if (h >= 6 && h < 9) return 'morning-prep'
  if (h >= 9 && h < 12) return 'deep-work'
  if (h >= 12 && h < 14) return 'midday-pulse'
  if (h >= 14 && h < 17) return 'execution'
  if (h >= 17 && h < 19) return 'wrap-up'
  return 'evening-scan'
}

export function getGreeting(hour?: number): string {
  const h = hour ?? new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function useTimeMode(): { mode: TimeMode; greeting: string } {
  const now = new Date().getHours()
  return {
    mode: getTimeMode(now),
    greeting: getGreeting(now),
  }
}
