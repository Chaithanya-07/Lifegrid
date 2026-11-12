import fs from 'node:fs'
import path from 'node:path'
import { E2E_DATA_DIR } from './env'

export default function globalSetup() {
  // A throwaway data directory per run: the API never sees the repository's real database.
  // On Windows, fs.rmSync can throw EPERM for a path that does not exist (or is briefly locked),
  // so the reset is best-effort: any leftover from a previous run is removed, failures are ignored.
  if (fs.existsSync(E2E_DATA_DIR)) {
    try {
      fs.rmSync(E2E_DATA_DIR, { recursive: true, force: true })
    } catch (err) {
      console.warn(`e2e: could not fully reset ${E2E_DATA_DIR} (${(err as NodeJS.ErrnoException).code})`)
    }
  }
  for (const sub of ['', 'backups', 'attachments', 'keys']) {
    fs.mkdirSync(path.join(E2E_DATA_DIR, sub), { recursive: true })
  }
}
