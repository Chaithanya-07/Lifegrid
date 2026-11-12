# Lifegrid — Forward-progress change report

Covers four work increments. Database / migrations: none touched — no schema, data, or storage change in any increment.
**Record-count audit result (all increments): no artificial record-count restrictions exist, and none were introduced.**

---

# Increment 4 — Production readiness and GitHub publishing (2026-11-12)

## 1. Changes implemented

**Concurrent-write reliability (Part 1).** Both known unique-index races fixed with no schema change:
   - `NotificationService.SyncAsync` factored into stage/commit. A writer losing the `(UserId, DedupeKey)`
     race drops only its committed-duplicate inserts (identified by a post-failure re-query) and still
     persists its `NotifiedAt` stamps, so reminder "notified" state is never lost and no notification is
     duplicated. One retry only; anything the committed duplicates cannot explain is rethrown.
   - `GamificationService`: the weekly-goal insert-or-update is now an explicit guarded upsert
     (`StageWeeklyGoalAsync`/`CommitWeeklyGoalAsync`); a loser of the `(UserId)` create race retries as an
     update (last write wins).
   - `ImportService.StageAsync` guards the same staged-goal insert (a settings row appearing between
     import preview and commit keeps the import's announced goal instead of aborting the import; the gate
     matches the `GamificationSettings` constraint, and any other conflict is rethrown).
   - `Data/SqliteUnique.cs` matches only `SQLITE_CONSTRAINT_UNIQUE` (extended code 2067); not-null,
     check, foreign-key, and busy failures propagate untouched.
**Manual accessibility review + automation (Part 2).** Keyboard/screen-reader checks verified via the
   new persistent `web/e2e/keyboard.spec.ts` (6 tests — tab order, Enter/Space, Escape topmost-overlay,
   dialog focus trap + restoration, `role="alert"` validation announcements, mobile drawer). Results and
   accepted limitations documented in `docs/ACCESSIBILITY_AUDIT.md`.
**Git repository (Part 3).** Initialized on `main` (nothing existed before). `.gitignore` reviewed and
   extended (`!.env.example`); databases, user data, backups, attachments, Data Protection keys, build
   outputs, test artifacts and `.playwright-mcp/` excluded. No file deleted to shrink the tree.
**Environment configuration (Part 4).** `.env.example` created (placeholders only; no credentials — the
   app has none). Verified by booting the API from env-only configuration against a throwaway database:
   `/health` returned `{"status":"ok"}` and the throwaway folder was cleaned afterwards.
**LICENSE (Part 5).** MIT, © the Lifegrid contributors (chosen by the owner).
**CI (Part 6).** `.github/workflows/ci.yml` — three jobs: (1) frontend `npm ci` → lint → unit → build;
   (2) backend restore/build → tests (TRX results uploaded); (3) Playwright e2e on the existing isolated
   throwaway instance (ports 5292/5293, throwaway SQLite) with the Playwright report and failure
   artifacts uploaded. `npm ci` everywhere (reproducible); no secrets used or needed; triggers: pushes
   to `main` and pull requests.
**Repository presentation (Part 7).** README (license, CI, security considerations, concurrency note),
   ROADMAP Phase 7, docs/IMPLEMENTATION_PROGRESS.md, docs/E2E_TESTING.md, docs/ACCESSIBILITY_AUDIT.md.

## 2. Files created and modified

**Created** — `api/TaskFlow.Api/Data/SqliteUnique.cs`, `api/TaskFlow.Tests/ConcurrencyTests.cs`,
`web/e2e/keyboard.spec.ts`, `.github/workflows/ci.yml`, `.env.example`, `LICENSE`.
**Modified** — `api/TaskFlow.Api/Services/NotificationService.cs`,
`api/TaskFlow.Api/Services/GamificationService.cs`, `api/TaskFlow.Api/Services/ImportService.cs`,
`api/TaskFlow.Api/TaskFlow.Api.csproj` (InternalsVisibleTo), `.gitignore`, `README.md`, `ROADMAP.md`,
`CHANGES.md` (this file), `docs/IMPLEMENTATION_PROGRESS.md`, `docs/E2E_TESTING.md`,
`docs/ACCESSIBILITY_AUDIT.md`. **Git** — initial commit on `main` (211 source/doc files; no data,
databases, secrets, env files or artifacts).
**Not touched** — database, migrations, real `data/` folder, API contracts (the sync/upsert internals
are additive refactors; endpoint signatures unchanged), auth, UI design.

