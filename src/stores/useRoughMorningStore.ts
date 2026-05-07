import { create } from 'zustand'

interface RoughMorningState {
  active: boolean
  toggle: () => void
  dismiss: () => void
}

/** Pure UI store — no Firestore. Phase 7 implements the overlay. */
export const useRoughMorningStore = create<RoughMorningState>()((set) => ({
  active: false,

  toggle: () => set((s) => ({ active: !s.active })),

  dismiss: () => set({ active: false }),
}))
