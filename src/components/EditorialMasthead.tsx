import { useAuthStore } from '@/stores/useAuthStore'
import { useTimeMode } from '@/hooks/useTimeMode'

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const EDITION_LABEL: Record<string, string> = {
  morning: 'Morning Edition',
  midday: 'Midday Edition',
  evening: 'Evening Edition',
}

/**
 * EditorialMasthead — clean, calm, editor's page aesthetic.
 *
 * Stripped down to: date/time, edition label, title.
 * No counters, no mode toggles — the editions handle all of that.
 */
export function EditorialMasthead() {
  const authUser = useAuthStore((s) => s.user)
  const { edition, greeting } = useTimeMode()

  const today = new Date()

  // Volume number: day of year
  const startOfYear = new Date(today.getFullYear(), 0, 0)
  const diff = today.getTime() - startOfYear.getTime()
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24))

  const timeStr = today.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false })

  // Extract city name from timezone
  const tzCity = (() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const city = tz.split('/').pop()?.replace(/_/g, ' ') ?? 'Local'
      return city
    } catch {
      return 'Local'
    }
  })()

  return (
    <header className="pt-6 pb-4">
      {/* Top stat line */}
      <p className="text-[10px] font-body font-bold uppercase tracking-[0.3em] text-text-muted mb-3">
        Vol {dayOfYear} · {DAYS_SHORT[today.getDay()]} {MONTHS_SHORT[today.getMonth()]} {today.getDate()} · {tzCity} {timeStr} · {EDITION_LABEL[edition] ?? 'Edition'}
      </p>

      {/* Double rule */}
      <div className="ed-rule-double mb-4" />

      {/* Title row */}
      <div className="flex items-end justify-between gap-6 mb-1">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold text-text-primary tracking-tight leading-none">
            Lemon AI Center
          </h1>
          <p className="font-display text-sm italic text-text-tertiary mt-1">
            {greeting}, {authUser?.displayName || 'Billy'}
          </p>
        </div>
      </div>

      {/* Double rule */}
      <div className="ed-rule-double mt-4" />
    </header>
  )
}
