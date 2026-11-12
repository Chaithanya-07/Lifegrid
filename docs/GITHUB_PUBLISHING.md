# GitHub publishing record and checklist

The repository is published. The state below is exact and was verified directly on 2026-11-12;
anything not verified is listed under "Still open" at the end.

## Published state (verified)

- **Repository:** https://github.com/Chaithanya-07/Lifegrid, owner `Chaithanya-07`, visibility
  **public** (verified via `gh repo view` — `isPrivate: false`). The name is `Lifegrid` (the
  earlier working name `lifegrid-productivity-app` was replaced by the approved final name).
- **History preserved:** the push used the existing local history; no repository or history was
  recreated. Default branch `main`; remote `origin` added with the publish push.
- **Pushes:** the initial publish push landed head `8e59ebf`; documentation and CI-fixer commits
  followed (`09f7d0c` CI Windows runners, `e370028` README project structure) — always verify
  `git status` is clean of unintended files before every push.
- **Source-only archive:** `lifegrid-source-20261112.zip` (gitignored, so it is not in the
  repository) is produced with `git archive` from the final commit — it contains the tracked files
  exactly and therefore **excludes** `.git` metadata, databases, backups, attachments, logs, Data
  Protection keys, build outputs and local caches. Regenerate it from the new head whenever tracked
  content changes.
- **Tracked-file hygiene:** re-verified after the push — no databases, user data, backups,
  attachments, Data Protection keys, environment files with values, build outputs, logs,
  `node_modules`, Playwright artifacts or run-state files are tracked.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`, three jobs: frontend lint/unit/build, the
  backend restore/build/test, and the Playwright e2e suite against the isolated throwaway
  instance). Runs are on **Windows runners**, matching the deployment platform. The README badge
  was added only after a real green run (run 43220864806).

## CI run history

| Run | Commit | Result |
|---|---|---|
| 43215563868 | `8e59ebf` (first run, ubuntu runners) | Frontend ✅ / Backend ✅ (366 tests) / e2e ❌ — every database-backed request intermittently returned 500 on Linux runners; the same suite passes consistently on Windows |
| 43220864806 | `09f7d0c` + `e370028` (windows runners) | All three jobs ✅ — 335 unit tests, 366 backend tests, 39 e2e tests, zero flaky or failed attempts |

The Linux e2e failure is recorded as an open issue for any future Linux (e.g. container) deployment;
the intermittent 500 did not reproduce on Windows and its server-side exception was not captured
(the runner logs do not include the e2e API process console).

## Before every future push

- Re-run the local gates on the commit being pushed: frontend unit tests, lint, production build,
  the complete backend test suite, and the Playwright e2e suite (real figures recorded in
  [CHANGES](../CHANGES.md)).
- Re-check `git status`/staged files: no databases, backups, attachments, logs, Data Protection
  keys, environment files with values, build output, or local caches are tracked.
- After pushing, check the Actions run actually completes green before making any CI claim.

## Still open

- Linux deployment (Railway-style containers): CI currently validates Windows only; revisit the
  Linux e2e failure before any Linux deployment claim.
- Railway deployment has not been attempted (see [RAILWAY_DEPLOYMENT](RAILWAY_DEPLOYMENT.md)).
- A manual NVDA/VoiceOver screen-reader pass has not been performed.
