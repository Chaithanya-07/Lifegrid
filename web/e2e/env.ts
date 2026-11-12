import { fileURLToPath } from 'node:url'

/** Shared constants for the Playwright config and the specs. */
export const E2E_DATA_DIR = fileURLToPath(new URL('../test-results/e2e-data/', import.meta.url))
export const API_PORT = 5292
export const FRONT_PORT = 5293
export const API_URL = `http://localhost:${API_PORT}`
export const FRONT_URL = `http://localhost:${FRONT_PORT}`

/** SQLite connection string / folder values for the throwaway instance (forward slashes keep SQLite happy on Windows). */
export function apiData(name: string) {
  return `${E2E_DATA_DIR.replace(/\\/g, '/')}${name}`
}
