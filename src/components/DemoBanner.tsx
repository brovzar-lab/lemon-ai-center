import { useAuthStore } from '@/stores/useAuthStore'
import { ArrowRight } from 'lucide-react'

export function DemoBanner() {
  const isDemo = useAuthStore((s) => s.isDemo)
  if (!isDemo) return null

  return (
    <div className="w-full bg-sunken border-b border-line px-4 py-2 flex items-center justify-between">
      <span className="text-xs text-ink-3 font-sans">
        Demo data — sign in for live
      </span>
      <a
        href="/auth/google/start"
        className="text-xs font-sans font-medium text-accent hover:opacity-80 transition-opacity"
      >
        Sign in with Google <ArrowRight size={12} className="inline" />
      </a>
    </div>
  )
}
