import { describe, expect, test, beforeEach, vi } from 'vitest'
import { useBriefStore } from '../stores/useBriefStore'
import { seeds } from '../data/seeds'

describe('useBriefStore', () => {
  beforeEach(() => {
    useBriefStore.setState({
      jarvis: seeds.brief.jarvis,
      billy: seeds.brief.billy,
      isStale: false,
      isStreaming: false,
      generatedAt: null,
      briefId: null,
    })
  })

  test('initial state has seed brief text', () => {
    const { jarvis, billy } = useBriefStore.getState()
    expect(jarvis).toBe(seeds.brief.jarvis)
    expect(billy).toBe(seeds.brief.billy)
  })

  test('beginStream sets isStreaming=true and isStale=true', () => {
    useBriefStore.getState().beginStream()
    const { isStreaming, isStale } = useBriefStore.getState()
    expect(isStreaming).toBe(true)
    expect(isStale).toBe(true)
  })

  test('setCached updates brief text while streaming remains true', () => {
    useBriefStore.getState().beginStream()
    useBriefStore.getState().setCached({ jarvis: 'stale-j', billy: 'stale-b', generatedAt: '2026-04-27T00:00:00Z' })
    const { jarvis, billy, isStreaming, isStale } = useBriefStore.getState()
    expect(jarvis).toBe('stale-j')
    expect(billy).toBe('stale-b')
    expect(isStreaming).toBe(true)
    expect(isStale).toBe(true)
  })

  test('appendToken accumulates text for the correct voice', () => {
    useBriefStore.getState().beginStream()
    useBriefStore.getState().setCached({ jarvis: '', billy: '' })
    useBriefStore.getState().appendToken('jarvis', 'Good ')
    useBriefStore.getState().appendToken('jarvis', 'morning.')
    expect(useBriefStore.getState().jarvis).toBe('Good morning.')
  })

  test('completeStream sets isStreaming=false and isStale=false', () => {
    useBriefStore.getState().beginStream()
    useBriefStore.getState().completeStream({ jarvis: 'j', billy: 'b', generatedAt: '2026-04-28T00:00:00Z', briefId: 'abc' })
    const { isStreaming, isStale, briefId } = useBriefStore.getState()
    expect(isStreaming).toBe(false)
    expect(isStale).toBe(false)
    expect(briefId).toBe('abc')
  })

  test('revertToLast clears streaming and stale flags', () => {
    useBriefStore.getState().beginStream()
    useBriefStore.getState().revertToLast()
    const { isStreaming, isStale } = useBriefStore.getState()
    expect(isStreaming).toBe(false)
    expect(isStale).toBe(false)
  })
})
