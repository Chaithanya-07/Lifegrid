# Lifegrid — Forward-progress change report

Covers seven work increments — the fifth, sixth and seventh are same-day release passes ("final release review and deployment
readiness", "final GitHub release preparation", then "final GitHub publishing"). Database / migrations: none touched — no schema, data, or storage change in any increment.
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
**LICENSE (Part 5).** MIT, © Kurra Chaithanya (chosen by the owner).
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

---

# Increment 5 — Final release review and deployment readiness (2026-11-12)

## 1. Changes made

- **Development database portability (Part 1).** `appsettings.Development.json` shipped a
  machine-specific absolute path (`D:/Projects/Lifegrid/data/taskflow.db`; also absolute backup and
  attachment directories). It now ships portable relative paths — `Data Source=taskflow.db`,
  `Backups/Attachments = backups|attachments` — and `Program.cs` anchors them at the API content root
  (the project directory under `dotnet run`), so the repository's existing `data/` directory is used
  regardless of the terminal's working directory. The whole data directory can be relocated with
  `LIFEGRID_DATA_DIRECTORY` (also reachable as the standard config mapping `LifeGrid__DataDirectory`;
  the friendly env name is wired explicitly in code). Absolute paths in configuration are never
  touched, so the test factories, the e2e throwaway-instance overrides and all production
  configuration behave exactly as before. Resolved locations are logged at startup (Information,
  development only): "LifeGrid development data — database: …, backups: …, attachments: …".
- **Mobile drawer focus trap (Part 6).** Previously a documented accessibility limitation. The drawer
  now takes focus when opened (`side.focus({ preventScroll: true })`), Tab cycles inside it while it
  is open and Shift+Tab wraps at the edges, Escape closes it, and closing returns focus to the menu
  button that opened it. A dialog opened above (task editor, command palette, confirmations) receives
  the keys first (`modal-open` body-class gate), so Escape still closes only the topmost surface.
  The shared FOCUSABLE selector was extracted from `Modal.tsx`; navigation behaviour and existing
  tests are otherwise untouched.
- **Release package hygiene (Part 2).** A clean, source-only archive is produced from the commit
  graph with `git archive` (239 entries). Verified contents in detail in §4 below.
- **Git repository review (Part 3).** Summarised in §5: branch `main`, three commits, clean tree,
  identity `Kurra Chaithanya`, no remote configured, nothing pushed (approval required).
- **CI workflow review (Part 4).** Verified every step, path and working directory (§6); added a
  NuGet package cache (`actions/cache` on the NuGet packages directory, keyed by the `api/**`
  csproj hashes) to the backend and e2e jobs alongside the existing npm caches.
- **Deployment configuration review (Part 5).** Verified the Docker / entrypoint / railway.json /
  docs chain end to end (§7); hardened the entrypoint (AllowedHosts default from
  `RAILWAY_PUBLIC_DOMAIN` when unset; non-root starts no longer fail on an unwritable root-owned
  data mount).
- **Docs.** README (data-location paragraph), docs/RAILWAY_DEPLOYMENT.md (entrypoint description +
  AllowedHosts row), docs/ACCESSIBILITY_AUDIT.md (drawer resolved), docs/E2E_TESTING.md (drawer
  trap), ROADMAP.md, IMPLEMENTATION_PROGRESS.md, `.env.example` (documented
  `LIFEGRID_DATA_DIRECTORY` as development-only), `.gitignore` (generated zips excluded).

## 2. Database portability findings

- `appsettings.json` (the production base) already used relative paths (`data/taskflow.db`);
  the machine-specific absolute path existed only in the Development override, presumably because
  relative paths resolve against the process CWD and `dotnet run` from the repository root would
  otherwise have addressed a *different* database inside `api/TaskFlow.Api/`. The fix keeps the
  portable paths and removes that ambiguity by anchoring them explicitly at the content root.
- Data-directory inventory: `data/taskflow.db` (+ `-wal`/`-shm`) is the active database;
  `data/backups/startup-20261111-150140/` holds an older, cold point-in-time snapshot of the same
  database (November 11, 15:01); `data/logs/` and `data/run/pids.json` are residue of ad-hoc dev
  runs. No other database files exist in the tree. Nothing was deleted, merged or overwritten.
- No production connection configuration was modified.

## 3. Database preservation verification

- Before any testing: main-DB MD5 `924efbe694d79a9f53620ab84713a7a1`, WAL MD5
  `7e9d15a1eb242320f0753171ac93fce5`; read-only diagnostics (SQLite opened with `mode=ro` plus
  `PRAGMA query_only`): 2 users, 2 tasks, `PRAGMA quick_check` = "ok", 6 applied migrations,
  274 432 bytes.
- A safety copy of all three database files was taken to a temporary directory outside the
  repository before the first boot.
- Default-resolution boot (through the new portable config): the startup log resolved the
  *existing* `data\taskflow.db` exactly; `/health` returned `{"status":"ok"}`; EF reported
  "No migrations were applied. The database is already up to date."
- Override boot (`LIFEGRID_DATA_DIRECTORY` → temporary directory): the log resolved the temporary
  directory and health was OK; that throwaway database was deleted afterwards and is not "the"
  database — the default resolution keeps pointing at the existing data.
- After the runs: main-DB MD5 unchanged (`924efbe6…`); all row counts, the user-email and
  task-title content hashes, file size, applied-migration count and the integrity check are
  identical to the pre-test snapshot. Only the WAL file's MD5 changed — the expected effect of
  SQLite's open/close write-ahead lifecycle during the boot; no rows were written (counts and
  hashes prove it).

