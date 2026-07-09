import { describe, expect, test } from 'vitest'
import { threadOwesReply } from './replyOwed'

describe('threadOwesReply', () => {
  test('true when the latest message is from someone else', () => {
    expect(threadOwesReply('Ana <ana@gbm.com>', 'billy@lemonfilms.com')).toBe(true)
  })
  test('false when Billy sent the latest message', () => {
    expect(threadOwesReply('Billy Rovzar <billy@lemonfilms.com>', 'billy@lemonfilms.com')).toBe(false)
  })
  test('is case-insensitive on the address', () => {
    expect(threadOwesReply('BILLY@LEMONFILMS.COM', 'billy@lemonfilms.com')).toBe(false)
  })
})
