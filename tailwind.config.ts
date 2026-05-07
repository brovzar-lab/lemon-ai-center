import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-base': 'var(--color-bg-base)',
        'bg-surface': 'var(--color-bg-surface)',
        'bg-elevated': 'var(--color-bg-elevated)',
        'accent-lemon': 'var(--color-accent-lemon)',
        'accent-coral': 'var(--color-accent-coral)',
        'accent-blue': 'var(--color-accent-blue)',
        'accent-sage': 'var(--color-accent-sage)',
        'accent-rose': 'var(--color-accent-rose)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-tertiary': 'var(--color-text-tertiary)',
        'text-muted': 'var(--color-text-muted)',
        'border-soft': 'var(--color-border-soft)',
        'border-medium': 'var(--color-border-medium)',
        'border-strong': 'var(--color-border-strong)',
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        body: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
