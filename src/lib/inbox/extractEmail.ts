// Extract a real send-to address from a Gmail `From` header
// ("Ana Lopez <ana@gbm.com>" -> "ana@gbm.com"). Mirrors the original
// inline logic from Dashboard (audit note M-6).
export function extractEmail(from: string, fromDomain: string): string {
  const match = from.match(/<([^>]+)>/)
  if (match?.[1]) return match[1]
  if (from.includes('@')) return from.trim()
  return `${from.toLowerCase().replace(/\s/g, '.')}@${fromDomain}`
}
