/** Feature flags read from Vite env vars. Used to gate new dashboard layout. */
export function useFeatureFlags() {
  return {
    newDashboard: import.meta.env.VITE_NEW_DASHBOARD === 'true',
    opsViews: import.meta.env.VITE_OPS_VIEWS === 'true',
  }
}
