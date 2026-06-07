import { describe, expect, it } from 'vitest'
import {
  detectSlippingThreads,
  detectOverdueDelegations,
  detectStallingDeals,
} from './slipDetection'
import type {
  InboxThread,
  LemonDeal,
  LemonDelegation,
  LemonProject,
} from '@shared/types'

const NOW = new Date('2026-05-09T12:00:00Z')

function thread(partial: Partial<InboxThread>): InboxThread {
  return {
    id: 'thread',
    subject: 'subject',
    from: 'Someone',
    fromDomain: 'example.com',
    snippet: 'snippet',
    unread: true,
    receivedAt: NOW.toISOString(),
    tag: 'NONE',
    priority: 'LOW',
    ...partial,
  }
}

function deal(partial: Partial<LemonDeal>): LemonDeal {
  return {
    id: 'deal',
    name: 'Distribution deal',
    status: 'active',
    ...partial,
  }
}

function project(partial: Partial<LemonProject>): LemonProject {
  return {
    id: 'project',
    title: 'The Quiet Year',
    category: 'development',
    ...partial,
  }
}

function delegation(partial: Partial<LemonDelegation>): LemonDelegation {
  return {
    id: 'delegation',
    person: 'Lara',
    task: 'Send contract',
    status: 'pending',
    ...partial,
  }
}

describe('detectSlippingThreads', () => {
  it('flags HOT threads older than 48h as awaiting reply', () => {
    const t = thread({
      id: 'a',
      priority: 'HOT',
      receivedAt: new Date(NOW.getTime() - 50 * 3600_000).toISOString(),
    })
    const slips = detectSlippingThreads([t], [], [], NOW)
    expect(slips).toHaveLength(1)
    expect(slips[0]).toMatchObject({ threadId: 'a', reason: 'awaiting_reply' })
  })

  it('does not flag HOT threads younger than 48h', () => {
    const t = thread({
      id: 'a',
      priority: 'HOT',
      receivedAt: new Date(NOW.getTime() - 30 * 3600_000).toISOString(),
    })
    expect(detectSlippingThreads([t], [], [], NOW)).toHaveLength(0)
  })

  it('flags MED threads older than 7 days', () => {
    const t = thread({
      id: 'a',
      priority: 'MED',
      receivedAt: new Date(NOW.getTime() - 8 * 86_400_000).toISOString(),
    })
    const slips = detectSlippingThreads([t], [], [], NOW)
    expect(slips).toHaveLength(1)
    expect(slips[0].reason).toBe('awaiting_reply')
  })

  it('does not flag MED threads younger than 7 days', () => {
    const t = thread({
      id: 'a',
      priority: 'MED',
      receivedAt: new Date(NOW.getTime() - 5 * 86_400_000).toISOString(),
    })
    expect(detectSlippingThreads([t], [], [], NOW)).toHaveLength(0)
  })

  it('matches threads to active deals by counterparty', () => {
    const t = thread({
      id: 'b',
      subject: 'Following up on the Netflix paperwork',
      priority: 'LOW',
    })
    const d = deal({ name: 'Output deal', counterparty: 'Netflix' })
    const slips = detectSlippingThreads([t], [d], [], NOW)
    expect(slips).toHaveLength(1)
    expect(slips[0]).toMatchObject({
      threadId: 'b',
      reason: 'tied_to_active_deal',
      linkedDealId: d.id,
    })
  })

  it('skips closed deals when matching by counterparty', () => {
    const t = thread({ subject: 'Netflix paperwork', priority: 'LOW' })
    const d = deal({ name: 'Output deal', counterparty: 'Netflix', status: 'closed' })
    expect(detectSlippingThreads([t], [d], [], NOW)).toHaveLength(0)
  })

  it('matches threads to active projects by title', () => {
    const t = thread({ subject: 'The Quiet Year — financier note', priority: 'LOW' })
    const p = project({ title: 'The Quiet Year' })
    const slips = detectSlippingThreads([t], [], [p], NOW)
    expect(slips).toHaveLength(1)
    expect(slips[0]).toMatchObject({
      reason: 'tied_to_active_project',
      linkedProjectId: p.id,
    })
  })

  it('sorts results oldest first', () => {
    const old = thread({
      id: 'old',
      priority: 'HOT',
      receivedAt: new Date(NOW.getTime() - 100 * 3600_000).toISOString(),
    })
    const newer = thread({
      id: 'newer',
      priority: 'HOT',
      receivedAt: new Date(NOW.getTime() - 60 * 3600_000).toISOString(),
    })
    const slips = detectSlippingThreads([newer, old], [], [], NOW)
    expect(slips.map((s) => s.threadId)).toEqual(['old', 'newer'])
  })

  it('does not match deal name on substring inside another word', () => {
    // "ACE" deal should NOT match a subject containing "place" or "race"
    const t = thread({ subject: 'Find a place to meet', priority: 'LOW' })
    const d = deal({ name: 'ACE deal', counterparty: 'ACE' })
    expect(detectSlippingThreads([t], [d], [], NOW)).toHaveLength(0)
  })

  it('does not match counterparty on partial domain', () => {
    // "amazon" counterparty should not match "amazonaws.com"
    const t = thread({ fromDomain: 'amazonaws.com', subject: 'AWS billing', priority: 'LOW' })
    const d = deal({ name: 'Amazon deal', counterparty: 'amazon' })
    expect(detectSlippingThreads([t], [d], [], NOW)).toHaveLength(0)
  })

  it('matches counterparty on exact subdomain', () => {
    const t = thread({ fromDomain: 'mail.netflix.com', subject: 'Following up', priority: 'LOW' })
    const d = deal({ name: 'Output deal', counterparty: 'netflix.com' })
    const slips = detectSlippingThreads([t], [d], [], NOW)
    expect(slips).toHaveLength(1)
    expect(slips[0].reason).toBe('tied_to_active_deal')
  })
})