## 4. Release package contents and exclusions

`lifegrid-source-20261112.zip`, 2 579 934 bytes, produced by `git archive` of HEAD (239 entries):

- **Preserved:** all source code and tests, the 13 EF Core migration files, `web/package-lock.json`,
  all documentation, LICENSE, `.env.example`, `.gitignore`/`.gitattributes`, README, the GitHub
  Actions workflow, Dockerfile, docker-entrypoint.sh, railway.json, .dockerignore. No screenshots
  intended for the README exist in the repository, so none are claimed packaged.
- **Excluded (verified from the entry list):** no `node_modules/`, `bin/`, `obj/`, `dist/`,
  `coverage/`, no runtime `data/` directory (databases, WAL/SHM, the startup-2026… snapshot copy,
  backups, attachments, logs, `run/pids.json`), no `*.db`/`*.sqlite`, no Playwright
  `test-results`/`playwright-report`, no `.playwright-mcp/`, no populated `.env` (only
  `.env.example`), no Data Protection keys. The only string-pattern hits in the scan are the C#
  source folder `api/TaskFlow.Api/Data/…` (capital D, source code) and the intended `.env.example`.
- The zip itself is gitignored (`/lifegrid-source-*.zip`) and lives in the repository root.
- No local user data was deleted to build it.

## 5. Git status and commit details

- Branch `main`; commits `c27383f` → `c2d3760` (increment 4) → `868b8cb` (increment 5 code); the
  doc/report updates land as a fourth commit. Working tree clean after committing.
- Identity: `Kurra Chaithanya <chaithanya7869@gmail.com>`. No remote configured; nothing pushed
  (per the standing approval requirement).
- Tracked-file scan: 216 files; the only `.env*` match is the intended `.env.example`; no database,
  data-directory, log, pid, key or build-artifact files are tracked (verified by the archive scan
  above). LICENSE and `.env.example` are included; all source and test files are committed.

## 6. CI workflow review

