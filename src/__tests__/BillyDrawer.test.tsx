import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BillyDrawer } from '../components/BillyDrawer'
import { useUIStore } from '../stores/useUIStore'

beforeEach(() => {
  useUIStore.setState({ drawerOpen: false, activeModal: null, skillLauncherOpen: false, activeContext: { kind: null, id: null } })
})

test('BillyDrawer is not visible when drawerOpen=false', () => {
  render(<BillyDrawer />)
  expect(screen.queryByTestId('billy-drawer')).not.toBeInTheDocument()
})

test('BillyDrawer is visible when drawerOpen=true', () => {
  useUIStore.setState({ ...useUIStore.getState(), drawerOpen: true })
  render(<BillyDrawer />)
  expect(screen.getByTestId('billy-drawer')).toBeInTheDocument()
})

test('close button hides drawer', async () => {
  useUIStore.setState({ ...useUIStore.getState(), drawerOpen: true })
  render(<BillyDrawer />)
  fireEvent.click(screen.getByRole('button', { name: /close/i }))
  // Close runs a 200ms exit animation before calling closeDrawer().
  await waitFor(() => expect(useUIStore.getState().drawerOpen).toBe(false))
})
