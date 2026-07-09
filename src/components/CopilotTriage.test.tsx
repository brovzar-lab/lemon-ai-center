import { describe, expect, test, beforeEach, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CopilotTriage } from './CopilotTriage'
import { useInboxStore } from '@/stores/useInboxStore'
import { useCopilotStore } from '@/stores/useCopilotStore'
import { generateDraftForThread } from '@/lib/copilot/draftClient'
import type { InboxThread } from '@shared/types'

vi.mock('@/lib/copilot/draftClient', () => ({
  generateDraftForThread: vi.fn().mockResolvedValue('Ready draft.'),
}))

const hot = (id: string): InboxThread => ({
  id, subject: `Subject ${id}`, from: `A${id} <a${id}@b.com>`, fromDomain: 'b.com',
  snippet: 'snippet', unread: true, receivedAt: '2026-07-08T00:00:00Z', tag: 'DEAL', priority: 'HOT',
})

beforeEach(() => {
  useInboxStore.setState({ threads: [hot('1'), hot('2'), { ...hot('3'), priority: 'LOW' }], loading: false, error: null })
  useCopilotStore.setState({ isOpen: false, index: 0, drafts: {}, pending: [] })
  // afterEach's restoreAllMocks() wipes the module-level mockResolvedValue below
  // (a bare vi.fn() has no "original" impl to restore to), so re-arm the default
  // here to keep tests order-independent.
  ;(generateDraftForThread as any).mockResolvedValue('Ready draft.')
})
afterEach(() => { vi.restoreAllMocks() })

describe('CopilotTriage', () => {
  test('renders nothing when closed', () => {
    const { container } = render(<CopilotTriage />)
    expect(container.firstChild).toBeNull()
  })

  test('shows only HOT threads and a position counter', async () => {
    useCopilotStore.setState({ isOpen: true })
    render(<CopilotTriage />)
    expect(await screen.findByText('Subject 1')).toBeInTheDocument()
    expect(screen.getByText('1 of 2')).toBeInTheDocument() // thread 3 is LOW, excluded
  })

  test('shows the calm empty state when there are no HOT threads', () => {
    useInboxStore.setState({ threads: [{ ...hot('3'), priority: 'LOW' }] })
    useCopilotStore.setState({ isOpen: true })
    render(<CopilotTriage />)
    expect(screen.getByText(/Inbox is calm/i)).toBeInTheDocument()
  })

  test('clamps an out-of-range index instead of crashing', async () => {
    useInboxStore.setState({ threads: [hot('1'), hot('2')], loading: false, error: null })
    useCopilotStore.setState({ isOpen: true, index: 5, drafts: {} })
    render(<CopilotTriage />)
    expect(await screen.findByText('Subject 2')).toBeInTheDocument() // clamped to last HOT card
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
  })

  test('renders the drafted reply text when the draft is ready', async () => {
    useInboxStore.setState({ threads: [hot('1')], loading: false, error: null })
    useCopilotStore.setState({ isOpen: true, index: 0, drafts: {} })
    render(<CopilotTriage />)
    expect(await screen.findByText('Ready draft.')).toBeInTheDocument()
  })

  test('shows the write-your-own message when drafting fails', async () => {
    ;(generateDraftForThread as any).mockRejectedValueOnce(new Error('boom'))
    useInboxStore.setState({ threads: [hot('1')], loading: false, error: null })
    useCopilotStore.setState({ isOpen: true, index: 0, drafts: {} })
    render(<CopilotTriage />)
    expect(await screen.findByText(/write it/i)).toBeInTheDocument()
  })
})
