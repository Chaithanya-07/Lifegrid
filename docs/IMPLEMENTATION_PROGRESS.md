# Lifegrid implementation progress

The existing TaskFlow application is being transformed in place. The database, migration history, authentication identifiers, APIs,
and existing task workflows are being preserved. This document describes the current implementation state; it is not a release
or deployment certification.

## Delivered in the current implementation batch

- Fixed the four baseline frontend test failures and the duplicate weekly analytics fixture keys.
- Replaced light/dark/system theme behavior with invariant white surfaces, dark text, and a local-device-time accent engine.
- Added time-boundary and precedence tests plus a development-only time simulator.
- Updated the main user-facing brand surfaces and redesigned the initial application shell/sidebar.
- Added an additive gamification migration, per-user XP ledger and weekly goal settings.
- Awarded task and daily-bonus XP in the task-completion transaction, with unique database constraints to prevent duplicates.
- Added the gamification API, dashboard XP/level/streak/achievement/reward widget, editable weekly goal, and optional export/import support.
- Preserved existing TaskFlow schema, database filename, session/Data Protection identifiers, and backup filename compatibility.
- Refined responsive page styling for task lists and editor, Kanban, Calendar, Settings, authentication, and Focus while retaining their existing interactions.

## Delivered in the UI/UX redesign pass

- **Dashboard nesting bug fixed.** The rewards widget had been rendered inside Completion progress. All ten widgets are now direct children of one grid, enforced by a test that asserts parentage and no nesting.
- **New design system** in `web/src/index.css`: surface/text/border/shadow/radius/control-height tokens, fixed semantic colours, and only `--accent*` tokens driven by the clock. The accent ink luminance cap was tightened so accent text and filled buttons meet 4.5:1 across the whole schedule (a measured gap of 3.8:1 at 5:45 PM was found and fixed).
- **Sidebar and shell:** floating rounded sidebar with Main menu / Tasks / Plan / Organize / Insights groups, Settings, Help Center, Profile (opens Settings → Account) and Sign out at the bottom; collapses on desktop, drawer on mobile. Added a top-bar time-period badge.
- **New routes/screens:** Achievements (level, XP progress, streaks, badges with real progress, weekly goal, reward history) and a Help Center dialog. The Achievements route reuses the dashboard's shared reward components instead of duplicating them.
- **Dashboard:** hero (greeting, date, live time, period label and message, deadline alert only when real tasks justify it, New task, Customize), balanced widget grid, empty states with actions, Recent activity widget (new, derived from existing task timestamps).
- **Task editor:** primary fields always visible; Notes, Start date, Tags, Reminders, Repeat, Time estimates and Status/pin/favorite as collapsible sections with summaries; Subtasks, Files and History for saved tasks. No fields or capabilities were removed.
- **Restyled to the same system:** task list pages, Calendar, Kanban, Categories/Tags, Analytics (weekly and monthly charts side by side), Focus (timer beside statistics), Notifications, Settings, and sign-in (brand panel plus form).
- **Bug found by a measured route sweep and fixed:** the Focus page overflowed horizontally on phones (521 px in a 375 px viewport).
- No backend, API, migration or XP-ledger code was changed in this pass. The existing uniqueness constraints (`UserId`+`RewardKey`, `UserId`+`TaskId`) and serializable transactions were reviewed and left as they are.

## Delivered in the full-project review pass

An adversarial four-track review (backend, frontend, tests/tooling, docs/deployment) confirmed the claimed test counts by running
both suites, verified user-data isolation, XP-ledger uniqueness, attachment path-traversal defences and the time-accent contrast
claims against the code, and found no data-loss or crash-on-main-path bugs. Fixes applied from the findings:

- Fixed two double-encoded (mojibake) strings in the task editor: the time-estimates summary separator and the Notes placeholder.
- Cleaned up toast auto-dismiss timers on unmount in `useToast.tsx`, removing the unhandled `window is not defined` error that
  fired after jsdom teardown in the frontend test run.
