import { useTodayStore } from '@/stores/useTodayStore'
import type { EnrichedFlag } from '@/stores/useTodayStore'

function FlagCard({ flag, onLog }: { flag: EnrichedFlag; onLog: () => void }) {
  const isReappearing = flag.flagType === 'reappearing'

  return (
    <div
      className={`flex items-start gap-3 group -mx-2 px-2 py-2 rounded transition-colors hover:bg-sunken/50 ${isReappearing ? 'bg-data-coral/8' : ''}`}
    >
      {/* Avatar placeholder */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sunken border border-line flex items-center justify-center text-[12px] font-sans font-semibold text-ink-2 mt-0.5">
        {flag.personName.charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-sans text-[13px] font-semibold text-ink truncate">
            {flag.personName}
          </span>
          {isReappearing && (
            <span className="inline-flex items-center px-1.5 py-0.5 text-[8px] font-sans font-bold uppercase tracking-wider text-data-coral bg-data-coral/10 border border-data-coral/20 rounded">
              Reappeared
            </span>
          )}
          {flag.daysSince > 0 && (
            <span
              className={`text-[10px] font-sans ${
                flag.daysSince > 60
                  ? 'text-data-coral'
                  : flag.daysSince > 30
                    ? 'text-accent'
                    : 'text-ink-3'
              }`}
            >
              {flag.daysSince}d
            </span>
          )}
        </div>

        <p className="font-sans text-[12px] text-ink-2 mt-0.5 leading-relaxed">
          {flag.contextLine}
        </p>

        {flag.reappearSubject && (
          <p className="font-sans text-[10px] text-data-coral/70 mt-0.5 italic truncate">
            Re: {flag.reappearSubject}
          </p>
        )}

        {/* Log interaction button — appears on hover */}
        <button
          onClick={onLog}
          className="mt-1 text-[10px] font-sans text-ink-3 hover:text-accent transition-colors opacity-0 group-hover:opacity-100"
        >
          ✓ Log interaction
        </button>
      </div>
    </div>
  )
}

export function RelationshipPanel() {
  const { enrichedFlags, logInteraction } = useTodayStore()

  if (!enrichedFlags.length) return null

  return (
    <section aria-label="Relationship flags" className="pb-4">
      <div className="ed-section-label mb-3 flex items-center gap-2">
        <span className="text-ink-3">👤</span>
        <span>Relationships</span>
        <span className="text-[10px] font-sans text-ink-3 ml-auto">
          {enrichedFlags.length} flag{enrichedFlags.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-1">
        {enrichedFlags.map((flag) => (
          <FlagCard
            key={flag.personSlug}
            flag={flag}
            onLog={() => logInteraction(flag.personSlug)}
          />
        ))}
      </div>

      <hr className="ed-rule mt-4" />
    </section>
  )
}
