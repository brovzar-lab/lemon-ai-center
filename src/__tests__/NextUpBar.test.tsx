import { render, screen, fireEvent } from '@testing-library/react'
import { NextUpBar } from '../components/NextUpBar'
import { useCalendarStore } from '../stores/useCalendarStore'
import { useUIStore } from '../stores/useUIStore'
import { seeds } from '../data/seeds'

beforeEach(() => {
  useCalendarStore.setState({ events: seeds.meetings, loading: false })
  useUIStore.setState({ activeModal: null, drawerOpen: false, skillLauncherOpen: false, activeContext: { kind: null, id: null } })
})

test('NextUpBar renders required meetings', () => {
  render(<NextUpBar />)
  const required = seeds.meetings.filter(m => m.isRequired)
  if (required.length === 0) return
  // In new dashboard mode, renders a single prominent bar with the first meeting's title
  // In legacy mode, renders individual meeting pills
  const meetingPills = screen.queryAllByTestId('meeting-pill')
  if (meetingPills.length > 0) {
    // Legacy mode
    expect(meetingPills.length).toBe(required.length)
  } else {
    // New dashboard mode — check the prominent bar shows the first meeting
    expect(screen.getByText(required[0].title)).toBeInTheDocument()
    expect(screen.getByText(/PREP/i)).toBeInTheDocument()
  }
})

test('clicking PREP opens MeetingPrepModal', () => {
  render(<NextUpBar />)
  const required = seeds.meetings.filter(m => m.isRequired)
  if (required.length === 0) return
  const meetingPill = screen.queryByTestId('meeting-pill')
  if (meetingPill) {
    // Legacy mode
    fireEvent.click(meetingPill)
  } else {
    // New dashboard mode
    fireEvent.click(screen.getByText(/PREP/i))
  }
  expect(useUIStore.getState().activeModal).toBe('meeting-prep')
})