- Routed the three hand-rolled fetch paths in `api.ts` (`uploadAttachment`, `listBackups`, `readBackup`) through the shared
  401 handling, so an expired session on the backup/attachment surfaces returns to sign-in like every other request.
- Added an empty-series guard to the analytics `TrendChart` (defensive; the API always fills the daily series today).
- Marked `AllowedHosts` as required in `RAILWAY_DEPLOYMENT.md`; its bundled `localhost` default otherwise fails every request,
  including the health check, on the first production deploy.
- Audited the codebase for record-count restrictions: none exist. Task, category, tag, subtask creation has no count-based
  validation; the optional `limit` query parameter (1–5000) is a bounds check on an unused API parameter, the Kanban Done column
  shows all cards via "Show all", and the attachment quota is a storage safeguard. Existing user data is untouched; no database
  or migration change was made in this pass.

Known issues recorded for future passes (not yet fixed): the "local day" for XP/streaks/analytics uses the server time zone
(configurable via `TZ`; a multi-timezone deployment would need per-user zones), concurrent notification-sync or weekly-goal
writes can 500 on the unique-constraint race, and Dashboard widgets show in a fixed order (the Customize panel cannot reorder
them). Resolved since that list was written (see the passes below): forwarded-header trust, put-with-omitted-fields reopening
a Done task, in-memory gamification/focus aggregation, and Escape not reaching the topmost modal.

## Delivered in the e2e-and-reliability pass

- Added a Playwright end-to-end suite (`web/e2e`, `npm run test:e2e`) driving the real frontend + API
  against a throwaway SQLite database on dedicated ports 5292/5293, with isolated per-test accounts,
  rate-limit overrides matching the unit-test factory, and failure screenshots/traces. See
  [E2E_TESTING](E2E_TESTING.md). It covers registration, sign-in/out persistence, simulated session
  expiry, dashboard loading, task create/edit/complete, server-authoritative XP awarded exactly once
  (re-toggling never re-pays), the Completed list and reopen flow, and backup creation.
- Fixed `PUT /api/tasks/{id}` reopening a Done task when both `isCompleted` and `status` were omitted:
  `TaskInput.IsCompleted` is now nullable, and an omitted field keeps the current board column; an
  explicit `true` completes, an explicit `false` reopens. The frontend fakeServer mirrors the rule.
  Regression tests cover omitted fields, explicit completion, explicit reopening, and the in-progress
  invariant.
- Fixed Escape between overlays: the notification panel now joins the shared `Modal` overlay stack,
  so Escape closes the visually topmost surface first (a keyboard-opened dialog above the panel gets
  the Escape; the panel above a dialog keeps the dialog). Two regression tests cover both orders.
- No backend, database, migration or API-contract change beyond the nullable `IsCompleted` field
  (additive; older clients unaffected). Existing user data is untouched.
- The frontend `vite.config.ts` now reads `VITE_API_ORIGIN` for the proxy target (optional; the
  default `http://localhost:5062` behaviour is unchanged), and `@types/node` was added for the
  node-side config files.

## Delivered in the security, performance and accessibility pass

- **Forwarded-header trust** (`api/TaskFlow.Api/Program.cs`): `X-Forwarded-For/Proto` processing is honoured only when a
  private/loopback network delivered the header (loopback, RFC 1918, link-local, IPv6 unique-local in `KnownNetworks`; no public
  host trusted). A client-supplied spoofed leftmost entry can no longer rotate the rate-limit identity; processing stops at the
  first public (real client) address read from the right. Regression tests in `api/TaskFlow.Tests/ForwardedHeaderTests.cs` cover
  spoofed and trusted-proxy requests. Deployment assumptions documented (see [PRODUCTION_SECURITY](PRODUCTION_SECURITY.md)).
