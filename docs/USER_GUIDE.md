# Lifegrid user guide

For local use, open **http://localhost:5174** after starting the API and frontend (see the README). Your data is stored in the
configured SQLite database; the default filename remains `taskflow.db` for compatibility.

## Finding your way around

The sidebar groups everything:

* **Dashboard** – your day at a glance (today, overdue, upcoming, task progress, XP, streaks, achievements, weekly goal, focus and productivity).
* **Tasks** – *My Tasks* (everything), *Inbox* (open tasks with no category and no date — things still to sort), *Today*
  (due today plus anything overdue), *Upcoming* (future dates), *Completed*.
* **Plan** – *Calendar* and *Kanban*.
* **Organize** – *Categories* (one per task) and *Tags* (as many as you like per task).
* **Insights** – *Analytics*, *Focus* (timer) and *Achievements* (level, XP progress, streaks, badges, weekly goal, reward history).
* **Settings**, **Help Center**, **Profile** (your account) and **Sign out** (bottom). A small label in the top bar shows the current
  time period.

On a phone the sidebar becomes a drawer behind the ☰ button. Press **Ctrl+K** anywhere for the command palette: type a page
or action ("calendar", "backup"), or part of a task title to jump straight to it.

## The task editor

Title, description, priority, category, due date and due time are always visible. Everything else is under **More details** as
collapsible sections (Notes, Start date, Tags, Reminders, Repeat, Time estimates, Status/pin/favorite). A section that already holds
something opens by itself and shows a short summary. **Subtasks**, **Files** and **History** appear once the task has been saved;
on a new task the editor says so instead of hiding them.

## Time-based accents

Lifegrid always uses white page surfaces and dark text. Accent colors change automatically using your device's local time:
green-to-peach in the morning, neutral at noon, yellow from 1–2 PM, lavender-blue from 2–3 PM, orange through the afternoon,
critical red from 5:50–7 PM, and neutral after 7 PM. The critical period overrides the orange/red transition. This changes accents,
not backgrounds or body text.

### Keyboard shortcuts
`Ctrl K` palette · `Q` quick-add · `N` new task · `/` search · `?` list shortcuts · `G` then `D/T/I/Y/U/C/K/A/F/S` go to
Dashboard / My Tasks / Inbox / Today / Upcoming / Calendar / Kanban / Analytics / Focus / Settings · `Esc` closes a dialog.
Single-letter shortcuts only work when you are not typing in a field. The full list is in **Settings → Keyboard shortcuts**.

## Adding tasks fast

The bar at the top of every page is **quick add**. Type a sentence and press Enter:

```
Pay rent tomorrow at 9am !high #home @Finance ~30m
Water the plants every 2 days
Gym every monday
Call Sam in 3 days
```

It understands `today`, `tomorrow`, weekday names (the *next* one), `next week`, `in 3 days`, `2026-12-31`, times (`5pm`, `at 17:30`),
`!low !medium !high !urgent`, `#tag` and `@Category` (existing ones; use `_` for spaces), `~45m` / `~2h` estimates, and
`daily / weekly / monthly / yearly / every 2 weeks / every weekday / every friday`. Anything it does not recognise stays in the
title. A live preview shows what it understood before you press Enter.

For everything else use **New task** (or `N`) to open the full editor.

## Tasks

A task has a title, description, notes, priority (Low / Medium / High / Urgent), start date, due date and time, estimate and
time spent, a category, any number of tags, optional subtasks, reminders, a repeat rule and attachments. In a list you can
complete it, **pin** it (pinned tasks stay on top), **favorite** it, edit, **duplicate** or delete it. Deleting always asks first.

* **Subtasks** are a checklist inside a task (one level deep). Completing the parent never completes or deletes unfinished subtasks.
* **Search** (`/`) matches titles, descriptions, notes, categories, tags and subtasks; all words must match; `#tag` matches a tag exactly.
* **Filters** (button next to the search box): priority, pinned, favorites, category, column, tags, and the state of the list.
* **Select** turns on bulk mode: tick several tasks (or *Select all shown*), then complete, reopen, set priority/category, add a tag,
  pin or delete them in one go.
* **Clear completed** (on the Completed page) deletes every finished task after you confirm.
* **History** (in the editor) shows what happened to a task and when: created, edited, completed, rescheduled, focus sessions…
* **Files** (in the editor) attaches files stored on this computer (up to 10 MB each, 20 per task; documents, images, text, archives).

## Repeating tasks

Tick **Repeat this task** in the editor and choose every *N* days / weeks / months / years. Weekly repeats can use chosen weekdays;
monthly repeats can use chosen days (`1, 15, last`). End never, on a date, or after a number of times.

