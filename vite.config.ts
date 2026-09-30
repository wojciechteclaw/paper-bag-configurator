import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; the deploy workflow sets BASE_PATH. Local dev stays at /.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  // App version written into saved project files (docs/SPEC.md §4h); npm sets it for every npm script.
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0') },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Agent worktrees live under .claude/worktrees (full repo copies); never collect their tests.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
