// A thread "owes a reply" when its latest message is inbound — i.e. the
// latest From address is not the user's own address.
export function threadOwesReply(latestFrom: string, selfEmail: string): boolean {
  const match = latestFrom.match(/<([^>]+)>/)
  const addr = (match?.[1] ?? latestFrom).trim().toLowerCase()
  return addr !== selfEmail.trim().toLowerCase()
}