- **Database-side aggregation** (`GamificationService.GetAsync`, `FocusService.StatsAsync`): the full-table in-memory loops moved
  to SQL (`SumAsync`, `CountAsync`, window-bounded range queries, `Union`/`GroupBy` with aggregate projections). All calculated
  results are preserved — the two new volume tests in `api/TaskFlow.Tests/StatsAggregationTests.cs` (55 completions / 19 focus
  sessions across 31+ days) pin the exact response shape against large inputs. No schema or index changes were needed (the
  existing `XpLedger` and `FocusSessions` indexes cover the queries); no record-count limit was introduced.
- **Accessibility audit**: axe-core WCAG 2.1 A/AA across 13 real page/dialog states (part of the e2e suite). Fixed all initial
  serious findings — calendar day buttons' accessible names, definition-list semantics in the Analytics/Focus KPI tiles, and a
  keyboard-focusable focus-chart scroll region — with no visual changes. See [ACCESSIBILITY_AUDIT](ACCESSIBILITY_AUDIT.md).
- **E2E coverage expansion** (`web/e2e/notifications.spec.ts`, `kanban-calendar.spec.ts`, `data-journeys.spec.ts`): overdue
  digest read/dismissal, reminder → Upcoming tab, Kanban inline add + Move buttons + search, Calendar day-chip add, month/week
  display and navigation, import preview/validation (broken file refused, positive import into a second account, duplicate skip),
  backup preview-restore and full restore/rollback, and multi-account backup isolation. All against the throwaway instance; the
  real database is never touched.
- Existing user data was untouched throughout; no database or migration change was made in this pass.

## Delivered in the production-readiness pass

- **Concurrent-write reliability**: the two known unique-index races are fixed — a notification-sync
  writer that loses the (UserId, DedupeKey) race drops its now-duplicate staged inserts and still
  persists its reminder stamps; a weekly-goal writer that loses the (UserId) create race retries as an
  update (last write wins); the import path that stages a goal guards the same way. Only
  `SQLITE_CONSTRAINT_UNIQUE` is matched (extended error 2067) — every other database failure propagates
  unchanged. `api/TaskFlow.Tests/ConcurrencyTests.cs` proves all four deterministic interleavings plus
  genuine concurrent-write HTTP storms. No schema or migration change.
- **Manual accessibility review** completed and automated as `web/e2e/keyboard.spec.ts` (6 tests:
  tab order, Enter/Space, Escape topmost-overlay order, dialog focus trap/restoration, error
  announcements, mobile drawer). Remaining limitations documented in ACCESSIBILITY_AUDIT.md (drawer
  focus is not trapped; no NVDA/VoiceOver pass yet).
- **Git repository**: initialized on `main` with the existing `.gitignore` (reviewed; `.env.example`
  carved out of the `.env.*` exclusion). Databases, user data, backups, attachments, keys, build
  outputs, test artifacts and `.playwright-mcp/` are excluded; no file was deleted to shrink the tree.
- **`.env.example`** created: variable names with placeholders only; verified by booting the API from
  env-only configuration against a throwaway database (health check OK; `data/` untouched).
- **LICENSE**: MIT, © Kurra Chaithanya.
- **CI**: `.github/workflows/ci.yml` — three jobs (frontend lint/unit/build, backend restore/build/test,
  Playwright e2e on the throwaway instance) using `npm ci`, uploading reports and failure artifacts,
  triggered on pushes to `main` and pull requests. Runs in GitHub Actions, not yet executed there.
- **Clean-clone verification** performed from a fresh `git clone` (see the final increment report).

## Delivered in the final release-review pass

