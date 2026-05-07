import { create } from 'zustand'

interface FocusModeState {
  active: boolean
  focusedTaskId: string | null
  /** Accumulated focus minutes today */
  todayMinutes: number
  /** Timestamp when current focus session started (null if not active) */
  sessionStart: number | null
  toggle: (taskId?: string) => void
  exit: () => void
  /** Get current session's elapsed minutes + accumulated */
  totalFocusMinutes: () => number
}

// Persist today's accumulated focus to localStorage
const STORAGE_KEY = 'lemon-focus-minutes'
const todayKey = () => new Date().toISOString().slice(0, 10)

function loadToday(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return 0
    const data = JSON.parse(stored)
    if (data.date === todayKey()) return data.minutes
    return 0 // new day, reset
  } catch {
    return 0
  }
}

function saveToday(minutes: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: todayKey(), minutes }))
  } catch {
    // localStorage unavailable
  }
}

export const useFocusModeStore = create<FocusModeState>()((set, get) => ({
  active: false,
  focusedTaskId: null,
  todayMinutes: typeof localStorage !== 'undefined' ? loadToday() : 0,
  sessionStart: null,

  toggle: (taskId) =>
    set((s) => {
      if (s.active) {
        // Exiting focus mode — accumulate session time
        const elapsed = s.sessionStart ? Math.floor((Date.now() - s.sessionStart) / 60_000) : 0
        const newTotal = s.todayMinutes + elapsed
        saveToday(newTotal)
        return {
          active: false,
          focusedTaskId: null,
          sessionStart: null,
          todayMinutes: newTotal,
        }
      } else {
        // Entering focus mode
        return {
          active: true,
          focusedTaskId: taskId ?? s.focusedTaskId,
          sessionStart: Date.now(),
        }
      }
    }),

  exit: () =>
    set((s) => {
      const elapsed = s.sessionStart ? Math.floor((Date.now() - s.sessionStart) / 60_000) : 0
      const newTotal = s.todayMinutes + elapsed
      saveToday(newTotal)
      return {
        active: false,
        focusedTaskId: null,
        sessionStart: null,
        todayMinutes: newTotal,
      }
    }),

  totalFocusMinutes: () => {
    const { todayMinutes, sessionStart } = get()
    const currentSession = sessionStart ? Math.floor((Date.now() - sessionStart) / 60_000) : 0
    return todayMinutes + currentSession
  },
}))
