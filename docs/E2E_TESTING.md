# Playwright end-to-end tests

The `web/e2e` suite drives the real application — Vite frontend + ASP.NET Core API against a real
SQLite database — through a browser, with no mocks.

## Running

```powershell
cd web
npm run test:e2e          # run the whole suite (starts both servers automatically)
npm run test:e2e:report   # open the HTML report afterwards
npx playwright show-trace test-results\<some-test>\trace.zip   # inspect a failure
```

First run downloads Chromium once (`npx playwright install chromium` happens automatically only when
the browser is missing; install it explicitly if needed). Node and the .NET 10 SDK must be on PATH.

## How it is isolated

Nothing else on the machine may interfere, and nothing real is ever touched:

- **Dedicated ports.** The E2E API listens on `localhost:5292` and the frontend dev server on
  `localhost:5293`, so a running development instance (5062 / 5174) is never reused or blocked.
  `vite.config.ts` reads `VITE_API_ORIGIN` so the E2E frontend proxies `/api` to the E2E API.
- **Throwaway database.** `e2e/global-setup.ts` recreates `web/test-results/e2e-data/` per run and the
  API is pointed at it via environment variables (`ConnectionStrings__Default`,
  `Backups__Directory`, `Attachments__Directory`, `DataProtection__KeysDirectory`). The repository's
  real `data/` folder is never read or written by the suite.
- **Isolated accounts.** Each test registers its own throwaway account
  (`e2e-<timestamp>-<random>@example.test`, a non-routable domain) through the real UI.
- **Rate limiter.** The suite exceeds the 20/min auth limiter by design, so the E2E API instance sets
  `RateLimit__AuthPerMinute` high — the same approach `TaskFlow.Tests.ApiFactory` uses. The production
  default is untouched.
- **Allowed origin.** The E2E API accepts the 5293 origin via `Cors__Origins__0` (its Origin check
  refuses unknown origins on writes).

## What the tests cover

`auth.spec.ts` — registration, sign-out/sign-in persistence, and a simulated session expiry
(the session cookie is cleared client-side and the app must return to sign-in without leaking data).

`tasks.spec.ts` — dashboard widget loading; creating, editing, completing a task; verifying XP is
awarded once server-side (toggling a completed task down and up never pays twice); and the Completed
list + reopen flow.

`backup.spec.ts` — creating a backup and seeing it listed in Settings → Data.

`notifications.spec.ts` — the overdue-task digest appears in the bell after a fresh load, can be
marked read (unread count clears, entry stays) and dismissed; and a relative reminder set on a
future task surfaces in the bell panel's **Upcoming** tab ("Next 7 days").

`kanban-calendar.spec.ts` — Kanban: inline add into a column, the accessible count label, moving a
card with the keyboard-reachable Move buttons (To Do → Done → In Progress → To Do round trip), and
board search that filters cards without losing their column; Calendar: adding a task from a day
chip (dialog opens pre-filled with that date), the chip appearing in the month cell, selecting the
day to list it, showing the same day in week view, and month navigation updating the title.

`data-journeys.spec.ts` — JSON export downloads parseable account data; import preview validation
(a broken file is refused with "Nothing was changed", a valid file shows "Will be added" before any
write, importing into a *second* account really adds the task, and a duplicate import adds
nothing); backup restore — snapshot → create a task after it → preview restore reports nothing new
→ full restore rolls the account back (post-snapshot task gone, snapshot task back); and a second
browser context with a fresh account sees no backups from the first account (isolation).

`accessibility.spec.ts` — the formal axe-core audit of 13 page/dialog states; see
[ACCESSIBILITY_AUDIT](ACCESSIBILITY_AUDIT.md).

`keyboard.spec.ts` — the automated keyboard/review layer of the manual accessibility review: skip
link position + activation, Enter/Space on nav links and the bell, dialog Tab focus-trapping and
focus restoration on Escape, Escape reaching only the topmost overlay, form-validation `role="alert"`
announcements, and the mobile drawer opened by the labelled menu button, closed by Escape, with
focus trapped inside it while open and restored to the menu button on close.

`concurrency` — the unique-index race regressions (`api/TaskFlow.Tests/ConcurrencyTests.cs` in the
backend suite) interleave the real notification-sync and weekly-goal stage/commit paths around a
committed competing writer, and storm the HTTP endpoints with genuinely concurrent requests: losing
writers drop duplicates instead of 500ing and no row is ever duplicated.

## Conventions

- Role-based locators only (`getByRole`, `getByLabel`); sidebar links are always scoped to the
  `Main` navigation because dashboard shortcuts duplicate the same targets elsewhere.
- No fixed waits: expectations auto-wait, toasts and optimistic rows are asserted deliberately.
- Screenshots and traces are captured for failed tests (`only-on-failure` / `retain-on-failure`)
  under `web/test-results/`, which is gitignored.
