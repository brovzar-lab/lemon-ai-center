import { create } from 'zustand'

/**
 * Tracks whether the server has told us the Google connection is dead
 * (REAUTH_REQUIRED). Set centrally by apiClient on any such response so the
 * whole app can surface one "Reconnect Google" banner instead of each panel
 * silently showing stale/empty data. Cleared naturally by the full-page
 * navigation of the reconnect (OAuth) flow.
 */
interface ConnectionState {
  reauthRequired: boolean
  setReauthRequired: (v: boolean) => void
}

export const useConnectionStore = create<ConnectionState>()((set) => ({
  reauthRequired: false,
  setReauthRequired: (v) => set({ reauthRequired: v }),
}))
