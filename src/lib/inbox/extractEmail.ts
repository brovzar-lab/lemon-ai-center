// Extract a real send-to address from a Gmail `From` header
// ("Ana Lopez <ana@gbm.com>" -> "ana@gbm.com"). Supersedes the inline
// logic previously in Dashboard (audit note M-6). Unlike that code, a
// bare address with no display name ("ana@gbm.com") returns as-is instead
// of the old doubled "ana@gbm.com@<domain>" fallback.
export function extractEmail(from: string, fromDomain: string): string {
  const match = from.match(/<([^>]+)>/)
  if (match?.[1]) return match[1]
  if (from.includes('@')) return from.trim()
  return `${from.toLowerCase().replace(/\s/g, '.')}@${fromDomain}`
}
