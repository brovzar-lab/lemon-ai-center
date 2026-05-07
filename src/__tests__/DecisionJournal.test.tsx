import { render, screen, fireEvent } from '@testing-library/react'
import { DecisionJournal } from '../components/DecisionJournal'
import { useDecisionStore } from '../stores/useDecisionStore'
import type { Decision } from '@shared/types'

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({ id: 'new-id' }),
  serverTimestamp: vi.fn(() => new Date()),
}))
vi.mock('@/lib/firestore', () => ({ db: {} }))

const TEST_DECISIONS: Decision[] = [
  {
    id: 'test-d1',
    text: 'Going with Onza Films for North America distribution rights.',
    ts: '2026-04-27T15:30:00Z',
    updatedAt: '2026-04-27T15:30:00Z',
    tags: ['distribution', 'deal'],
    outcome: 'made',
  },
  {
    id: 'test-d2',
    text: 'Deferred the GBM partnership conversation until Q3.',
    ts: '2026-04-25T11:00:00Z',
    updatedAt: '2026-04-25T11:00:00Z',
    tags: ['partnership'],
    outcome: 'deferred',
  },
]

beforeEach(() => {
  useDecisionStore.setState({ decisions: TEST_DECISIONS, filteredDecisions: TEST_DECISIONS, searchQuery: '' })
})

test('DecisionJournal renders decisions list', () => {
  render(<DecisionJournal />)
  expect(screen.getByText(TEST_DECISIONS[0].text)).toBeInTheDocument()
})

test('typing in search filters decisions', () => {
  render(<DecisionJournal />)
  const input = screen.getByPlaceholderText(/search/i)
  fireEvent.change(input, { target: { value: 'distribution' } })
  expect(useDecisionStore.getState().searchQuery).toBe('distribution')
})

test('export button is present', () => {
  render(<DecisionJournal />)
  expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument()
})
