import { useConnectionStore } from '@/stores/useConnectionStore'
import { AlertTriangle, ArrowRight } from 'lucide-react'

/**
 * Shown when the server reported REAUTH_REQUIRED (dead Google refresh token).
 * Without this, Gmail/Calendar panels would just sit empty or stale and the
 * user would never know to reconnect. Links to the OAuth flow, which reloads
 * the app and clears the flag.
 */
export function ReconnectBanner() {
  const reauthRequired = useConnectionStore((s) => s.reauthRequired)
  if (!reauthRequired) return null

  return (
    <div
      role="alert"
      className="w-full bg-sunken border-b border-line px-4 py-2 flex items-center justify-between gap-4"
    >
      <span className="text-xs text-ink font-sans flex items-center gap-2">
        <AlertTriangle size={13} className="text-error flex-shrink-0" aria-hidden />
        Google disconnected — inbox and calendar can’t update until you reconnect.
      </span>
      <a
        href="/auth/google/start"
        className="text-xs font-sans font-semibold text-accent hover:opacity-80 transition-opacity whitespace-nowrap"
      >
        Reconnect Google <ArrowRight size={12} className="inline" />
      </a>
    </div>
  )
}
