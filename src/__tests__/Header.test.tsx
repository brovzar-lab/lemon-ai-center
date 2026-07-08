import { render, screen } from '@testing-library/react'
import { Header } from '../components/Header'

test('Header renders wordmark', () => {
  render(<Header />)
  expect(screen.getByText(/Lemon Studios/i)).toBeInTheDocument()
})

test('Header has theme toggle and settings controls', () => {
  // Sync moved to SettingsModal in the masthead overhaul; Header now holds theme/settings/sign-out
  render(<Header onOpenSettings={() => {}} />)
  expect(screen.getByRole('button', { name: /switch to (dark|light) mode/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /open settings/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /sign out/i })).toBeInTheDocument()
})
