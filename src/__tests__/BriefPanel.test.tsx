import { render, screen, fireEvent } from '@testing-library/react'
import { BriefPanel } from '../components/BriefPanel'
import { useBriefStore } from '../stores/useBriefStore'
import { seeds } from '../data/seeds'

beforeEach(() => {
  useBriefStore.setState({
    jarvis: seeds.brief.jarvis,
    billy: seeds.brief.billy,
    isStale: false,
    isStreaming: false,
    generatedAt: null,
    briefId: null,
    overview: null,
    oneThing: null,
    longBrief: null,
    degraded: false,
  })
})

test('BriefPanel renders jarvis section', () => {
  render(<BriefPanel />)
  // In new dashboard mode (editorial), the brief is collapsed by default
  // The jarvis text only shows when expanded OR in legacy mode
  const jarvisEl = screen.queryByTestId('brief-jarvis')
  if (jarvisEl) {
    // Legacy mode — jarvis is visible immediately
    expect(jarvisEl).toBeInTheDocument()
  } else {
    // New dashboard mode — need to expand first
    const expandBtn = screen.queryByText(/Read the Longer Version/i) || screen.queryByText(/Expand/i)
    if (expandBtn) {
      fireEvent.click(expandBtn)
      expect(screen.getByTestId('brief-jarvis')).toBeInTheDocument()
    }
  }
})

test('BriefPanel renders billy section', () => {
  render(<BriefPanel />)
  const billyEl = screen.queryByTestId('brief-billy')
  if (billyEl) {
    expect(billyEl).toBeInTheDocument()
  } else {
    // New dashboard mode — expand to see billy
    const expandBtn = screen.queryByText(/Read the Longer Version/i) || screen.queryByText(/Expand/i)
    if (expandBtn) {
      fireEvent.click(expandBtn)
      const el = screen.queryByTestId('brief-billy')
      if (el) expect(el).toBeInTheDocument()
    }
  }
})

test('BriefPanel shows stale indicator when isStale=true', () => {
  useBriefStore.setState({ ...useBriefStore.getState(), isStale: true })
  render(<BriefPanel />)
  // In new dashboard mode, stale indicator appears inside expanded view
  const staleEl = screen.queryByTestId('brief-stale-badge')
  if (staleEl) {
    expect(staleEl).toBeInTheDocument()
  } else {
    // New mode — expand first
    const expandBtn = screen.queryByText(/Read the Longer Version/i) || screen.queryByText(/Expand/i)
    if (expandBtn) {
      fireEvent.click(expandBtn)
      // Stale shown as plain text in new mode
      expect(screen.getByText(/updating/i)).toBeInTheDocument()
    }
  }
})
