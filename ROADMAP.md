# Lifegrid roadmap

Lifegrid is being built by transforming the existing TaskFlow application. This roadmap tracks implementation and validation; no
phase below implies that deployment or publication has been completed.

| Phase | Scope | Status |
|---|---|---|
| 1. Baseline and cleanup | Fix baseline tests and key warnings; verify frontend/backend checks, data safety and documentation | Baseline frontend failures and duplicate chart keys fixed. Documentation reconciliation and final checks continue. |
| 2. Branding and UI redesign | Lifegrid brand, white-only system, rounded responsive shell, and functional redesign of existing pages | Redesign applied across the shell, dashboard, task editor, task lists, Calendar, Kanban, Categories/Tags, Analytics, Focus, Notifications, Settings, sign-in, and a new Achievements screen. Overflow checked on all 15 routes at 390, 820 and 1440 px. Still open: automated accessibility audit and end-to-end tests. |
| 3. Time-based accents | Local-device-time schedule, automatic updates, dev simulator, boundary tests and accessibility | Schedule, simulator, period labels and messages are tested at every boundary (and every minute of the day); accent contrast is asserted at 5-minute steps across the schedule. |
| 4. Gamification | Transactional XP ledger, levels, streaks, achievements, weekly goals and reward history | Additive schema, service/API, constraints, reward rules, dashboard widget, Achievements screen, and JSON backup/import support are implemented. Edge-case and concurrency validation continues. |
| 5. Dashboard | Progress, deadlines, XP, streaks, achievements, weekly productivity and justified alerts | Implemented, including time-period message and a deadline alert shown only when tasks are actually due or overdue. |
| 6. Final QA | Frontend/API/migration/time/gamification tests, responsive and accessibility checks, end-to-end testing | Frontend 335 unit tests, backend 366 tests (including the unique-race concurrency and data-path portability tests) and the Playwright e2e suite (isolated throwaway instance on ports 5292/5293; see docs/E2E_TESTING.md) all pass, verified by running them. The e2e suite covers registration, sign-in, session expiry, dashboard, task create/edit/complete/reopen, XP-once, backups, data import/export journeys, backup restore and rollback, reminders/notifications, Kanban movement, Calendar display, a formal axe-core accessibility audit of 13 page/dialog states (docs/ACCESSIBILITY_AUDIT.md) — all clean at WCAG 2.1 A/AA after fixes — and the keyboard/screen-reader behaviour suite (docs/ACCESSIBILITY_AUDIT.md). The forward-progress fixes landed: PUT no longer reopens a Done task when `isCompleted`/`status` are omitted, Escape closes only the topmost overlay, and forwarded-header trust is tied to private/loopback proxy networks with spoofing regression tests (docs/PRODUCTION_SECURITY.md). Gamification and focus aggregation now run in the database (behaviour-preserving; volume-comparison tests included). A record-count audit found no artificial limits, and none were introduced. |
| 7. Publishing | Accurate README and docs, CI, environment example, license, screenshots, test report and metadata verification | Published: the repository is public at https://github.com/Chaithanya-07/Lifegrid (history preserved, no recreation). MIT LICENSE (© Kurra Chaithanya), `.env.example` (placeholders only), reviewed `.gitignore`, README with screenshots and the CI badge, a source-only `git archive` release zip, and docs reconciled. CI runs green on Windows runners (run 43220864806: 335 unit + 366 backend + 39 e2e tests, zero flaky attempts) after the first Linux-runner e2e run failed; Linux runners are recorded as an open issue in docs/GITHUB_PUBLISHING.md. Pending: Railway deployment (not attempted), Linux/container deployment revisit, manual NVDA/VoiceOver pass. |

## Preservation requirements

- Continue with the existing React/TypeScript/Vite frontend and ASP.NET Core/.NET 10 API; do not generate a replacement app.
- Preserve authentication, cookie and Data Protection identifiers, API contracts, database identity, user data, and existing task
  behavior.
- Add database functionality only through additive EF Core migrations. Back up and verify production data before applying one.
- Keep existing backup/import/export compatibility, including the `taskflow-export` schema identifier and existing backup names.
- Keep user-facing surfaces functional; do not substitute fake production data or leave inert controls.

## Validation commands

```powershell
cd web
npm test
npm run lint
npm run build
cd ..\api
dotnet test TaskFlow.Tests\TaskFlow.Tests.csproj
```

End-to-end tests, deployment checks, and GitHub publishing should use isolated test data and verified repository/hosting metadata.
