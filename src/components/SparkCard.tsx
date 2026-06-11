import { useSparkStore } from '@/stores/useSparkStore'
import { ArrowRight } from 'lucide-react'
import { useUIStore } from '@/stores/useUIStore'

export function SparkCard() {
  const { text, loading, fetch } = useSparkStore()
  const setActiveContext = useUIStore((s) => s.setActiveContext)

  return (
    <div
      className="bg-bg-surface border border-border-soft rounded-xl p-5 flex flex-col justify-between min-h-[140px]"
      onMouseEnter={() => setActiveContext({ kind: 'spark', id: 'current' })}
      onMouseLeave={() => setActiveContext({ kind: null, id: null })}
    >
      <div>
        <h2 className="text-[10px] font-body font-semibold text-text-muted tracking-widest uppercase mb-3">Spark</h2>
        {loading ? (
          <div className="w-4 h-4 rounded-full border-2 border-accent-lemon border-t-transparent animate-spin" />
        ) : (
          <p className="font-display italic text-base text-text-primary leading-relaxed">{text}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => fetch()}
        className="mt-3 self-start text-[11px] font-body text-text-muted hover:text-accent-lemon transition-colors"
      >
        new spark <ArrowRight size={12} className="inline" />
      </button>
    </div>
  )
}
