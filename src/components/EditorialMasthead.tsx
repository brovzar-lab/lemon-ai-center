import { useInboxStore } from '@/stores/useInboxStore'
import { useTaskStore } from '@/stores/useTaskStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useCalendarStore } from '@/stores/useCalendarStore'

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function useHeadline(): string {
  const threads = useInboxStore((s) => s.threads)
  const tasks = useTaskStore((s) => s.tasks)
  const authUser = useAuthStore((s) => s.user)
  const events = useCalendarStore((s) => s.events)

  const firstName = authUser?.displayName?.split(' ')[0] || 'Boss'
  const now = new Date()
  const hour = now.getHours()
  const day = now.getDay()
  const isWeekend = day === 0 || day === 6

  const urgentThreads = threads.filter((t) => {
    if (!t.receivedAt) return false
    const age = Date.now() - new Date(t.receivedAt).getTime()
    return age > 24 * 60 * 60 * 1000
  }).length

  const pendingTasks = tasks.filter((t) => !t.done).length

  // Next meeting within 3 hours
  const soonEvent = events?.find((e) => {
    const start = new Date(e.start).getTime()
    return start > Date.now() && start - Date.now() < 3 * 60 * 60 * 1000
  })

  // Build contextual headline
  if (soonEvent) {
    const mins = Math.round((new Date(soonEvent.start).getTime() - Date.now()) / 60000)
    const timeStr = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
    return `${soonEvent.title || 'Meeting'} in ${timeStr}`
  }

  if (hour >= 5 && hour < 12) {
    if (isWeekend && urgentThreads === 0) return `${DAYS_SHORT[day]} morning — inbox is light`
    if (urgentThreads > 0) return `Good morning, ${firstName} — ${urgentThreads} threads need you`
    if (pendingTasks > 3) return `Good morning — ${pendingTasks} tasks on your plate`
    return `Good morning, ${firstName}`
  }

  if (hour >= 12 && hour < 17) {
    if (urgentThreads > 0) return `Afternoon wire — ${urgentThreads} threads awaiting reply`
    if (pendingTasks === 0) return `Quiet afternoon — deep work time`
    return `The afternoon wire`
  }

  // Evening / night
  if (urgentThreads === 0 && pendingTasks <= 2) return `End of day — nothing urgent`
  if (urgentThreads > 0) return `Evening check — ${urgentThreads} still pending`
  return `End of day — ${pendingTasks} tasks remain`
}

export function EditorialMasthead() {
  const threads = useInboxStore((s) => s.threads)
  const headline = useHeadline()

  const today = new Date()
  const startOfYear = new Date(today.getFullYear(), 0, 0)
  const diff = today.getTime() - startOfYear.getTime()
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24))

  const timeStr = today.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false })

  const tzCity = (() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      return tz.split('/').pop()?.replace(/_/g, ' ') ?? 'Local'
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

      {/* Dynamic headline */}
      <h1 className="font-display text-3xl sm:text-4xl font-semibold text-ink tracking-tight leading-tight">
        {headline}
      </h1>

      {/* Double rule */}
      <div className="ed-rule-double mt-4" />
    </header>
  )
}
