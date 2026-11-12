import { configDefaults, defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts: vitest bundles its own vite types, which clash with the
// vite 8 plugin types if both live in one config.
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    // The Playwright e2e suite lives in e2e/ and runs in a real browser (`npm run test:e2e`),
    // never in jsdom.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
  esbuild: { jsx: 'automatic' },
})
