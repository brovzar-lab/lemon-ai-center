import { create } from 'zustand'
import { startBriefStream } from '@/lib/briefStream'
import type { Claim, DecisionOption } from '@shared/types'

interface BriefState {
  jarvis: string
  billy: string
  isStale: boolean
  isStreaming: boolean
  generatedAt: string | null
  briefId: string | null
  // Editorial redesign fields
  overview: Claim[] | null
  oneThing: (Claim & { why: string }) | null
  longBrief: string | null
  decisionOptions: DecisionOption[] | null
  soulNote: string | null
  degraded: boolean

  beginStream: () => void
  setCached: (brief: { jarvis: string; billy: string; generatedAt?: string; isDemo?: boolean; overview?: Claim[]; oneThing?: (Claim & { why: string }); longBrief?: string; decisionOptions?: DecisionOption[]; soulNote?: string }) => void
  setOverview: (overview: Claim[]) => void
  setOneThing: (oneThing: Claim & { why: string }) => void
  setDecisionOptions: (options: DecisionOption[]) => void
  setSoulNote: (note: string) => void
  setDegraded: (degraded: boolean) => void
  appendToken: (voice: 'jarvis' | 'billy', text: string) => void
  completeStream: (brief: { jarvis: string; billy: string; generatedAt: string; briefId: string; overview?: Claim[]; oneThing?: (Claim & { why: string }); longBrief?: string; decisionOptions?: DecisionOption[]; soulNote?: string; degraded?: boolean }) => void
  revertToLast: () => void
  refresh: (forceRefresh?: boolean) => () => void
}

export const useBriefStore = create<BriefState>()((set, get) => ({
  // FIX 5: Initialize with EMPTY state — no seed data
  jarvis: '',
  billy: '',
  isStale: false,
  isStreaming: false,
  generatedAt: null,
  briefId: null,
  overview: null,
  oneThing: null,
  longBrief: null,
  decisionOptions: null,
  soulNote: null,
  degraded: false,

  beginStream: () => set({ isStreaming: true, isStale: true, degraded: false }),

  setCached: (brief) =>
    set({
      jarvis: brief.jarvis,
      billy: brief.billy,
      generatedAt: brief.generatedAt ?? null,
      isStale: true,
      // Graceful fallback: only set if present (old briefs won't have these)
      overview: brief.overview ?? get().overview,
      oneThing: brief.oneThing ?? get().oneThing,
      longBrief: brief.longBrief ?? get().longBrief,
      decisionOptions: brief.decisionOptions ?? get().decisionOptions,
      soulNote: brief.soulNote ?? get().soulNote,
    }),

  setOverview: (overview) => set({ overview }),

  setOneThing: (oneThing) => set({ oneThing }),

  setDecisionOptions: (options) => set({ decisionOptions: options }),

  setSoulNote: (note) => set({ soulNote: note }),

  setDegraded: (degraded) => set({ degraded }),

  appendToken: (voice, text) =>
    set((s) =>
      voice === 'jarvis'
        ? { jarvis: s.jarvis + text }
        : { billy: s.billy + text },
    ),

  completeStream: (brief) =>
    set({
      jarvis: brief.jarvis,
      billy: brief.billy,
      generatedAt: brief.generatedAt,
      briefId: brief.briefId,
      isStreaming: false,
      isStale: false,
      overview: brief.overview ?? get().overview,
      oneThing: brief.oneThing ?? get().oneThing,
      longBrief: brief.longBrief ?? get().longBrief,
      decisionOptions: brief.decisionOptions ?? get().decisionOptions,
      soulNote: brief.soulNote ?? get().soulNote,
      degraded: brief.degraded ?? false,
    }),

  revertToLast: () => {
    set({ isStreaming: false })
  },

  refresh: (forceRefresh = false) => {
    const { beginStream, setCached, setOverview, setOneThing, setDecisionOptions, setSoulNote, setDegraded, appendToken, completeStream, revertToLast } = get()
    beginStream()
    // Reset streaming buffers
    set({ jarvis: '', billy: '' })
    return startBriefStream(forceRefresh, {
      onCached: (e) => setCached({ jarvis: e.jarvis, billy: e.billy, generatedAt: e.generatedAt, overview: e.overview, oneThing: e.oneThing, longBrief: e.longBrief, decisionOptions: e.decisionOptions, soulNote: e.soulNote }),
      onOverview: (overview) => setOverview(overview),
      onOneThing: (oneThing) => setOneThing(oneThing),
      onDecisionOptions: (options) => setDecisionOptions(options),
      onSoulNote: (note) => setSoulNote(note),
      onDegraded: () => setDegraded(true),
      onToken: (voice, text) => appendToken(voice, text),
      onDone: (e) => completeStream({ jarvis: e.jarvis, billy: e.billy, generatedAt: e.generatedAt, briefId: e.briefId, overview: e.overview, oneThing: e.oneThing, longBrief: e.longBrief, decisionOptions: e.decisionOptions, soulNote: e.soulNote, degraded: e.degraded }),
      onError: () => revertToLast(),
    })
  },
}))