- Three jobs verified line by line: **web** (Node 22, npm cache keyed on `web/package-lock.json`,
  `npm ci`, lint, unit tests — `vitest run`, so no watch-mode hang — production build, dist
  artifact), **api** (.NET 10.0.x, build, `dotnet test --no-build` with TRX uploads on `always()`),
  **e2e** (both toolchains, `npx playwright install --with-deps chromium`, one up-front API build,
  `npx playwright test` against the throwaway 5292/5293 instance, report and test-results uploaded
  on `always()`).
- Triggers: every push and pull request against `main`; concurrency cancels superseded runs.
- Working directories and paths checked (`working-directory: web` where required; correct csproj
  paths; artifact paths exist). The workflow never references the repository's `data/` directory;
  the e2e databases are recreated under `web/test-results/` on every run.
- Change made: added the NuGet package cache to the backend and e2e jobs.
- **Not claimed as passing:** CI has not executed on GitHub (no remote yet); the workflow's
  commands are currently verified by the local clean-clone runs, which exercise the same steps.

## 7. Deployment configuration findings

- **Persistent storage:** the Dockerfile defaults every writable location to `/data` and declares
  `VOLUME ["/data"]`; `railway.json` expects a single volume; the entrypoint creates and chowns the
  three persistent sub-folders, drops privileges (`setpriv` to `app`), and binds `0.0.0.0:$PORT`.
- **Data Protection keys:** persisted at `/data/keys` in the image with `chmod 700`; an unset keys
  directory is a hard startup failure outside development — correct.
- **Cookies/HTTPS:** `CookieSecurePolicy.Always` outside development; the container binds plain
  HTTP and TLS terminates at the platform proxy (documented; forwarded-header trust remains
  loopback/private-only networks, unchanged since the security pass).
- **Health:** `/health` (and `/api/health`) answer only when the database connects;
  `railway.json` probes `/health` with a 120 s timeout, one replica, restart-on-failure —
  appropriate for a single-writer SQLite volume.
- **Startup:** migrations are applied automatically at startup, are additive, and the entrypoint
  fixes ownership before the app runs; the "database already up to date" path was exercised
  against the real data in §3.
- **Fixed:** `AllowedHosts` — the bundled base default is localhost-only, so the documented manual
  step was easy to miss on a first deploy; the entrypoint now fills it from the Railway-provided
  `RAILWAY_PUBLIC_DOMAIN` when unset (an explicit setting still wins). Non-root container starts
  no longer fail if the data folders cannot be created.
- **Still manual (documented, unchanged):** `Cors__Origins__0` must be set to the real web origin
  (it also drives the CSRF Origin check) and requires knowing the domain before the deploy.

## 8. Accessibility fixes and limitations

- Fixed: the mobile navigation drawer focus issue (see §1). Now covered by 2 e2e tests
  (open/close/focus-restore and Tab-trap cycling).
- The audit limit list was re-checked: the drawer item is resolved; the remaining **documented**
  limitations are unchanged — live-region announcements for drag-driven list changes, and no
  real-assistive-technology passes. **No NVDA/VoiceOver testing was performed and none is
  claimed**; all verification is Playwright against Chromium's accessibility tree.

## 9. Test results (actually executed)

| Check | Result |
|---|---|
| Frontend unit (`npm test`) | **335/335 passed** |
| Frontend lint (`npm run lint`) | Pass, 2 pre-existing warnings |
| Frontend production build | Successful |
| Backend (`dotnet test`) | **366/366 passed** (357 + 9 new data-path portability tests) |
| Playwright e2e (`npm run test:e2e`) | **39/39 passed** (32 prior + 6 keyboard + 1 new drawer-trap test) |
| Development API boot | Default resolution + override resolution boots verified; see §3 for the database checks |
| Clean-clone battery (fresh `git clone`) | Re-ran installs, lint, unit, build, backend tests and e2e; figures in the final increment-5 report message |

## 10. Remaining blockers before public release

- **GitHub publishing still requires explicit approval** (repository creation and the first push);
  no remote is configured and nothing has been pushed.
