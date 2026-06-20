import { useSparkStore } from '@/stores/useSparkStore'
import { ArrowRight } from 'lucide-react'
import { useUIStore } from '@/stores/useUIStore'

export function SparkCard() {
  const { text, loading, fetch } = useSparkStore()
  const setActiveContext = useUIStore((s) => s.setActiveContext)

  return (
    <div
      className="bg-surface border border-line rounded-xl p-5 flex flex-col justify-between min-h-[140px]"
      onMouseEnter={() => setActiveContext({ kind: 'spark', id: 'current' })}
      onMouseLeave={() => setActiveContext({ kind: null, id: null })}
    >
      <div>
        <h2 className="text-[10px] font-sans font-semibold text-ink-3 tracking-widest uppercase mb-3">Spark</h2>
        {loading ? (
          <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        ) : (
          <p className="font-display italic text-base text-ink leading-relaxed">{text}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => fetch()}
        className="mt-3 self-start text-[11px] font-sans text-ink-3 hover:text-accent transition-colors"
      >
        new spark <ArrowRight size={12} className="inline" />
      </button>
    </div>
  )
}