## 3. Concurrency tests and results

`api/TaskFlow.Tests/ConcurrencyTests.cs` — 4 tests, **all passing** (deterministic interleavings use the
real stage/commit halves around a genuinely committed competing writer; the storm uses genuinely
concurrent HTTP requests):
   1. a notification sync losing the dedupe race does not 500 or duplicate (winner drop verified;
      `NotifiedAt` stamp still persisted; idempotency re-checks 0);
   2. a sync losing the race *partially* keeps its new rows and drops only duplicates;
   3. a weekly goal losing the create race updates instead of failing (exactly one row, last write wins);
   4. concurrent HTTP writes (12 parallel weekly-goal PUTs + 8 parallel syncs from two clients) never
      500 and stay unique.
Full backend suite with these included: **357/357 passed**.

## 4. Accessibility review results

See `docs/ACCESSIBILITY_AUDIT.md` §"Manual keyboard and screen-reader review": all eight required
checks verified (six by the new e2e spec, all green; labels/announcements additionally covered by the
axe audit and unit tests). Documented limitations: the mobile drawer does not trap focus while open;
list-change announcements for drag reorder; no NVDA/VoiceOver pass yet.

## 5. Git repository status

- Was **not** initialized; now on `main` with an initial commit containing only source and documentation.
- Verified: `git status` shows no `data/`, `*.db`, `node_modules/`, `dist/`, `bin/`, `obj/`,
  `web/test-results/`, `web/playwright-report/`, `.playwright-mcp/`, `.env*` (except `.env.example`).
- Publishing/pushing has **not** been done (requires explicit approval).

## 6. Environment and secret-handling review

- `.env.example` contains variable names + example placeholders only; no tokens/passwords/secrets
  (the app has none in configuration — password hashing is at rest; the only secret material is the
  auto-generated Data Protection key ring, stored outside the tree).
- `appsettings*.json` reviewed: connection strings point at relative data paths only; `Auth:Pbkdf2Iterations`
  and `Auth:AdoptLegacyData` are test-only overrides left out of `.env.example`.
- Env-only boot verified with a throwaway database (see §1); real `data/` untouched.

## 7. CI workflow details

`.github/workflows/ci.yml`: `web` job (node 22, `npm ci`, oxlint, vitest, `tsc -b && vite build`,
dist artifact), `api` job (.NET 10 SDK, build, tests with TRX artifact), `e2e` job (node 22 + .NET 10,
`npm ci`, chromium, API pre-build, `npx playwright test` — the config boots the isolated throwaway
instance, 2 CI retries configured; report + failure artifacts uploaded). Concurrency cancellation
enabled. Not yet executed on GitHub (repository not published).

## 8. Build and test results

| Check | Command/result |
|---|---|
| Backend suite (incl. 4 concurrency tests) | `dotnet test` — **357/357 passed** |
| Frontend unit suite | `npm test` — **335/335 passed** (unchanged app code; rerun in the clean clone) |
| Frontend lint | `npm run lint` — pass (2 pre-existing warnings in untouched code) |
| Production build | `npm run build` — succeeds |
| Keyboard e2e spec | `npx playwright test keyboard` — **6/6 passed** |
| Full e2e suite | `npm run test:e2e` — **38/38 passed** (32 prior + 6 keyboard; see the clean-clone run) |
| API env-only boot | `/health` → `{"status":"ok"}` (throwaway db, cleaned up) |

## 9. Clean-clone verification results

Performed from a fresh `git clone` of the local repository (see below) — frontend `npm ci` + lint +
unit tests + build, backend restore/build/tests, database bootstrap on a **separate throwaway SQLite
file**, and a full `npm run test:e2e` run; the real user database was checksummed before and after and
is unchanged. Results recorded in the final increment report message and validated by execution.

## 10. Remaining blockers before public release

1. Creating the GitHub repository and pushing (explicit approval required — not done).
2. First real CI run on GitHub to confirm the workflow (locally exercised only) and adding the badge.
3. The two accepted accessibility limitations (drawer focus trap; assistive-technology pass).
4. Phase 7 remnants: screenshots refresh, repository metadata (topics/description), and the
   pre-publishing review of `.playwright-mcp/` (already gitignored) and LICENSE compliance headers.

---