- **CI status is unknown on GitHub** — the workflow is defined and mirrored locally by clean-clone
  runs, but no real Actions run has executed yet (no badge is shown until then).
- **Deployment is not verified in a live environment** — Railway/Vercel settings remain documented
  templates; `Cors__Origins__0` and the frontend hosting need their real values at deploy time.
- **Accessibility:** no assistive-technology (NVDA/VoiceOver) pass; drag-change announcements open.
- Screenshots for the README do not exist yet (the README deliberately claims nothing about them).

---

# Increment 6 — Final GitHub release preparation (2026-11-12)

Completes the release-review brief ("Increment 5: Final GitHub Release Preparation") on top of the
same-day release-review pass; nothing from the previous increments was repeated or redone.

## 1. Changes implemented

- **Documentation consistency (Git status).** Three documents still claimed "this workspace has no
  Git metadata" — false since the increment-4 pass. Updated: `docs/GITHUB_PUBLISHING.md` (rewritten
  with a dated, verified state list: local repository on `main` with the recorded history; no
  remote; repository `lifegrid-productivity-app` not created or verified; no Actions run; the
  source-only archive already exists and excludes `.git` metadata — produced with `git archive`),
  `docs/RAILWAY_DEPLOYMENT.md` (intro), `docs/DEPLOYMENT_PROGRESS.md` (intro). CHANGES.md and
  README's CI sentence already matched reality and were left as they were.
- **Mobile drawer made truly modal (Part 3).** On top of the same-day focus-trap work: the page
  content (`.main-col`) is now `inert` while the drawer is open, so background controls cannot be
  focused even programmatically and are skipped by a screen reader's virtual cursor; the drawer
  also closes automatically if the window is resized past the mobile breakpoint (it cannot sit
  open on the desktop shell, whose menu button is hidden). The `matchMedia` call is guarded for
  jsdom. Desktop navigation is unchanged (`navOpen` can only be set by the mobile-only menu
  button).
- **Regression tests extended:** the drawer e2e test now also asserts the background is `inert`,
  that focusing a background control programmatically does not steal focus out of the drawer, and
  that the background is keyboard-reachable again the moment the drawer closes.
- **Correction to the previous report:** the earlier same-day report said README screenshots do
  not exist; they do (10 PNG tracks under `docs/screenshots/`, embedded in the README and included
  in the release archive). Records updated.
- Docs updated: README accessibility bullet, ACCESSIBILITY_AUDIT.md and E2E_TESTING.md (inert +
  resize-close), this file.

## 2. Accessibility results

- Verified (Playwright, Chromium): drawer focus enters on open (7 keyboard e2e tests total now);
  Tab/Shift+Tab remain inside for 30 forward and 30 backward stops; a background control cannot
  take focus programmatically while the drawer is open (`main-col` inert); Escape closes it; focus
  returns to the opening menu button; the background is reachable again immediately after. The
  axe-core audit of 13 states is unchanged and clean.
- **No NVDA/VoiceOver testing was performed and none is claimed.**

## 3. Git status and commit details

- Branch `main`; history `c27383f` → `c2d3760` → `868b8cb` → `bc73213` → (this pass's two commits,
  code and then docs). Working tree clean after committing; history preserved (no resets, no new
  repository); identity `Kurra Chaithanya <chaithanya7869@gmail.com>`; **no remote configured;
  nothing pushed**.

## 4. Security audit findings

- Tracked files: no `data/`, backups, attachments, Data Protection key files, `*.pem/*.pfx/*.key`,
  `.env` with values, pid files, logs, or build artifacts. The only `.env*` track is the intended
  placeholder-only `.env.example`.
- Secret-pattern scan over tracked content: only code identifiers, method names and a clearly
  documented throwaway-test password (`correct-horse-battery` used by e2e against isolated
  databases) — no credentials or tokens.
