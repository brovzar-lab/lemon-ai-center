import { describe, expect, test, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CopilotTriage } from './CopilotTriage'
import { useInboxStore } from '@/stores/useInboxStore'
import { useCopilotStore } from '@/stores/useCopilotStore'
import { generateDraftForThread } from '@/lib/copilot/draftClient'
import type { InboxThread } from '@shared/types'

vi.mock('@/lib/copilot/draftClient', () => ({
  generateDraftForThread: vi.fn().mockResolvedValue('Ready draft.'),
}))

// queueSend/retrySend hold sends behind a real 5s setTimeout (see useCopilotStore).
// Mock the network call so a keyboard-triggered send in these component tests
// never issues a real fetch or leaves a timer that resolves against a live
// endpoint after the test has moved on — mirrors the mock already used in
// useCopilotStore.test.ts for the same store methods.
vi.mock('@/lib/copilot/sendReply', () => ({ sendReply: vi.fn().mockResolvedValue(undefined) }))

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

  test('flags a draft that mentions an attachment', async () => {
    useCopilotStore.setState({
      isOpen: true, index: 0,
      drafts: { '1': { text: 'Adjunto la tabla actualizada.', status: 'ready', edited: false } },
    })
    render(<CopilotTriage />)
    await screen.findByText('Subject 1')
    expect(screen.getByText(/add the attachment in Gmail/i)).toBeInTheDocument()
  })
})

describe('CopilotTriage keyboard', () => {
  beforeEach(() => {
    useInboxStore.setState({ threads: [hot('1'), hot('2')], loading: false, error: null })
    useCopilotStore.setState({
      isOpen: true, index: 0, pending: [],
      drafts: { '1': { text: 'Ready draft.', status: 'ready', edited: false } },
    })
  })

  test('S queues a send and advances to the next card', async () => {
    render(<CopilotTriage />)
    await screen.findByText('Subject 1')
    fireEvent.keyDown(window, { key: 's' })
    expect(useCopilotStore.getState().pending).toHaveLength(1)
    expect(useCopilotStore.getState().pending[0]).toMatchObject({
      threadId: '1', to: 'a1@b.com', subject: 'Re: Subject 1', body: 'Ready draft.',
    })
    expect(useCopilotStore.getState().index).toBe(1)
  })

  test('E reveals an editable textarea bound to the draft', async () => {
    render(<CopilotTriage />)
    await screen.findByText('Subject 1')
    fireEvent.keyDown(window, { key: 'e' })
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(ta.value).toBe('Ready draft.')
    fireEvent.change(ta, { target: { value: 'My own words.' } })
    expect(useCopilotStore.getState().drafts['1'].text).toBe('My own words.')
    expect(useCopilotStore.getState().drafts['1'].edited).toBe(true)
  })

  test('Space skips without sending', async () => {
    render(<CopilotTriage />)
    await screen.findByText('Subject 1')
    fireEvent.keyDown(window, { key: ' ' })
    expect(useCopilotStore.getState().pending).toHaveLength(0)
    expect(useCopilotStore.getState().index).toBe(1)
  })

  test('J advances to the next card like Space/ArrowRight', async () => {
    render(<CopilotTriage />)
    await screen.findByText('Subject 1')
    fireEvent.keyDown(window, { key: 'j' })
    expect(useCopilotStore.getState().index).toBe(1)
  })

  test('K goes back to the previous card like ArrowLeft', async () => {
    useCopilotStore.setState({ index: 1 })
    render(<CopilotTriage />)
    await screen.findByText('Subject 2')
    fireEvent.keyDown(window, { key: 'k' })
    expect(useCopilotStore.getState().index).toBe(0)
  })

  test('an Undo bar appears while a send is pending and U cancels it', async () => {
    render(<CopilotTriage />)
    await screen.findByText('Subject 1')
    fireEvent.keyDown(window, { key: 's' })
    expect(screen.getByText(/Undo/i)).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'u' })
    expect(useCopilotStore.getState().pending).toHaveLength(0)
  })

  test('a Retry button appears on a failed send and clicking it retries', async () => {
    useCopilotStore.setState({
      pending: [
        { id: 'snd_1', threadId: '1', to: 'a1@b.com', subject: 'Re: Subject 1', body: 'Ready draft.', status: 'error' },
      ],
    })
    render(<CopilotTriage />)
    await screen.findByText('Subject 1')
    expect(screen.getByText(/Send failed/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    // retrySend drops the failed entry and re-queues a fresh 'counting' send
    expect(useCopilotStore.getState().pending).toHaveLength(1)
    expect(useCopilotStore.getState().pending[0]).toMatchObject({ threadId: '1', status: 'counting' })
  })

  test('pressing R retries a failed send', async () => {
    useCopilotStore.setState({
      pending: [
        { id: 'snd_1', threadId: '1', to: 'a1@b.com', subject: 'Re: Subject 1', body: 'Ready draft.', status: 'error' },
      ],
    })
    render(<CopilotTriage />)
    await screen.findByText('Subject 1')
    fireEvent.keyDown(window, { key: 'r' })
    expect(useCopilotStore.getState().pending).toHaveLength(1)
    expect(useCopilotStore.getState().pending[0]).toMatchObject({ threadId: '1', status: 'counting' })
  })

  test('R does nothing while a send is only counting down, and no Retry button shows yet', async () => {
    render(<CopilotTriage />)
    await screen.findByText('Subject 1')
    fireEvent.keyDown(window, { key: 's' }) // queues a 'counting' send
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'r' })
    expect(useCopilotStore.getState().pending).toHaveLength(1)
    expect(useCopilotStore.getState().pending[0].status).toBe('counting')
  })
})
