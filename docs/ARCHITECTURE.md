# Lifegrid architecture

Lifegrid is a multi-user productivity app built by evolving the existing TaskFlow codebase: a React single-page UI, an ASP.NET
Core Web API and a SQLite database. Every user has a private account (cookie session and per-user filtering in the data layer);
see [PRODUCTION_SECURITY.md](PRODUCTION_SECURITY.md). Local development uses Vite and ASP.NET Core; deployment configuration
is documented in [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md).

```
Browser (React, Vite)  ──/api──▶  ASP.NET Core API (localhost:5062)  ──EF Core──▶  SQLite
  localStorage: settings, timer                     │                                data\taskflow.db
                                                    ├─ attachments  data\attachments\
                                                    └─ backups      data\backups\
```

For local development the API is at `http://localhost:5062` and the UI at `http://localhost:5174`. API requests require an
authenticated session except the public health and authentication endpoints.

## Backend layers

`Controllers → Services → Data access (EF Core DbContext) → SQLite`

| Layer | Folder | Responsibility |
|-------|--------|----------------|
| Controllers | `Controllers/` | Translate HTTP to a service call and back. Model binding + DTO validation attributes. **No business rules.** |
| Services | `Services/` | All rules: `TaskService` (queries, create/update, completion/board state, reschedule, duplicate, bulk, activity), `RecurrenceService` + `RecurrenceCalculator` (pure date maths), `TagService`, `NotificationService`, `FocusService`, `AttachmentService`, `ExportService`, `ImportService`, `BackupService`. |
| Data access | `Data/TaskFlowDbContext.cs`, `Models/`, `Migrations/` | EF Core's `DbContext` is the unit of work and its `DbSet`s are the repositories. A hand-written repository layer on top would only re-wrap `IQueryable`, so it was deliberately not added. |
| DTOs | `Dtos/` | Wire contracts. Entities are never serialised directly. |

Cross-cutting decisions:

* **Consistent errors.** Services throw `ApiException(status, message, field?)`; `ApiExceptionHandler` turns it into RFC 7807
  `ProblemDetails` (`400` with an `errors` dictionary for validation, `404`, `409`, `413`). Unexpected exceptions become a
  generic `500` and are logged, never leaked.
* **Time.** Everything uses an injected `TimeProvider`, so tests control "now" and the time zone. Timestamps are stored and
  returned in UTC; "today", due dates and weeks are calendar dates in the server's local zone.
* **Concurrency.** SQLite allows one writer. Multi-step writes run in `IsolationLevel.Serializable` transactions, which the
  SQLite provider maps to `BEGIN IMMEDIATE`, so concurrent requests queue instead of failing with `SQLITE_BUSY`. A unique index
  on `(RecurrenceRuleId, OccurrenceNumber)` is the last line of defence against a duplicate occurrence.
* **Migrations.** Applied automatically at start-up (`Database.Migrate()`); schema changes use additive EF migrations. Take and
  verify a production backup before deploying a migration.
* **Validation.** DTO attributes (`[Required]`, `[Range]`, `[StringLength]`) plus service checks that need the database
  (category/tag exists, start ≤ due, reminders need a due date, recurrence rules are sane, bulk values are valid).