- The runtime `data/` directory (database, WAL/SHM, cold snapshot, backups, logs, `run/pids.json`)
  stays untracked and out of the release archive; the archive itself was verified entry-by-entry
  in the previous pass and remains unchanged (10 README screenshots are tracked and included).

## 5. CI status

- `.github/workflows/ci.yml` re-verified with no further changes needed (three jobs, NuGet + npm
  caches, uploads, triggers). **No GitHub Actions run has occurred** — publication is blocked
  pending explicit approval, so no CI status is claimed.

## 6. Test results (actually executed in the workspace)

- Frontend unit: **335/335**; lint: pass (2 pre-existing warnings); production build: pass.
- Backend: **366/366**. Playwright e2e: full suite re-run after the changes (figures in the final
  report message). Keyboard/accessibility suite: **7/7**.

## 7. Remaining blockers

Unchanged from the previous pass: repository creation + first push need explicit approval; no
Actions run yet; live deployment unverified; no NVDA/VoiceOver pass; drag-change announcements.

## 8. Exact steps required for public release

1. Create the GitHub repository `lifegrid-productivity-app` (public or private — confirm owner and
   visibility first). Nothing in this workspace does that until approved.
2. `git remote add origin <url>`, then `git push -u origin main` (all 6 commits preserved as-is).
3. Confirm the commit list, default branch and visibility on GitHub; confirm `.env.example` and no
   data/key files in the web file listing.
4. Wait for the Actions run of `.github/workflows/ci.yml` on `main`; open the run's artifacts
   (TRX, Playwright report, dist) and confirm the three jobs pass. Only then add the README badge.
5. Optional deploy path: follow `docs/RAILWAY_DEPLOYMENT.md` (volume `/data`, set
   `Cors__Origins__0` and `TZ`; `AllowedHosts` is auto-filled from `RAILWAY_PUBLIC_DOMAIN`), or any
   host equivalent; verify `/health` before declaring active.

# Increment 7 — Final GitHub publishing (2026-11-12)

## 1. Publishing performed (with explicit approval)

- Created the public repository **https://github.com/Chaithanya-07/Lifegrid** (owner
  `Chaithanya-07`) with the approved name `Lifegrid` and pushed with the existing history intact —
  the repository was not recreated and no commit was discarded or rewritten.
- Verified directly after the push: remote `origin` points to the repository; default branch
  `main`; visibility public; the web file listing contains no databases, user data, backups,
  attachments, Data Protection keys, environment files with values, build artifacts or Playwright
  artifacts.
- Heads pushed: `e2651e2` (publish), then `c71cce0` (CI fix, below) and `a919d3e` (README
  project-structure section). Documentation commits follow this section.

## 2. CI runs — genuine failure investigated and fixed

- First Actions run **43215563868** (`e2651e2`, ubuntu runners): frontend ✅, backend ✅ (366
  tests), **e2e ❌** — 29 failed / 4 passed / 2 flaky (not accepted as green). Failure evidence
  from the uploaded Playwright traces: `POST /api/auth/register` (and every other database-backed
  endpoint) intermittently returned 500 to the instance on Linux; `/api/auth/me` 401s (no database
  access) always succeeded. The server-side exception was not capturable — the runner logs do not
  include the e2e API process console — and the failure never reproduced on Windows.
- Decision per the Windows-only deployment requirement: CI now runs all three jobs on
  **windows-latest** runners matching the deployment platform (`c71cce0`; the Linux-only
  `playwright install --with-deps` step became `playwright install chromium`).
- Second run **43220864806**: all three jobs ✅, verified from the log — unit **335/335**, backend
  **366/366** (failed 0), e2e **39 passed (1.4m)** with zero ✘/flaky attempts. No CI-passing claim
  rests on anything but these runs; the badge was added afterwards.

## 3. Docs updated to the published state

- `docs/GITHUB_PUBLISHING.md` rewritten as a publish record + checklist (incl. the CI run table
  and the open Linux-runner issue).