- **Portable development data configuration**: `appsettings.Development.json` no longer hard-codes a
  machine-specific absolute path. It ships relative paths, resolved at startup against the API's
  content root (`api/TaskFlow.Api` under `dotnet run`), so the repository's existing `data/` directory
  is used regardless of the terminal's working directory. The whole development data directory can be
  relocated with `LIFEGRID_DATA_DIRECTORY` (or `LifeGrid__DataDirectory`); absolute paths in
  configuration are always respected, so the test factories and deployment configuration are
  unaffected (`api/TaskFlow.Api/Data/DevDataPaths.cs`, pinned by `DevDataPathsTests.cs`).
- **Startup data-path diagnostic**: the development log states the resolved database, backup and
  attachment locations (`info: TaskFlow.Api[0] LifeGrid development data — database: …`). Verified by
  booting the real development data: the log resolves `data\taskflow.db`, migrations report "already
  up to date", the main database file checksum is unchanged after the run, and read-only row counts,
  integrity check and user/hashes are identical before and after (2 users, 2 tasks). The override was
  verified against a temporary directory, then removed.
- **Mobile drawer focus trap** (previously a documented limitation): the drawer now receives focus
  when opened, Tab cycles inside it while open, Escape closes it, and focus returns to the menu
  button. Dialogs opened above (task editor, command palette) are served first, so Escape still only
  reaches the topmost surface. Two e2e tests cover it.
- **Release package**: a source-only archive is produced from the git commit graph
  (`git archive`), verified to contain 239 entries with no databases, user data, build outputs,
  `node_modules`, logs, run-state files, Playwright artifacts, environment files with values, or
  Data Protection keys, and with LICENSE, `.env.example`, the CI workflow, the Docker/Railway files,
  the package lock files and all 13 EF Core migrations present.
- **Deployment hardening**: `docker-entrypoint.sh` now defaults `AllowedHosts` from Railway's
  `RAILWAY_PUBLIC_DOMAIN` when unset (the bundled localhost-only default otherwise fails every
  request on a first deploy; an explicit value always wins) and non-root container starts no longer
  fail if the data folders cannot be created. Review found the persistent-volume layout (`/data`),
  the Data Protection key persistence, health-check path and forwarded-header trust posture already
  correct and documented.
- **CI review**: the workflow (frontend, backend, e2e jobs; npm and NuGet caching; browser install;
  result/failure artifact uploads; push and PR triggers) was re-verified step by step and a NuGet
  package cache was added to the backend and e2e jobs. It has **not** been executed on GitHub yet —
  no CI-passing claim is made until a real Actions run completes.

## Still in progress

- Screen-reader testing with NVDA/VoiceOver (the automated axe audit covers the rule-based WCAG layer and the keyboard behaviours
  are automated in `web/e2e/keyboard.spec.ts`; a manual assistive-technology pass is still open — see ACCESSIBILITY_AUDIT.md).
- Dashboard widgets use a fixed layout; the Customize panel shows or hides them but does not reorder them.
- Review every user-facing product string and reconcile all remaining architecture, API, database, deployment, and publishing docs.
- Add final migration, time-zone, gamification edge-case, API, and end-to-end coverage.
- Verify deployment configuration and repository metadata before making public deployment or publishing claims.

## Validation

Use the repository's existing runners:

```powershell
cd web
npm test
npm run lint
npm run build
cd ..\api
dotnet test TaskFlow.Tests\TaskFlow.Tests.csproj
```

Latest verification: backend **366/366** tests passed (the forwarded-header, stats-volume, unique-race concurrency and
data-path portability tests included); the frontend unit suite passed **335/335** with no unhandled errors; the
**Playwright e2e suite passed 39/39** (19 journey tests, the 13-state axe accessibility audit, and 7
keyboard/screen-reader tests, the newest covering the mobile-drawer focus trap), re-verified from a fresh `git clone`
alongside installs, build and every other check. The production build succeeds and lint exits successfully with two existing
`unicorn(no-useless-fallback-in-spread)` warnings.

The backend integration tests use temporary SQLite databases. Build/test outputs and test data must not be pointed at a production
database. Run a verified backup before deploying any migration to production.
