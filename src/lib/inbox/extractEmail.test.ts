import { describe, expect, test } from 'vitest'
import { extractEmail } from './extractEmail'

describe('extractEmail', () => {
  test('pulls the address out of a "Name <addr>" header', () => {
    expect(extractEmail('Ana Lopez <ana@gbm.com>', 'gbm.com')).toBe('ana@gbm.com')
  })
  test('returns a bare address unchanged', () => {
    expect(extractEmail('ana@gbm.com', 'gbm.com')).toBe('ana@gbm.com')
  })
  test('falls back to a dotted name @ domain when there is no address', () => {
    expect(extractEmail('Ana Lopez', 'gbm.com')).toBe('ana.lopez@gbm.com')
  })
})