* Completing an occurrence creates the next one (copying tags, estimate, reminders and **unchecked** subtasks). Reopening and completing
  again never creates a duplicate.
* If you finish late, the next one is the next scheduled date **from today** — you do not get a pile of missed copies, and nothing is
  ever completed for you.
* Month-ends are handled: a task on the 31st falls on the 28th/29th/30th in short months and returns to the 31st afterwards.
* **Edit** the rule any time (applies to future occurrences). **Stop repeating** ends the series but keeps the task and its history.
  Deleting the only open occurrence also ends the series. Saving a normal edit never changes the rule.

## Calendar

Month, week and day views with Previous / Next / Today. Tasks appear on their due date (with the time). **Click a day** to add a task
on that date, **drag a task to another day** to reschedule it, or use the date field on a task for keyboard and touch rescheduling.
Filter by category, priority or status. The side panel lists overdue, upcoming and unscheduled tasks.

## Kanban

Three columns: **To Do**, **In Progress**, **Done**. Drag a card between or within columns, or use the *Move to…* buttons on the card
(keyboard- and touch-friendly). Moving to Done completes the task (and creates the next occurrence of a repeating one); moving it back
reopens it. Each column has its own quick-add field. Search and filter by priority, category and tag.

## Reminders and notifications

Add reminders in the editor: at the due time, 10 / 30 / 60 minutes or 1 day before, a custom number of minutes, or an exact date and time.
A date-only task counts as due at 09:00. The **bell** in the top bar lists notifications (mark read, dismiss, dismiss all) and an
**Upcoming** tab with reminders still to come and overdue tasks. You also get a once-a-day "N tasks are overdue" notification (switch it off in Settings).

> **Important limitation:** Lifegrid checks reminders every 30 seconds **while it is open in a browser tab**. If the tab/browser is
> closed, nothing can alert you; overdue reminders show up when you next open the app. Browser (desktop) notifications need your
> permission — Settings → Reminders has the button — and a sound can be enabled there too.

## Focus timer

Pick a task (optional) and start a focus session (default 25 min). Short and long breaks follow automatically. Start, pause, resume,
reset (discard) or *Stop & log* (keeps a session of at least a minute). The timer is calculated from the clock and survives a page
refresh, but browsers may throttle or suspend background tabs — keep the tab open if you want the alert on time. If the time ran out while
Lifegrid was closed, the session is recorded as finished and the page tells you so. Today's focus time, streaks, a 14-day chart, your
most-focused tasks and the session history are on the Focus page. The top bar shows a small countdown while a timer is active.

## Analytics

Completed today / this week / this month, completion rate, average time to complete, current and best streaks, created-vs-completed per
day, weekly and monthly trends, priority and category breakdowns and overdue statistics. Everything is calculated from your real task
timestamps; where there is no data it says so instead of guessing.

## XP, levels and achievements

Completing a task awards XP once: Low 5, Medium 10, High 15, and Urgent 15. Reopening and completing the same task again does not
repeat its XP reward. Completing every task due today adds a one-time 20 XP daily bonus. Every 100 XP advances a level. The dashboard
shows current XP, level, streak, achievements, recent rewards, and progress toward a weekly task goal. The default goal is 10
completions; use the dashboard control to set a goal from 1 to 100. Streak dates and the daily bonus use the server's configured
local time zone.

## Settings

The theme is always white with time-based accents. Date and time format, first day of the week, default priority and landing page, default reminder, overdue
alerts, browser notifications and sound, focus-timer lengths, which dashboard widgets to show, backups, shortcuts and an About page
(version, where the data is stored, known limitations). Preferences are stored in this browser (`localStorage`).

## Backup, export, import and restore

*Settings → Backup & data*:

* **Create backup now** writes a per-account JSON snapshot in the configured backup folder. The newest 25 are kept; the existing
  `taskflow-backup-...` filename prefix is retained for compatibility.
* **Download everything (JSON)** is a portable export (tags, recurrence, reminders, focus sessions, XP history and attachment records…). **CSV** is for spreadsheets.
* **Import** a JSON export: you first see a **preview** (what would be added, what is skipped as a duplicate, any problems). Nothing changes until
  you confirm; a bad file is rejected as a whole. Existing tasks are never modified or removed.
* **Preview restore** on a backup adds whatever is missing (the safe, additive route).
* **Restore…** on a backup **replaces everything** with that backup, after an explicit confirmation. A safety copy (`taskflow-pre-restore-…`) is made first,
  and the swap is all-or-nothing, so a failed restore leaves your data as it was. You can undo a restore by restoring that safety copy.

Attachment file contents are stored separately and are *not* inside JSON backups or exports — copy the configured attachments
folder as well if you rely on them.
