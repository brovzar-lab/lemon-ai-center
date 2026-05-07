import { render, screen } from '@testing-library/react'
import { BrainPanel } from '../components/BrainPanel'
import { useBrainStore } from '../stores/useBrainStore'

beforeEach(() => {
  useBrainStore.setState({
    stats: { ready: true, docCount: 5, chunkCount: 20, totalBytes: 10000 },
    loading: false,
    searchLoading: false,
    error: null,
    query: '',
    results: [],
    recent: [
      {
        path: 'wiki/projects/las-azules-s2.md',
        title: 'Las Azules S2',
        folder: 'wiki/projects',
        snippet: 'Apple TV+ series in final post-production',
        score: 1,
        modifiedAt: new Date().toISOString(),
        frontmatter: {},
      },
    ],
    activeNote: null,
    activeNoteLoading: false,
  })
})

test('BrainPanel renders search input', () => {
  render(<BrainPanel />)
  expect(screen.getByPlaceholderText('Search your brain…')).toBeInTheDocument()
})

test('BrainPanel renders recent notes', () => {
  render(<BrainPanel />)
  expect(screen.getByText('Las Azules S2')).toBeInTheDocument()
})

test('BrainPanel renders stats', () => {
  render(<BrainPanel />)
  expect(screen.getByText(/5 notes/)).toBeInTheDocument()
})
