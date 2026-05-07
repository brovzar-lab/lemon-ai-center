import { expect, test } from 'vitest'
import tailwindConfig from '../../tailwind.config'

test('design tokens include lemon accent', () => {
  const colors = (tailwindConfig.theme?.extend as any)?.colors
  // Tokens now use CSS custom properties for light/dark theme support
  expect(colors['accent-lemon']).toBe('var(--color-accent-lemon)')
  expect(colors['bg-base']).toBe('var(--color-bg-base)')
})

test('fonts include display and body', () => {
  const fonts = (tailwindConfig.theme?.extend as any)?.fontFamily
  expect(fonts.display).toContain('Fraunces')
  expect(fonts.body).toContain('Inter')
})
