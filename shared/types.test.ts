import { expect, test } from 'vitest'
import type { Task, Decision, Brief, InboxThread, MeetingEvent, NotionBlock, SeedsData } from './types'

test('Task type has required fields', () => {
  const task: Task = {
    id: 't1',
    title: 'Test task',
    bucket: 'now',
    done: false,
    createdAt: '2026-04-28T00:00:00Z',
    updatedAt: '2026-04-28T00:00:00Z',
    source: 'manual',
  }
  expect(task.bucket).toBe('now')
  expect(task.done).toBe(false)
})

test('InboxThread type has tag and priority', () => {
  const thread: InboxThread = {
    id: 'th1',
    subject: 'Deal update',
    from: 'alex@creel.mx',
    fromDomain: 'creel.mx',
    snippet: 'Following up on the project',
    unread: true,
    receivedAt: '2026-04-28T10:00:00Z',
    tag: 'DEAL',
    priority: 'HOT',
  }
  expect(thread.tag).toBe('DEAL')
  expect(thread.priority).toBe('HOT')
})

test('SeedsData has isDemo true', () => {
  const seeds: SeedsData = {
    isDemo: true,
    tasks: [],
    decisions: [],
    brief: { jarvis: '', billy: '' },
    threads: [],
    meetings: [],
    notionBlocks: [],
    spark: '',
    captures: [],
  }
  expect(seeds.isDemo).toBe(true)
})
