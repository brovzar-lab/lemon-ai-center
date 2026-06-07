import { describe, expect, it } from 'vitest'
import { classifyTask } from './TasksEisenhower'
import type { Task } from '@shared/types'

const NOW = new Date('2026-05-09T12:00:00Z')

function task(partial: Partial<Task>): Task {
  return {
    id: 't',
    title: 'sample',
    bucket: 'orbit',
    done: false,
    source: 'manual',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...partial,
  }
}

describe('classifyTask', () => {
  it('routes done tasks to neither', () => {
    expect(classifyTask(task({ done: true, bucket: 'now' }), NOW)).toBe('neither')
  })

  it('routes "now" tasks to urgent + important', () => {
    expect(classifyTask(task({ bucket: 'now' }), NOW)).toBe('urgent_important')
  })

  it('routes "next" tasks to important · not urgent', () => {
    expect(classifyTask(task({ bucket: 'next' }), NOW)).toBe('important')
  })

  it('routes "orbit" tasks with no due date to neither', () => {
    expect(classifyTask(task({ bucket: 'orbit' }), NOW)).toBe('neither')
  })

  it('routes "orbit" tasks due in 12h to urgent · not important', () => {
    expect(
      classifyTask(
        task({ bucket: 'orbit', dueDate: new Date(NOW.getTime() + 12 * 3600_000).toISOString() }),
        NOW,
      ),
    ).toBe('urgent')
  })

  it('routes "next" tasks due in 6h to urgent + important', () => {
    expect(
      classifyTask(
        task({ bucket: 'next', dueDate: new Date(NOW.getTime() + 6 * 3600_000).toISOString() }),
        NOW,
      ),
    ).toBe('urgent_important')
  })
})
