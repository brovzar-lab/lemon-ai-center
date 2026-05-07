import { render, screen } from '@testing-library/react'
import { Header } from '../components/Header'

test('Header renders wordmark', () => {
  render(<Header />)
  expect(screen.getByText(/Lemon Studios/i)).toBeInTheDocument()
})

test('Header has Sync button', () => {
  render(<Header />)
  // Button has aria-label="Refresh all data" but visible text "↻ Sync"
  expect(screen.getByRole('button', { name: /refresh all data/i })).toBeInTheDocument()
})
