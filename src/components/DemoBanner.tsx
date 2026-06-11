import { useAuthStore } from '@/stores/useAuthStore'
import { ArrowRight } from 'lucide-react'

export function DemoBanner() {
  const isDemo = useAuthStore((s) => s.isDemo)
  if (!isDemo) return null

  return (
    <div className="w-full bg-bg-elevated border-b border-border-medium px-4 py-2 flex items-center justify-between">
      <span className="text-xs text-text-tertiary font-body">
        Demo data — sign in for live
      </span>
      <a
        href="/auth/google/start"
        className="text-xs font-body font-medium text-accent-lemon hover:opacity-80 transition-opacity"
      >
        Sign in with Google <ArrowRight size={12} className="inline" />
      </a>
    </div>
  )
}