# Increment 3 — Security (forwarded headers), performance and accessibility (2026-11-12)

## Fixes and additions

**1. Forwarded-header trust hardened (`api/TaskFlow.Api/Program.cs`).** The proxy topology was
investigated first (dev loopback; Railway/Vercel production proxies append the client address after
internal private routing). `X-Forwarded-For/Proto` processing is now honoured only when the header
was delivered by a **private/loopback** network: `KnownProxies`/`KnownNetworks` are cleared and
rebuilt explicitly (loopback plain + IPv4-mapped, RFC 1918, link-local, IPv6 unique-local). Public
addresses in the header are treated as clients, never as proxies, so a spoofed *leftmost* value can
no longer rotate the rate-limit identity — processing stops at the first public (real client)
address read from the right. Regression tests in `api/TaskFlow.Tests/ForwardedHeaderTests.cs`:
(a) spoofed leftmost values cannot evade the auth rate limit; (b) a trusted private proxy's
forwarded client address is honoured for rate-limit identity. Deployment assumptions documented
in `docs/PRODUCTION_SECURITY.md` (new "Proxies and client addresses" section).

**2. Database-side aggregation (`GamificationService.GetAsync`, `FocusService.StatsAsync`).** The
full-table in-memory aggregations (`Sum`, `Count`, per-day grouping, top-task ranking) moved to
SQL (`SumAsync`/`CountAsync`, date-window bounded queries with a conservative C#-side local-day
bucketing, `Union` for completion sources, `GroupBy`/`Min` for top tasks). Every calculated result
is preserved — verified by two new **volume comparison tests** in
`api/TaskFlow.Tests/StatsAggregationTests.cs` (`GamificationAggregationTests`: 55 completions,
ordering, reopen idempotence, level/XP/streak/history math; `FocusAggregationTests`: 19 focus
sessions across 31+ days, streaks, daily series, top-5 tasks, narrow-window calls reading the same
all-time totals). Reviewed indexes cover the new queries; **no schema or migration change and no
new record-count restriction** was needed.

**3. Accessibility audit + fixes (`docs/ACCESSIBILITY_AUDIT.md`).** A formal axe-core suite
(`web/e2e/accessibility.spec.ts`) audits 13 real page/dialog states at WCAG 2.1 A/AA as part of
every e2e run. All initial serious findings fixed with **no visual changes**:
   - `label-content-name-mismatch` (15 nodes): calendar day buttons named `Show 2026-11-01` →
     accessible name is now `formatLongDate(iso)`;
   - `definition-list` (Analytics + Focus KPI tiles): `<dl><dt><dd>` plus the hint `<span>`
     restructured outside the list, `.kpi dl { margin: 0; }` preserves the layout exactly;
   - `scrollable-region-focusable` (.Focus chart strip): focused with `tabIndex` +
     labelled `region` role.
   Result: **13/13 audits clean** (re-run verified).

