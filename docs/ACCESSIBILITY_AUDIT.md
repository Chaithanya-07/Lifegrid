# Lifegrid accessibility audit

Formal automated audit of the real rendered pages with [axe-core](https://github.com/dequelabs/axe-core)
(via `@axe-core/playwright`), run as part of every `npm run test:e2e` pass. The audit is cumulative:
it fails the build when a serious violation appears, so regressions cannot be merged unchecked.

## How the audit works

- Suite: `web/e2e/accessibility.spec.ts` (part of the Playwright e2e project; see [E2E_TESTING](E2E_TESTING.md)
  for the isolated test environment it runs against).
- Each audit drives the **real frontend** in Chromium, registered against the real API, and lands in a
  representative dynamic state — not just the static routes:

  | # | Audited state |
  |---|---|
  | 1 | Sign-in page (pre-authentication) |
  | 2 | Dashboard |
  | 3 | My Tasks |
  | 4 | My Tasks with the **task editor dialog open** |
  | 5 | My Tasks with the **notification panel open** |
  | 6 | Completed |
  | 7 | Calendar |
  | 8 | Kanban |
  | 9 | Categories |
  | 10 | Analytics |
  | 11 | Focus |
  | 12 | Achievements |
  | 13 | Settings |

- Rule sets: WCAG 2.0/2.1 at levels A and AA (`wcag2a`, `wcag2aa`, `wcag2a1`→`wcag21a`, `wcag21aa` tags).
- Every violation of severity `critical` / `serious` is an assertion failure; the spec also writes the full
  axe result JSON for each state to `web/test-results/axe/` for inspection. Set `AXE_REPORT_ONLY=1` to
  produce the reports without failing on issues (useful while triaging minor/neutral findings).

## Findings and fixes (audit of 2026-11-12)

The first full run found **3 violations (17 nodes)** across the 13 states; all were fixed and a re-run of
the suite is clean. The visual design was not changed — every fix moved attributes or re-structured
semantics only.

| Violation (impact) | Where | Nodes | Fix |
|---|---|---|---|
| `label-content-name-mismatch` (serious): day buttons had accessible name `Show 2026-11-01` while the visible label is just the day number — speech-input users saying "open 1" could not activate them | `web/src/pages/CalendarPage.tsx` month/week/day cell buttons | 15 | Accessible name set to `formatLongDate(iso)` (e.g. "Sunday, November 1"), which contains the visible number text and passes the rule; the separate `title` tooltip was dropped |
| `definition-list` (serious): KPI tiles wrapped a `<dl>` (dt/dd) plus a hint `<span>` inside a generic `<div>`, and a stray span inside the list subtree | `web/src/pages/AnalyticsPage.tsx` (KPI row), `web/src/pages/FocusPage.tsx` (KPI row) | 2 | Restructured: the tile is a plain `div.kpi` holding a semantically clean `<dl><dt><dd>` and the hint `<span>` outside the list; a `.kpi dl { margin: 0; }` CSS rule keeps the browser's default `dl` margin from shifting the visual layout |
| `scrollable-region-focusable` (serious): the horizontally scrollable focus chart strip was not keyboard-focusable, so keyboard users could not reach its overflow content | `web/src/pages/FocusPage.tsx` chart strip | 1 | Added `tabIndex={0}` with `role="region"` and `aria-label="Focus minutes per day (scrollable)"` to the scroll container |

## Result

- After the fixes: **13/13 audits pass** with zero `critical`/`serious` violations across all audited states.
- The same fixes are covered in-place by the unit suite (e.g. `web/src/calendar.test.tsx` asserts the
  new long-form accessible name of the day buttons).

## Manual keyboard and screen-reader review (2026-11-12)

The automated axe layer cannot cover interaction paths, so these were reviewed
in code and verified by a permanent Playwright suite (`web/e2e/keyboard.spec.ts`,
6 tests — automatable so regressions fail the build, not just a spot check):

| Check | Result |
|---|---|
| Tab / Shift+Tab navigation | Verified — the skip link is the first tabbable element of the app shell; the sidebar, toolbar, list and dialog are reachable in DOM order |
| Enter and Space activation | Verified — Enter submits the sign-in form and activates nav links; Space toggles the notification bell and task checkboxes |
| Escape behaviour | Verified — Escape always reaches the visually topmost overlay (editor dialog above a notification panel closes the dialog first; the panel survives), one surface per press |
| Modal focus trapping and restoration | Verified — Tab cycles inside the task editor dialog for 40 stops forward and backward without escaping, and focus returns to the control that opened it when the dialog closes |
| Screen-reader labels | Verified — dialogs are `role="dialog"` with accessible names, state-bearing buttons expose `aria-expanded`/`aria-pressed`/`aria-invalid`, and decorative glyphs are `aria-hidden` |
| Form error announcements | Verified — validation failures render `role="alert"` messages ("Title is required.", sign-in failure text) and flag the field with `aria-invalid` |
| Notification panel accessibility | Verified — the bell is an `aria-expanded` `aria-haspopup="dialog"` button with an unread count in its accessible name; the panel is a labelled dialog with a tablist |
| Mobile navigation accessibility | Verified at 390 px — the hamburger is an `aria-expanded`, labelled button, Escape closes the drawer, focus moves back to the toolbar, and a skip link exists |

`aria-live` surfaces: toasts are `role="status"` (`aria-live="polite"`), loading and empty
states use `role="status"`, and banners use `role="alert"`.

### Unresolved limitations (documented, accepted)

- The mobile navigation drawer does not trap focus while open: keyboard users can Tab into the
  background content beneath the scrim (they still reach and close the drawer with Escape only
  from inside the page; focus does not jump back automatically when the drawer closes).
- Live-region announcements of dynamic list changes (e.g. a card moving on the Kanban board under
  drag) are not announced; the accessible Move buttons provide the equivalent non-visual path.
- Screen-reader passes with real assistive technology (NVDA/VoiceOver) have not been executed;
  everything above is verified through Playwright against Chromium's accessibility tree.


These are *not* violations in the enforced rule sets and were left unchanged:

## Remaining minor / neutral notes

- `aria-*` attributes with incomplete support per axe's browser matrix (e.g. `aria-describedby` usage in a
  few inputs) are reported as **neutral** best-practice advisories only.
- Colour-contrast is validated for the enforced rule set against the rendered light theme; theme variants
  beyond the default are not machine-audited yet.
- Full keyboard-path checks are now automated in `web/e2e/keyboard.spec.ts` (see the manual review
  section above); passes with real assistive technology (NVDA/VoiceOver) remain outstanding.

## Re-running the audit

```powershell
cd web
npm run test:e2e            # full suite, includes the accessibility audits
npx playwright test accessibility   # only the 13 audits
AXE_REPORT_ONLY=1 npx playwright test accessibility   # reports only, never fails
```

Reports land in `web/test-results/axe/*.json` after a run (the folder is recreated on each run).