* **SQL injection.** All access is through EF Core (parameterised); there is no raw SQL in request handling. `LIKE` patterns escape `% _ \`.
* **Uploads.** Extension allow-list, 10 MB / 20 per task, generated storage names (the user's file name is display-only and
  stripped of path parts), always served as a download with `X-Content-Type-Options: nosniff`.

### Task state model

`IsCompleted` and the board column `Status` (`Todo | InProgress | Done`) are two views of one fact: a task is completed exactly
when its status is `Done`. `TaskService.Transition` is the single place that changes either, so the checkbox, the Kanban board,
PUT, bulk actions and recurrence all agree. Completing a task stamps `CompletedAt`; reopening clears it.

### Recurrence

A `RecurrenceRule` holds the schedule shared by a series; each occurrence is an ordinary task pointing at the rule with an
`OccurrenceNumber`. Completing occurrence *N* (by any path) calls `RecurrenceService.SpawnNextAsync`, which

1. does nothing if the rule is stopped or occurrence *N+1* already exists (reopen → complete again never duplicates),
2. asks `RecurrenceCalculator.NextAfter(rule, dueDate, today)` for the next scheduled date — measured from the rule's
   **anchor date**, not from the previous occurrence, so "the 31st" does not drift to the 28th,
3. skips missed dates instead of queueing them (the next date is never before today) and never completes anything on the
   user's behalf,
4. honours `EndDate` and `MaxOccurrences` (the series ends and the rule is marked inactive),
5. copies title, notes, priority, category, tags, estimate, pinned/favorite, **unchecked** subtasks and relative reminders.

History is simply the earlier tasks in the series (`GET /api/tasks/{id}/occurrences`).

### Gamification

`GamificationService` awards the priority-based task XP and any eligible local-day completion bonus in the same serializable
transaction as the task status change. The `XpLedger` stores an auditable reward history; a unique per-user reward key protects
daily bonuses and a unique `(UserId, TaskId)` index prevents duplicate task awards. Deleting a task nulls its ledger reference
without deleting its rewards. Levels, achievements, streaks and weekly totals are derived from persisted records. Weekly goals
are stored per user one-row-per-account (unique `(UserId)`) with a database constraint limiting them to 1–100; concurrent
first-time goal writers resolve the unique race by converting the losing insert into an update (last write wins), so two tabs
opening Lifegrid at once never fail the request. Aggregations run in SQL over the indexed tables.

### Reminders and notifications

There is no background service. The open web page calls `POST /api/notifications/sync` every 30 s (paused while the tab is
hidden). The server turns due, un-notified reminders into `Notifications` rows (deduplicated by a unique key), plus one
"N tasks are overdue" digest per day and a per-task alert for timed tasks that passed their time today. Two open tabs syncing
at once cannot duplicate or fail: a writer losing the unique-key race drops only its committed duplicates and retries, so the
loser never returns 500 and the reminder "notified" stamps always persist (`SqliteUnique.cs` matches only the
`SQLITE_CONSTRAINT_UNIQUE` error; every other database failure propagates). **If Lifegrid is not
open in a browser tab, nothing can alert you** — that is a browser limitation, and a service worker was deliberately not added
because it still cannot wake a closed browser without a push service (which would need an external paid/cloud dependency).

### Backups

* **Backup** (`POST /api/backups`): the caller's export document written to a unique file `backups/<userId>/taskflow-backup-<UTC>.json`; never overwrites; the newest 25 are kept.
* **Export** (`GET /api/export`): JSON, schema `taskflow-export`, **version 2** (still reads version 1), with optional gamification
  history fields. CSV export is read-only. The schema name remains for compatibility.
* **Import**: preview (no writes) then apply; additive, de-duplicating, validated as a whole, one transaction, preceded by a
  `pre-import` snapshot.
* **Restore** (`POST /api/backups/{name}/restore?confirm=true`): reads the caller's backup file, takes a `pre-restore` backup, then — in one `Serializable` transaction — deletes all data and
  inserts the snapshot through the same validator. If anything is invalid the transaction rolls back and nothing changes.

## Frontend

React 19 + TypeScript + Vite, no UI or state library, no router library (hash routes), no new runtime dependencies.

| Concern | Where |
|---------|-------|
| Providers | `App.tsx` → `Providers`: Toast, Settings, TaskFlow store, Focus, TaskEditor |
| Store | `useTaskFlow.tsx`: loads **all** tasks, categories, tags and stats once, mutates through the API, then reloads. Optimistic updates (toggle, board move, reschedule, pin) roll back on error; a ticket counter discards out-of-order responses. |
| Filtering/sorting/search | `taskFilters.ts`, client-side over the loaded tasks, mirroring the server's rules, so every view is instant and consistent. (The server supports the same filters for other clients.) |
| Settings | `useSettings.tsx` → `localStorage` (`taskflow-settings`); time accents are resolved from the device clock; timer state remains in `focus/` (`taskflow-focus`). |
| Pages | `pages/` — Dashboard, Tasks (My Tasks/Inbox/Today/Upcoming/Completed), Calendar, Kanban, Categories/Tags (`ManagePage`), Analytics, Focus, Settings (+ Backup & data). |
| Shared UI | `components/` — `Modal`/`ConfirmDialog`, `TaskEditor`, `TaskRow`, `QuickAdd`, `CommandPalette`, `NotificationBell`, `SideNav`, `Feedback` (empty states, skeletons). |
| Styling | `index.css` holds the white-only surfaces, dark text, time-dependent accent tokens, shell and shared components; each page imports its own CSS. |

Trade-off worth knowing: loading every task into the browser is simple and fast for a personal list (the API caps an
import at 10 000 tasks and the list endpoint returns them in one response). If you routinely keep tens of thousands of tasks, the
store should move to server-side paging; the API already supports `status`, `q`, `tagIds`, `dueFrom`/`dueTo`, `limit`.

## Testing

| Layer | Tooling | Location |
|-------|---------|----------|
| Backend | xUnit + `WebApplicationFactory` against a throw-away SQLite file with a controllable clock | `api/TaskFlow.Tests` |
| Frontend | Vitest + Testing Library against an in-memory fake of the HTTP API | `web/src/*.test.ts(x)`, `web/src/testing/` |
| Browser | Playwright against the real frontend + API on an isolated throwaway SQLite instance (ports 5292/5293) — see [E2E_TESTING](E2E_TESTING.md) | `web/e2e`, `npm run test:e2e` |
| Concurrency | Unique-index race regressions interleaving the real stage/commit paths plus concurrent-HTTP storms | `api/TaskFlow.Tests/ConcurrencyTests.cs` |

## TaskFlow compatibility identifiers

Lifegrid evolves the TaskFlow codebase, and compatibility-sensitive identifiers are retained so that
existing databases, exports and sessions remain readable:

| Identifier | Value | Why it is kept |
|---|---|---|
| Project/namespace names | `TaskFlow.Api`, `TaskFlow.Tests` | Existing solutions, tooling and history reference them; renaming is cosmetic churn |
| Database filename | `taskflow.db` | An existing database file keeps working as-is; the migration history within it is additive |
| Backup file naming | `taskflow-backup-<UTC>.json` | Previously created backups stay listable and restorable |
| Export/import schema | `taskflow-export`, version 2 (reads version 1) | Existing export files remain importable |
| Browser storage keys | `taskflow-settings`, `taskflow-focus` | Returning users keep their settings and timer state |
| Sessions | Cookie name, session format and Data Protection identifiers | Existing sessions and Data Protection-generated identifiers remain valid |

User-facing product branding is Lifegrid; the identifiers above appear only in code, storage and
wire formats.