**4. E2E coverage expansion (three new spec files, 10 tests).** All against the isolated throwaway
instance (`web/test-results/e2e-data`), never the real database:
   - `notifications.spec.ts` — overdue digest raised/read/dismissed in the bell; a relative
     reminder on a future task appears in the bell's Upcoming tab.
   - `kanban-calendar.spec.ts` — Kanban inline add, count label, Move-button column round trip and
     board search; Calendar day-chip add pre-filled dialog, chip in the month cell, day panel,
     week view (navigating there when the day sits across a week/month border), month navigation.
   - `data-journeys.spec.ts` — JSON export downloads readable data; import preview/refusal of a
     broken file; a positive import into a **second** account ("Will be added" → "Imported 1
     task(s)" → task visible), duplicate import adds nothing; backup create → preview restore →
     full restore rollback (post-snapshot task removed, snapshot task restored); a fresh second
     browser context sees no backups of the first account.

## Files created or modified (increment 3)

**Created** — `web/e2e/accessibility.spec.ts`, `web/e2e/notifications.spec.ts`,
`web/e2e/kanban-calendar.spec.ts`, `web/e2e/data-journeys.spec.ts`,
`api/TaskFlow.Tests/ForwardedHeaderTests.cs`, `api/TaskFlow.Tests/StatsAggregationTests.cs`,
`docs/ACCESSIBILITY_AUDIT.md`.

**Modified** — `api/TaskFlow.Api/Program.cs`, `api/TaskFlow.Api/Services/GamificationService.cs`,
`api/TaskFlow.Api/Services/FocusService.cs`, `docs/PRODUCTION_SECURITY.md`,
`web/src/pages/CalendarPage.tsx`, `web/src/calendar.test.tsx`,
`web/src/pages/AnalyticsPage.tsx`, `web/src/pages/FocusPage.tsx`, `web/src/index.css`,
`CHANGES.md` (this file), `ROADMAP.md`, `README.md`, `docs/IMPLEMENTATION_PROGRESS.md`,
`docs/E2E_TESTING.md`.

**Not touched** — database, migrations, `data/` (incl. `data/taskflow.db`), backup/import/export
formats, API contracts (no endpoint signature or semantics changed), authentication.

## Verification (increment 3, actually executed)

| Check | Result |
|---|---|
| Frontend unit suite (`npm test`) | **335/335 passed** (includes the updated calendar accessible-name test) |
| Accessibility audits (e2e) | **13/13 clean** — zero critical/serious axe violations (after fixes; first run had 17) |
| New journey specs (e2e) | **10/10 passed** (notifications + kanban-calendar + data-journeys) |
| Full e2e suite (`npm run test:e2e`) | **32/32 passed** (3.0 min) — 13 accessibility audits + 19 journey tests (auth 3, tasks 5, backup 1, data-journeys 4, kanban-calendar 4, notifications 2) |
| Backend suite (`dotnet test`) | **353/353 passed**, 0 skipped (348 before + 3 forwarded-header regression tests + 2 stats volume tests) |
| Lint (`oxlint`) | Pass; only the 2 pre-existing warnings in untouched code |
| Production build (`npm run build`) | Succeeds (71 modules, clean TypeScript) |
| Record-count restriction check | No limits exist; none introduced |

## Remaining issues / next steps

1. Full keyboard-path walkthrough / screen-reader passes remain manual review work.
2. The "local day" boundary uses the server time zone (`TZ`-configurable) — per-user zones would be a feature change.
3. Concurrent notification-sync / weekly-goal writes can 500 on the unique-constraint race.
4. Dashboard widgets cannot be reordered (Customize shows/hides only).
5. Publishing (Phase 7): CI workflow, `.env.example`, license, git repository.

---

# Increment 2 — E2E testing foundation and functional reliability (2026-11-12)

## Fixes

**1. `PUT /api/tasks/{id}` silently reopened a Done task when both `isCompleted` and `status` were omitted.**
`TaskInput.IsCompleted` is now nullable (`api/TaskFlow.Api/Dtos/Dtos.cs`) and `TaskService.Apply` keeps the current board column
when the field is omitted; explicit `true` completes, explicit `false` reopens (prior explicit semantics preserved). This is
additive — clients that always send `status` (including the real frontend) are unaffected. The frontend `fakeServer.ts` mirrors
the same rule so unit-test wire behaviour stays faithful.

**2. Escape now reaches the topmost overlay.** The notification panel (`web/src/components/NotificationBell.tsx`) joins the shared
overlay stack exported from `web/src/components/Modal.tsx` (`pushOverlay` / `popOverlay` / `isTopmostOverlay`). A dialog opened
above the panel (reachable in the real app via keyboard, e.g. the command palette) receives Escape first; the panel above a
dialog keeps the dialog open. One Escape press closes exactly one surface.

## Playwright E2E suite (new foundation)

- `web/playwright.config.ts`, `web/e2e/` (`env.ts`, `global-setup.ts`, `helpers.ts`, `auth.spec.ts`, `tasks.spec.ts`,
  `backup.spec.ts`), `npm run test:e2e` / `test:e2e:report`.
- Fully isolated: dedicated ports **5292 (API) / 5293 (frontend)**, throwaway SQLite + backups + attachments + Data-Protection
  keys under `web/test-results/e2e-data` recreated per run, unique `@example.test` accounts per test through the real UI,
  `Cors__Origins__0` and a raised `RateLimit__AuthPerMinute` for the instance only (same technique as `TaskFlow.Tests.ApiFactory`).
  The repository's real `data/` folder is never touched. Screenshots + traces captured on failure (gitignored).
- `vite.config.ts` reads `VITE_API_ORIGIN` (optional; unset = unchanged default `http://localhost:5062`).
- Dev dependencies added: `@playwright/test` (+ Chromium download), `@types/node` (for node-side config files now that
  `vite.config.ts` reads env vars).
- Journeys covered (9 tests): registration · sign-out/sign-in persistence · session expiry returning to sign-in · dashboard
  loading · task create · task edit · task complete · XP awarded exactly once (re-toggling never re-pays; verified on the
  dashboard rewards widget) · Completed-list revisit + reopen · backup creation.

## Files created or modified (increment 2)

**Created:** `web/playwright.config.ts`, `web/e2e/{env,global-setup,helpers}.ts`, `web/e2e/{auth,tasks,backup}.spec.ts`,
`docs/E2E_TESTING.md`.
**Modified:** `api/TaskFlow.Api/Dtos/Dtos.cs`, `api/TaskFlow.Api/Services/TaskService.cs`,
`api/TaskFlow.Tests/TaskFeatureTests.cs` (+1 regression test), `web/src/testing/fakeServer.ts`, `web/src/components/Modal.tsx`,
`web/src/components/NotificationBell.tsx`, `web/src/notifications.test.tsx` (+2 tests), `web/vite.config.ts`,
`web/vitest.config.ts` (excludes `e2e/`), `web/tsconfig.node.json`, `web/package.json` (+scripts, +devDeps), `.gitignore`
(playwright artifacts + `.playwright-mcp/`), `README.md`, `ROADMAP.md`, `docs/IMPLEMENTATION_PROGRESS.md`.

## Verification (increment 2, actually executed)

| Check | Result |
|---|---|
| Playwright e2e (`npm run test:e2e`) | **9/9 passed** (31 s) — first runs surfaced and fixed real integration gaps (Origin allowlist, auth rate limit) |
| Backend suite (build + `dotnet test`) | **348/348 passed**, 0 skipped (was 347; +1 reopen regression test) |
| Frontend unit suite (`npm test`) | **335/335 passed** (was 333; +2 overlay-stack regression tests) |
| Lint (`oxlint`) | Pass; only the 2 pre-existing warnings in untouched code |
| Production build (`tsc -b && vite build`) | Succeeds |
| Record-count restriction check | No limits exist; nothing introduced |

## Remaining issues / next steps

1. Formal accessibility audit (axe or equivalent) — last open item in the QA phase.
2. The "local day" boundary uses the server time zone (`TZ`-configurable) — per-user zones would be a feature change.
3. Forwarded-headers trust the leftmost `X-Forwarded-For` for rate-limit identity.
4. Gamification / focus stats endpoints still aggregate whole tables in memory.
5. E2E suite could grow: reminders/notifications flow, Kanban drag, calendar, import preview/restore journey.

---

# Increment 1 — Correctness fixes from the full-project review (2026-11-12)

---

## 1. Inspection performed before the changes

- Full four-track review of the workspace (backend, frontend, tests/tooling, docs/deployment) completed earlier this session: all source under `api/` and `web/src` read, claims verified against code, both test suites executed.
- Dedicated **record-count audit** (requirement: no artificial record limits):
  - Tasks, categories, tags and subtasks have **no count-based creation validation** anywhere in frontend or backend.
  - `TaskService.cs` `limit must be between 1 and 5000` — bounds check on an *optional* query parameter the frontend never sends; omitted = all matching tasks returned.
  - `Auth:MaxUsers = 500` — per-instance registration flood control (abuse safeguard, configurable), not a per-user record limit.
  - Kanban `DONE_LIMIT=50` (explicit "Show all" toggle) and Dashboard `LIMIT=6` ("N more" link) — display pagination only.
  - Attachment quota / 10 MB file cap / import payload cap — technical safeguards, intentionally preserved.
  - **Conclusion: no record-count restriction exists or was introduced.**

## 2. Changes implemented

| # | Change | File | Why |
|---|--------|------|-----|
| 1 | Double-encoded (mojibake) strings fixed: `'Â·'` → `'·'` in the time-estimate summary separator; `'â€”'` → `'—'` in the Notes placeholder. Byte-level sweep confirmed these were the only mojibake instances in the tree. | `web/src/components/TaskEditor.tsx` | Mojibake was rendered directly to users. |
| 2 | Toast auto-dismiss timers are now tracked per toast and cleared on unmount/self-dismiss. | `web/src/useToast.tsx` | Uncanceled timers fired after jsdom teardown, producing an `Unhandled ReferenceError: window is not defined` in the frontend test run — a real CI flake source. |
| 3 | The three hand-rolled `fetch` paths (`uploadAttachment`, `listBackups`, `readBackup`) now use `credentials: 'same-origin'`, run through the shared `notifyIfSignedOut` 401 handler, and give a clear 401 message. | `web/src/api.ts` | Previously, an expired session on Settings → Backup / attachments showed a generic failure instead of returning to sign-in like every other request. |
| 4 | Empty-series guard added to `TrendChart` with a proper empty state. Hooks (`useRef`/`useEffect`) hoisted above the guard so hook order is stable. | `web/src/pages/AnalyticsPage.tsx` | `TrendChart` dereferenced `points[0]` unconditionally. The Analytics API always fills the daily series today, so this is defensive, not a reachable crash. |
| 5 | `AllowedHosts` marked **Required** in the Railway variable table; deploy step updated to call out both required variables. | `docs/RAILWAY_DEPLOYMENT.md` | Bundled default is `localhost`-only; without this env var every first-deploy request (including the health check) fails with "Invalid Hostname". |
| 6 | Documentation updated to match actual state. | `docs/IMPLEMENTATION_PROGRESS.md`, `ROADMAP.md`, `CHANGES.md` (this file) | Review-pass record: delivered fixes, known open issues, refreshed validation results, Phase 6 status. |

## 3. Files created or modified

**Created**
- `CHANGES.md` (this report)

**Modified**
- `web/src/components/TaskEditor.tsx`
- `web/src/useToast.tsx`
- `web/src/api.ts`
- `web/src/pages/AnalyticsPage.tsx`
- `docs/RAILWAY_DEPLOYMENT.md`
- `docs/IMPLEMENTATION_PROGRESS.md`
- `ROADMAP.md`

**Not touched** — backend, database, migrations, tests, `data/` (incl. `data/taskflow.db`).

## 4. Features completed

No new features — correctness/hardening increment: consistent session-expiry behaviour across every API surface, last known frontend test flake removed, byte-verified string encoding fix, latent chart crash guarded, first-deploy failure prevention documented, record-limit audit documented.

## 5. Tests executed and actual results

| Check | Command | Result |
|---|---|---|
| Frontend suite | `npm test -- --run` (web/) | **333/333 passed** (18 files) — no unhandled errors this run |
| Toast-flake confirmation | `npx vitest run src/app.test.tsx` | Passed; grep found **no** unhandled error (previously `Errors 1 error`) |
| Backend suite | `dotnet test TaskFlow.Tests/TaskFlow.Tests.csproj --no-build` (api/) | **347/347 passed**, 0 skipped, ~53 s |
| Lint | `npm run lint` (oxlint) | Pass; 2 **pre-existing** `no-useless-fallback-in-spread` warnings (lines not touched by this pass) |
| Production build | `npm run build` (`tsc -b && vite build`) | Succeeds; 71 modules, clean TypeScript |
| Mojibake byte sweep | grep for C3 82 / C3 A2 / E2 82 AC sequences | Clean; only remaining `·` hits are proper UTF-8 |

## 6. Remaining (recorded, not yet fixed)

1. "Local day" for XP/streaks/analytics uses the **server** time zone (`TZ`-configurable); per-user zones would be a schema/feature change.
2. Forwarded-headers trust the **leftmost** `X-Forwarded-For` value for rate-limit identity (`Program.cs` `ForwardLimit = null`).
3. `PUT /api/tasks/{id}` with both `isCompleted` and `status` omitted reopens a Done task (`TaskService.cs`).
4. Concurrent notification-sync / weekly-goal writes can 500 on the unique-constraint race.
5. Gamification and focus stats endpoints aggregate the whole ledger/session table in memory.
6. Escape does not reach the topmost modal when the notification panel is open.
7. Pre-publishing: no git repository yet; LICENSE, CI workflow and `.env.example` missing; `.playwright-mcp/` must be added to ignore files before `git init`.
8. Playwright e2e suite and a formal accessibility audit are still not written (as the ROADMAP already discloses).

## 7. Recommended next step

A minimal **Playwright e2e suite** (login → create task → complete → XP awarded → backup) to close the fakeServer-drift risk, followed by tightening the forwarded-header trust (`ForwardLimit = 1`) with a rate-limit test. Smallest quick wins if you prefer fixes first: items 3 and 6 above.