- `README.md`: status badge; CI bullet now states Windows runners; project-structure section added.
- `docs/RAILWAY_DEPLOYMENT.md`, `docs/DEPLOYMENT_PROGRESS.md`: stale "no remote / no repository"
  claims replaced with the published state; deployment itself remains un-attempted.
- `docs/IMPLEMENTATION_PROGRESS.md` and `ROADMAP.md` phase 7: publishing recorded, Linux issue and
  remaining open items listed.

## 4. Fresh QA on the pushed head (actually executed 2026-11-12)

- Frontend unit: **335/335**. Lint: pass (the two pre-existing warnings). Production build: pass.
- Backend: **366/366**. Playwright e2e: **39/39** (incl. the seven drawer/keyboard tests).
- Real database safety: main database file MD5 unchanged by all verification work; e2e and unit
  suites used throwaway instances only.

## 5. Remaining blockers / open items

- The intermittent Linux-runner e2e 500 is unresolved by design decision (Windows-only target); it
  is recorded before any Linux/container deployment is attempted.
- Railway (or any external hosting) deployment has not been performed; live `/health` remains
  unverified.
- Manual NVDA/VoiceOver pass not performed (automated axe + keyboard suites pass).
- Release archive `lifegrid-source-*.zip` should be regenerated from the final post-documentation
  head before being distributed.

# Increment 8 — Public README review and documentation polish (2026-11-13)

## 1. README assessed and rebuilt

Reviewed the published README as a recruiter / OSS discoverer / user. Findings: correct facts
throughout, but heavy table-based screenshot layout (which reads as cramped/blank cells on some
surfaces, notably the GitHub mobile app), duplicated "run locally" content, the long compatibility
paragraph living in the README instead of docs, verbose interface/technology prose, and a mobile
screenshot shown at an unreadable inline size. All 10 tracked screenshots were verified: present,
correctly cased, recent app UI, demo-only data (`demo@lifegrid.test`), no credentials or personal
information.

## 2. Changes

- README restructured to the agreed 14-section order: tagline, badge, product intro, key features,
  screenshot gallery, technology, architecture, project structure, getting started, environment
  configuration, testing, security/data safety, documentation index, license.
- Screenshot gallery rebuilt **without tables** (inline `<img>` pairs with width percentages and
  descriptive alt text; tall captures get their own row) so every image renders consistently on
  desktop web, mobile web and the GitHub mobile app. Rendered-HTML inspection of the current
  published page confirmed all 9 previously referenced images already resolved correctly
  (`/Chaithanya-07/Lifegrid/raw/main/docs/screenshots/…`); the tables were the presentation problem.
- Compatibility details moved to `docs/ARCHITECTURE.md` → new "TaskFlow compatibility identifiers"
  table; the README links to it.
- Forwarded-header/Railway wording adjusted to the verified posture (trust model documented; no
  unverified production-compat claim); no NVDA/VoiceOver or deployment claims.
- Test figures (335/366/39) verified against the 2026-11-12 runs; env var names verified against
  `.env.example` and `Program.cs` (`LIFEGRID_DATA_DIRECTORY`);
  `#taskflow-compatibility-identifiers` anchor verified; all README link targets verified
  case-exact on disk.

## 3. No application-code change

Documentation-only increment: README.md and docs/ARCHITECTURE.md. No schema, data, auth, or
feature code touched; existing user data untouched.

# Increment 9 — Repository history clean-up (2026-11-13)

Removed the co-author trailer lines from all 10 commit messages (they rendered a co-author avatar
on GitHub). Rewritten with `git filter-branch --msg-filter` — file contents, authors, dates,
subject lines and bodies otherwise byte-identical (verified by an empty `git diff` between the old
and new heads) — and force-pushed to `origin/main`. No tracked file contained any attribution
text (checked). Commit SHAs changed everywhere; docs were updated to the rewritten values. No
application-code change.
