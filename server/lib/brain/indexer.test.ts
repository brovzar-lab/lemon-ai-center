import { describe, expect, test } from 'vitest'
import { BrainIndex } from './indexer'
import type { BrainDocument } from './types'

function doc(path: string, plainText: string): BrainDocument {
  return {
    path,
    title: path,
    folder: 'wiki',
    frontmatter: {},
    content: plainText,
    plainText,
    sizeBytes: plainText.length,
    modifiedAt: '2026-07-01T00:00:00.000Z',
    links: [],
    chunks: [],
  }
}

describe('BrainIndex', () => {
  test('two documents whose paths collided under the old char-hash are each retrievable', () => {
    // "AB" and "B#" both hash to 2081 under the old ((h<<5)-h+c) id scheme
    // (65*31+66 === 66*31+35). Under that scheme one doc overwrote the other in
    // FlexSearch and the reverse lookup returned whichever path hashed first —
    // so a query for the second doc returned the WRONG document.
    const idx = new BrainIndex()
    idx.addDoc(doc('AB', 'alpha_unique_marker in the first note'))
    idx.addDoc(doc('B#', 'beta_unique_marker in the second note'))

    const beta = idx.search('beta_unique_marker')
    expect(beta.map((r) => r.path)).toContain('B#')
    expect(beta[0].path).toBe('B#') // not "AB"

    const alpha = idx.search('alpha_unique_marker')
    expect(alpha.map((r) => r.path)).toContain('AB') // first note not lost

    // Both are still independently retrievable by path
    expect(idx.getDoc('AB')?.plainText).toContain('alpha_unique_marker')
    expect(idx.getDoc('B#')?.plainText).toContain('beta_unique_marker')
    expect(idx.size).toBe(2)
  })

  test('add / update / remove roundtrip by path', () => {
    const idx = new BrainIndex()
    idx.addDoc(doc('wiki/a.md', 'first content zebra'))
    expect(idx.search('zebra')[0]?.path).toBe('wiki/a.md')

    // Update in place (same path) — old term no longer matches, new one does
    idx.addDoc(doc('wiki/a.md', 'replaced content giraffe'))
    expect(idx.search('zebra')).toHaveLength(0)
    expect(idx.search('giraffe')[0]?.path).toBe('wiki/a.md')
    expect(idx.size).toBe(1)

    // Remove
    idx.removeDoc('wiki/a.md')
    expect(idx.search('giraffe')).toHaveLength(0)
    expect(idx.getDoc('wiki/a.md')).toBeUndefined()
    expect(idx.size).toBe(0)
  })
})
