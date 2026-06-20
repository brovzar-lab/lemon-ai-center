import { useFocusModeStore } from '@/stores/useFocusModeStore'
import { useRoughMorningStore } from '@/stores/useRoughMorningStore'
import { useInboxStore } from '@/stores/useInboxStore'
import { useTaskStore } from '@/stores/useTaskStore'
import { useDealsStore } from '@/stores/lemon/useDealsStore'
import { useProjectsStore } from '@/stores/lemon/useProjectsStore'
import { useLemonDelegationsStore } from '@/stores/lemon/useLemonDelegationsStore'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { useViewStore } from '@/stores/useViewStore'
import { useAuthStore } from '@/stores/useAuthStore'
import {
  detectSlippingThreads,
  detectOverdueDelegations,
  detectStallingDeals,
} from '@/lib/inbox/slipDetection'

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function EditorialMasthead() {
  const focusActive = useFocusModeStore((s) => s.active)
  const focusToggle = useFocusModeStore((s) => s.toggle)
  const roughActive = useRoughMorningStore((s) => s.active)
  const roughToggle = useRoughMorningStore((s) => s.toggle)
  const threads = useInboxStore((s) => s.threads)
  const tasks = useTaskStore((s) => s.tasks)
  const deals = useDealsStore((s) => s.deals)
  const projects = useProjectsStore((s) => s.projects)
  const delegations = useLemonDelegationsStore((s) => s.delegations)
  const { opsViews } = useFeatureFlags()
  const setView = useViewStore((s) => s.setView)
  const authUser = useAuthStore((s) => s.user)

  const slipCount =
    detectSlippingThreads(threads, deals, projects).length +
    detectOverdueDelegations(delegations).length +
    detectStallingDeals(deals).length

  const today = new Date()
  const doneCount = tasks.filter((t) => t.done).length

  // Volume number: day of year
  const startOfYear = new Date(today.getFullYear(), 0, 0)
  const diff = today.getTime() - startOfYear.getTime()
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24))

  const timeStr = today.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false })

  // Extract city name from timezone (e.g., 'America/Mexico_City' -> 'Mexico City')
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
      <p className="text-[10px] font-sans font-bold uppercase tracking-[0.3em] text-ink-3 mb-3">
        Vol {dayOfYear} · {DAYS_SHORT[today.getDay()]} {MONTHS_SHORT[today.getMonth()]} {today.getDate()} · {tzCity} {timeStr} · {threads.length} emails read
      </p>

      {/* Double rule */}
      <div className="ed-rule-double mb-4" />

      {/* Title row */}
      <div className="flex items-end justify-between gap-6 mb-1">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold text-ink tracking-tight leading-none">
            Executive Briefing
          </h1>
          <p className="font-display text-sm italic text-ink-3 mt-1">
            By your chief of staff · for {authUser?.displayName || 'CEO'}
          </p>
        </div>

        <div className="flex items-center gap-4 pb-1">
          {/* Stats */}
          <div className="text-right">
            <span className="font-display text-3xl font-semibold text-ink leading-none">{doneCount}</span>
            <p className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-ink-3 mt-0.5">Shipped</p>
          </div>
          <div className="text-right">
            <span className="font-display text-3xl font-semibold text-ink leading-none">
              {(() => {
                const mins = useFocusModeStore.getState().totalFocusMinutes()
                const h = Math.floor(mins / 60)
                const m = mins % 60
                return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}` : `${m}m`
              })()}
            </span>
            <p className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-ink-3 mt-0.5">Focus</p>
          </div>

          {/* Mode pills */}
          <div className="flex items-center gap-2 ml-4">
            {opsViews && slipCount > 0 && (
              <button
                type="button"
                onClick={() => setView('inbox')}
                className="text-[10px] font-sans font-bold uppercase tracking-[0.15em] px-3 py-1.5 rounded-full border bg-data-coral/15 text-data-coral border-data-coral/30 hover:bg-data-coral/25 transition-colors min-h-[36px]"
                aria-label={`${slipCount} items at risk — open Inbox Intel`}
              >
                ● {slipCount} at risk
              </button>
            )}
            <button
              type="button"
              onClick={roughToggle}
              className={[
                'text-[10px] font-sans font-bold uppercase tracking-[0.15em] px-3 py-1.5 rounded-full border transition-all min-h-[36px]',
                roughActive
                  ? 'bg-data-coral/15 text-data-coral border-data-coral/30'
                  : 'text-ink-3 border-line hover:border-accent hover:text-ink-2',
              ].join(' ')}
              aria-label={roughActive ? 'Deactivate rough morning mode' : 'Activate rough morning mode'}
              aria-pressed={roughActive}
            >
              Rough Morning
            </button>
            <button
              type="button"
              onClick={() => focusToggle()}
              className={[
                'text-[10px] font-sans font-bold uppercase tracking-[0.15em] px-3 py-1.5 rounded-full border transition-all min-h-[36px]',
                focusActive
                  ? 'bg-ink text-bg border-ink'
                  : 'text-ink-3 border-line hover:border-accent hover:text-ink-2',
              ].join(' ')}
              aria-label={focusActive ? 'Exit single-task focus mode' : 'Enter single-task focus mode'}
              aria-pressed={focusActive}
            >
              ● Single-Task Mode [F]
            </button>
          </div>
        </div>
      </div>

      {/* Double rule */}
      <div className="ed-rule-double mt-4" />
    </header>
  )
}
