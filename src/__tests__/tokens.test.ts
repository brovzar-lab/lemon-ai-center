import { expect, test } from 'vitest'
import tailwindConfig from '../../tailwind.config'

test('design tokens include Instrument accent', () => {
  const colors = (tailwindConfig.theme?.extend as any)?.colors
  // Tokens use CSS custom properties for light/dark theme support
  expect(colors['accent']).toBe('var(--accent)')
  expect(colors['bg']).toBe('var(--bg)')
  expect(colors['surface']).toBe('var(--surface)')
  expect(colors['ink']).toBe('var(--ink)')
})

test('fonts include Playfair Display and Schibsted Grotesk', () => {
  const fonts = (tailwindConfig.theme?.extend as any)?.fontFamily
  expect(fonts.display).toContain('Playfair Display')
  expect(fonts.sans).toContain('Schibsted Grotesk')
})
