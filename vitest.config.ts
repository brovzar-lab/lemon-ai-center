import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**'],
    environmentMatchGlobs: [
      ['src/**', 'jsdom'],
      ['server/**', 'node'],
      ['shared/**', 'node'],
    ],
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
})
