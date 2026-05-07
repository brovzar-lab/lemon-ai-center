// Team members for delegation and capture auto-detect
export const TEAM = [
  { id: 'crisanto', name: 'Crisanto', email: 'crisanto@lemonfilms.com', role: 'Operations' },
  // TODO: expand team list
] as const

export type TeamMember = (typeof TEAM)[number]

// Verbs that indicate a "todo" capture kind
export const TODO_VERBS = [
  'call', 'send', 'finish', 'write', 'draft', 'review', 'check', 'approve',
  'schedule', 'update', 'fix', 'reply', 'follow', 'prepare', 'submit',
  'sign', 'read', 'email', 'book', 'cancel', 'set', 'confirm',
] as const

// Auto-detect capture kind from text
export function detectCaptureKind(text: string): 'todo' | 'idea' | 'delegate' {
  const trimmed = text.trim()
  if (trimmed.endsWith('?')) return 'idea'
  const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase() ?? ''
  if (TODO_VERBS.some((v) => firstWord === v)) return 'todo'
  const lower = trimmed.toLowerCase()
  if (TEAM.some((m) => lower.includes(m.name.toLowerCase()))) return 'delegate'
  return 'todo'
}

// Deep-link URL builders for citations
export function citationDeepLink(sourceType: string, sourceId: string): string | null {
  switch (sourceType) {
    case 'gmail':
      return `https://mail.google.com/mail/u/0/#inbox/${sourceId}`
    case 'calendar':
      return `https://calendar.google.com/calendar/event?eid=${sourceId}`
    case 'notion':
      // Notion page URLs use the block ID without dashes
      return `https://www.notion.so/${sourceId.replace(/-/g, '')}`
    case 'inferred':
      return null
    default:
      return null
  }
}