describe('detectOverdueDelegations', () => {
  it('flags pending delegations whose expected_by has passed', () => {
    const d = delegation({
      expected_by: new Date(NOW.getTime() - 2 * 86_400_000).toISOString(),
    })
    expect(detectOverdueDelegations([d], NOW)).toHaveLength(1)
  })

  it('skips completed delegations', () => {
    const d = delegation({
      status: 'completed',
      expected_by: new Date(NOW.getTime() - 2 * 86_400_000).toISOString(),
    })
    expect(detectOverdueDelegations([d], NOW)).toHaveLength(0)
  })

  it('flags delegations with no expected_by older than 7 days', () => {
    const d = delegation({
      created_at: new Date(NOW.getTime() - 8 * 86_400_000).toISOString(),
    })
    expect(detectOverdueDelegations([d], NOW)).toHaveLength(1)
  })

  it('does not flag fresh pending delegations without expected_by', () => {
    const d = delegation({
      created_at: new Date(NOW.getTime() - 1 * 86_400_000).toISOString(),
    })
    expect(detectOverdueDelegations([d], NOW)).toHaveLength(0)
  })
})

describe('detectStallingDeals', () => {
  it('flags active deals with no next_action', () => {
    const d = deal({ name: 'Pending', next_action: '' })
    expect(detectStallingDeals([d], NOW)).toHaveLength(1)
  })

  it('flags active deals untouched > 7 days', () => {
    const d = deal({
      name: 'Stale',
      next_action: 'send draft',
      updated_at: new Date(NOW.getTime() - 9 * 86_400_000).toISOString(),
    })
    expect(detectStallingDeals([d], NOW)).toHaveLength(1)
  })

  it('does not flag healthy deals', () => {
    const d = deal({
      name: 'Hot',
      next_action: 'follow up tomorrow',
      updated_at: new Date(NOW.getTime() - 1 * 86_400_000).toISOString(),
    })
    expect(detectStallingDeals([d], NOW)).toHaveLength(0)
  })

  it('skips closed deals', () => {
    const d = deal({ name: 'Done', status: 'closed', next_action: '' })
    expect(detectStallingDeals([d], NOW)).toHaveLength(0)
  })
})
