import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type Analytics, type FocusStats, type Task } from '../api'
import { EmptyState, Skeleton } from '../components/Feedback'
import { Icon, type IconName } from '../components/Icon'
import { BadgeGrid, LevelMedal, NextBadge, RewardList, WeeklyGoal, XpBar, useGamification } from '../components/Rewards'
import { useTaskEditor } from '../components/TaskEditor'
import { addDays, dueLabel, formatLongDate, formatMinutes, formatTime, greeting, timeAgo, toISO } from '../dates'
import { useTimePeriod } from '../timeTheme'
import { hashFor, type Route } from '../useRoute'
import { WIDGETS, useSettings, type WidgetId } from '../useSettings'
import { useTaskFlow, useToday } from '../useTaskFlow'
import './dashboard.css'

const LIMIT = 6
type Tone = 'default' | 'danger' | 'ok'

function Widget({
  id, title, icon, count, tone = 'default', link, children,
}: {
  id: string
  title: string
  icon: IconName
  count?: number
  tone?: Tone
  link?: { route: Route; label: string; param?: string }
  children: ReactNode
}) {
  return (
    <section className={`widget widget-${id} tone-${tone}`} aria-labelledby={`w-${id}`}>
      <header className="widget-head">
        <span className="widget-icon" aria-hidden="true"><Icon name={icon} /></span>
        <h3 id={`w-${id}`}>{title}</h3>
        {count !== undefined && count > 0 && <span className="widget-count" aria-hidden="true">{count}</span>}
        {link && (
          <a href={hashFor(link.route, link.param)} className="widget-link">
            {link.label}
            <Icon name="chevronRight" />
          </a>
        )}
      </header>
      <div className="widget-body">{children}</div>
    </section>
  )
}

/** A friendly, vertically centred empty state with one meaningful next step. */
function WidgetEmpty({ icon, title, hint, action, tone }: { icon: IconName; title: string; hint?: string; action?: ReactNode; tone?: Tone }) {
  return (
    <div className={`widget-empty-block${tone === 'ok' ? ' ok' : ''}`}>
      <span className="we-icon" aria-hidden="true"><Icon name={icon} /></span>
      <p className="widget-empty">{title}</p>
      {hint && <p className="hint">{hint}</p>}
      {action}
    </div>
  )
}

function MiniList({
  tasks, today, more, route, empty, addLabel, onAdd,
}: { tasks: Task[]; today: string; more: string; route: Route; empty: ReactNode; addLabel?: string; onAdd?: () => void }) {
  const store = useTaskFlow()
  const editor = useTaskEditor()
  const { settings } = useSettings()
  if (tasks.length === 0) return <>{empty}</>
  return (
    <>
      <ul className="mini-list">
        {tasks.slice(0, LIMIT).map((t) => {
          const due = t.dueDate ? dueLabel(t.dueDate, today, settings.dateFormat) : null
          return (
            <li key={t.id} className={t.isCompleted ? 'done' : ''}>
              <input
                type="checkbox"
                aria-label={`Mark "${t.title}" as ${t.isCompleted ? 'not done' : 'done'}`}
                checked={t.isCompleted}
                onChange={() => void store.toggleTask(t.id)}
              />
              <button type="button" className="linklike mini-title" onClick={() => editor.open({ task: t })}>
                {t.title}
              </button>
              {t.priority === 'Urgent' || t.priority === 'High' ? <span className={`badge p-${t.priority.toLowerCase()}`}>{t.priority}</span> : null}
              {due && (
                <span className={`mini-due${due.overdue ? ' overdue' : ''}`}>
                  {due.text}
                  {t.dueTime && ` · ${formatTime(t.dueTime, settings.timeFormat)}`}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {tasks.length > LIMIT ? (
        <a className="widget-more" href={hashFor(route)}>
          {tasks.length - LIMIT} more {more}
        </a>
      ) : (
        onAdd && addLabel && (
          <button type="button" className="widget-add" onClick={onAdd}>
            <Icon name="plus" /> {addLabel}
          </button>
        )
      )}
    </>
  )
}

function Ring({ pct, label }: { pct: number; label: string }) {
  const r = 38
  const c = 2 * Math.PI * r
  return (
    <svg className="ring" viewBox="0 0 100 100" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <circle cx="50" cy="50" r={r} className="ring-track" />
      <circle cx="50" cy="50" r={r} className="ring-fill" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 50 50)" />
      <text x="50" y="56" textAnchor="middle" className="ring-text">
        {pct}%
      </text>
    </svg>
  )
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const W = 160
  const H = 44
  const max = Math.max(1, ...values)
  const step = W / values.length
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {values.map((v, i) => (
        <rect key={i} x={i * step + 1} width={Math.max(1, step - 3)} y={H - (v / max) * (H - 4) - 2} height={(v / max) * (H - 4) + 2} rx="2" className={v === 0 ? 'zero' : undefined} />
      ))}
    </svg>
  )
}

function FocusWidget() {
  const [stats, setStats] = useState<FocusStats | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    api.focusStats(7).then(
      (s) => live && setStats(s),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [])
  if (failed) return <WidgetEmpty icon="focus" title="Focus statistics are unavailable right now." />
  if (!stats) return <p className="widget-empty" role="status">Loading…</p>
  if (stats.totalSessions === 0 && stats.todaySeconds === 0)
    return (
      <WidgetEmpty
        icon="focus"
        title="No focus sessions yet. Start a timer to build your history."
        action={<a className="button" href={hashFor('focus')}><Icon name="play" /> Start a focus session</a>}
      />
    )
  return (
    <dl className="mini-kpis">
      <div><dt>Today</dt><dd>{formatMinutes(Math.round(stats.todaySeconds / 60))}</dd></div>
      <div><dt>Sessions today</dt><dd>{stats.todaySessions}</dd></div>
      <div><dt>Streak</dt><dd>{stats.currentStreak} day{stats.currentStreak === 1 ? '' : 's'}</dd></div>
    </dl>
  )
}

function ProductivityWidget() {
  const [data, setData] = useState<Analytics | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    api.analytics(14).then(
      (d) => live && setData(d),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [])
  if (failed) return <WidgetEmpty icon="analytics" title="Productivity numbers are unavailable right now." />
  if (!data) return <p className="widget-empty" role="status">Loading…</p>
  if (data.total === 0)
    return (
      <WidgetEmpty
        icon="analytics"
        title="Complete a few tasks and your trends will appear here."
        action={<a className="button" href={hashFor('tasks')}><Icon name="tasks" /> Open My Tasks</a>}
      />
    )
  const done = data.daily.map((d) => d.completed)
  return (
    <>
      <dl className="mini-kpis">
        <div><dt>Done today</dt><dd>{data.completedToday}</dd></div>
        <div><dt>This week</dt><dd>{data.completedThisWeek}</dd></div>
        <div><dt>Streak</dt><dd>{data.bestStreak ? `${data.currentStreak ?? 0} day${data.currentStreak === 1 ? '' : 's'}` : '—'}</dd></div>
      </dl>
      <Sparkline values={done} label={`Tasks completed per day over the last ${done.length} days: ${done.reduce((a, b) => a + b, 0)} in total`} />
      <p className="spark-caption">Completed per day, last {done.length} days</p>
    </>
  )
}

function RewardsWidget() {
  const { data, failed, reload } = useGamification()
  if (failed && !data) return <WidgetEmpty icon="trophy" title="Gamification data is unavailable right now." />
  if (!data) return <p className="widget-empty" role="status">Loading…</p>
  return (
    <div className="rewards">
      <div className="rewards-main">
        <div className="rewards-top">
          <LevelMedal level={data.level} />
          <div className="rewards-level">
            <span className="hint">Total XP</span>
            <strong>{data.totalXp}</strong>
            <XpBar data={data} />
          </div>
        </div>
        <dl className="rewards-stats">
          <div><dt><Icon name="flame" /> Current streak</dt><dd>{data.currentStreak} day{data.currentStreak === 1 ? '' : 's'}</dd></div>
          <div><dt><Icon name="trophy" /> Longest streak</dt><dd>{data.longestStreak} day{data.longestStreak === 1 ? '' : 's'}</dd></div>
          <div><dt><Icon name="zap" /> XP this week</dt><dd>{data.xpThisWeek}</dd></div>
        </dl>
        {failed && <p className="widget-error" role="alert">Gamification data could not be refreshed; the displayed summary may be out of date.</p>}
        <NextBadge items={data.achievements} />
        <WeeklyGoal data={data} onSaved={reload} />
      </div>
      <div className="rewards-side">
        <div className="rewards-section">
          <div className="rewards-section-head">
            <strong>Achievements</strong>
            <a className="widget-link" href={hashFor('achievements')}>View all <Icon name="chevronRight" /></a>
          </div>
          {data.achievements.some((a) => a.unlocked) ? null : <p className="hint">Complete tasks to unlock badges.</p>}
          <BadgeGrid items={data.achievements} limit={6} />
        </div>
        <div className="rewards-section">
          <strong>Recent rewards</strong>
          <RewardList items={data.rewardHistory} limit={3} />
        </div>
      </div>
    </div>
  )
}

function ActivityWidget() {
  const store = useTaskFlow()
  const editor = useTaskEditor()
  const { settings } = useSettings()
  const now = new Date()

  const items = useMemo(() => {
    const events = store.tasks.map((t) => {
      if (t.completedAt) return { task: t, at: t.completedAt, verb: 'Completed', icon: 'completed' as IconName }
      const edited = Date.parse(t.updatedAt) - Date.parse(t.createdAt) > 5000
      return { task: t, at: edited ? t.updatedAt : t.createdAt, verb: edited ? 'Updated' : 'Added', icon: (edited ? 'edit' : 'plus') as IconName }
    })
    return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4)
  }, [store.tasks])

  if (items.length === 0) {
    return (
      <WidgetEmpty
        icon="pulse"
        title="No activity yet."
        hint="Added, updated and completed tasks show up here."
        action={<button type="button" onClick={() => editor.open({})}><Icon name="plus" /> Add a task</button>}
      />
    )
  }
  return (
    <ul className="activity-feed">
      {items.map((e) => (
        <li key={e.task.id}>
          <span className={`feed-icon feed-${e.verb.toLowerCase()}`} aria-hidden="true"><Icon name={e.icon} /></span>
          <button type="button" className="linklike feed-text" onClick={() => editor.open({ task: e.task })}>
            {e.verb} “{e.task.title}”
          </button>
          <time className="feed-time" dateTime={e.at}>{timeAgo(e.at, now, settings.dateFormat)}</time>
        </li>
      ))}
    </ul>
  )
}

function clockText(now: Date, format: Parameters<typeof formatTime>[1]) {
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return formatTime(`${hh}:${mm}:00`, format)
}

export function DashboardPage() {
  const store = useTaskFlow()
  const today = useToday()
  const editor = useTaskEditor()
  const { settings, update } = useSettings()
  const { now, period } = useTimePeriod()
  const [customizing, setCustomizing] = useState(false)

  const data = useMemo(() => {
    const open = store.tasks.filter((t) => !t.isCompleted)
    const byDue = (a: Task, b: Task) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || (a.dueTime ?? '').localeCompare(b.dueTime ?? '') || a.id - b.id
    const weekEnd = addDays(today, 7)
    return {
      open: open.length,
      today: open.filter((t) => t.dueDate === today).sort(byDue),
      upcoming: open.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= weekEnd).sort(byDue),
      overdue: open.filter((t) => t.dueDate && t.dueDate < today).sort(byDue),
      high: open
        .filter((t) => t.priority === 'High' || t.priority === 'Urgent')
        .sort((a, b) => Number(b.priority === 'Urgent') - Number(a.priority === 'Urgent') || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.id - b.id),
      doneToday: store.tasks.filter((t) => t.completedAt && toISO(new Date(t.completedAt)) === today).length,
    }
  }, [store.tasks, today])

  const total = store.tasks.length
  const completed = store.tasks.filter((t) => t.isCompleted).length
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100)
  const on = (id: WidgetId) => settings.widgets[id]
  const anyOn = WIDGETS.some((w) => on(w.id))

  // Only warn when real deadlines justify it: tasks due today or already overdue.
  const deadlineAlert = useMemo(() => {
    if (period.phase !== 'warning' && period.phase !== 'critical') return null
    const parts = []
    if (data.today.length) parts.push(`${data.today.length} due today`)
    if (data.overdue.length) parts.push(`${data.overdue.length} overdue`)
    if (parts.length === 0) return null
    return `${period.phase === 'critical' ? 'Critical deadline' : 'Deadline check'}: ${parts.join(' and ')}.`
  }, [period.phase, data.today.length, data.overdue.length])

  return (
    <section aria-label="Dashboard" className="dashboard">
      <section className={`hero phase-${period.phase}`} aria-label="Overview">
        <div className="hero-main">
          <span className="hero-chip">
            <span className="period-dot" aria-hidden="true" />
            {period.label}
            <span className="hero-time">{clockText(now, settings.timeFormat)}</span>
          </span>
          <h2 className="hero-title">{greeting(now)}</h2>
          <p className="hero-date">{formatLongDate(today)}</p>
          <p className="hero-message">{period.message}</p>
          {deadlineAlert && (
            <p className="hero-alert" role="status">
              <Icon name="alert" /> {deadlineAlert}
            </p>
          )}
          <p className="quick-hint">
            Press <kbd>Q</kbd> to quick-add — try <em>“Call Sam tomorrow 5pm !high #work”</em>. <kbd>Ctrl</kbd> <kbd>K</kbd> opens the command palette.
          </p>
          <div className="hero-actions">
            <button type="button" className="primary" onClick={() => editor.open({})}>
              <Icon name="plus" /> New task
            </button>
            <button type="button" aria-expanded={customizing} onClick={() => setCustomizing((v) => !v)}>
              <Icon name="settings" /> Customize
            </button>
          </div>
        </div>
        <dl className="hero-stats">
          <div className="hero-stat"><dt>Due today</dt><dd>{data.today.length}</dd></div>
          <div className={`hero-stat${data.overdue.length ? ' is-danger' : ''}`}><dt>Overdue</dt><dd>{data.overdue.length}</dd></div>
          <div className="hero-stat"><dt>Done today</dt><dd>{data.doneToday}</dd></div>
          <div className="hero-stat"><dt>Open tasks</dt><dd>{data.open}</dd></div>
        </dl>
      </section>

      {customizing && (
        <div className="card customize" role="group" aria-label="Dashboard widgets">
          <strong>Show on the dashboard</strong>
          <div className="customize-grid">
            {WIDGETS.map((w) => (
              <label key={w.id} className="check">
                <input
                  type="checkbox"
                  aria-label={`Show ${w.label}`}
                  checked={on(w.id)}
                  onChange={(e) => update({ widgets: { ...settings.widgets, [w.id]: e.target.checked } })}
                />
                {w.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {store.loading ? (
        <Skeleton rows={4} label="Loading dashboard…" />
      ) : !anyOn ? (
        <EmptyState icon="dashboard" title="All widgets are hidden">
          Use Customize to bring some back.
        </EmptyState>
      ) : (
        <div className="widget-grid">
          {on('today') && (
            <Widget id="today" title="Today" icon="today" count={data.today.length} link={{ route: 'today', label: 'Open Today' }}>
              <MiniList
                tasks={data.today} today={today} route="today" more="due today"
                addLabel="Add a task for today" onAdd={() => editor.open({ defaults: { dueDate: today } })}
                empty={
                  <WidgetEmpty
                    icon="today" title="Nothing due today." hint="A clear day. Plan something or enjoy the quiet."
                    action={<button type="button" onClick={() => editor.open({ defaults: { dueDate: today } })}><Icon name="plus" /> Plan your day</button>}
                  />
                }
              />
            </Widget>
          )}
          {on('overdue') && (
            <Widget id="overdue" title="Overdue" icon="alert" tone={data.overdue.length ? 'danger' : 'ok'} count={data.overdue.length} link={{ route: 'today', label: 'Open Today' }}>
              <MiniList
                tasks={data.overdue} today={today} route="today" more="overdue"
                empty={<WidgetEmpty icon="check" tone="ok" title="Nothing is overdue." hint="You are all caught up." />}
              />
            </Widget>
          )}
          {on('upcoming') && (
            <Widget id="upcoming" title="Upcoming (next 7 days)" icon="upcoming" count={data.upcoming.length} link={{ route: 'upcoming', label: 'Open Upcoming' }}>
              <MiniList
                tasks={data.upcoming} today={today} route="upcoming" more="upcoming"
                addLabel="Schedule a task" onAdd={() => editor.open({ defaults: { dueDate: addDays(today, 1) } })}
                empty={
                  <WidgetEmpty
                    icon="calendar" title="Nothing due in the next week." hint="Give a task a date and it will appear here."
                    action={<button type="button" onClick={() => editor.open({ defaults: { dueDate: addDays(today, 1) } })}><Icon name="calendar" /> Schedule a task</button>}
                  />
                }
              />
            </Widget>
          )}
          {on('high') && (
            <Widget id="high" title="High priority" icon="flame" count={data.high.length} link={{ route: 'tasks', label: 'All tasks' }}>
              <MiniList
                tasks={data.high} today={today} route="tasks" more="high-priority"
                addLabel="Add a priority task" onAdd={() => editor.open({ defaults: { priority: 'High' } })}
                empty={
                  <WidgetEmpty
                    icon="flame" title="No open High or Urgent tasks." hint="Mark what matters most as High to see it here."
                    action={<button type="button" onClick={() => editor.open({ defaults: { priority: 'High' } })}><Icon name="plus" /> Add a priority task</button>}
                  />
                }
              />
            </Widget>
          )}
          {on('progress') && (
            <Widget id="progress" title="Completion progress" icon="target">
              {total === 0 ? (
                <WidgetEmpty
                  icon="tasks" title="No tasks yet — add one with Q."
                  action={<button type="button" onClick={() => editor.open({})}><Icon name="plus" /> Add your first task</button>}
                />
              ) : (
                <div className="progress-row">
                  <Ring pct={pct} label={`${completed} of ${total} tasks completed`} />
                  <p>
                    <strong>{completed}</strong> of {total} tasks done
                    <br />
                    <span className="hint">{data.doneToday} completed today · {total - completed} open</span>
                  </p>
                </div>
              )}
            </Widget>
          )}
          {on('gamification') && (
            <Widget id="gamification" title="Lifegrid rewards" icon="trophy" link={{ route: 'achievements', label: 'Achievements' }}>
              <RewardsWidget />
            </Widget>
          )}
          {on('focus') && (
            <Widget id="focus" title="Focus" icon="focus" link={{ route: 'focus', label: 'Open Focus' }}>
              <FocusWidget />
            </Widget>
          )}
          {on('productivity') && (
            <Widget id="productivity" title="Productivity" icon="analytics" link={{ route: 'analytics', label: 'Full analytics' }}>
              <ProductivityWidget />
            </Widget>
          )}
          {on('activity') && (
            <Widget id="activity" title="Recent activity" icon="pulse">
              <ActivityWidget />
            </Widget>
          )}
          {on('shortcuts') && (
            <Widget id="shortcuts" title="Shortcuts" icon="zap" link={{ route: 'settings', param: 'shortcuts', label: 'All shortcuts' }}>
              <ul className="shortcut-hints">
                <li><kbd>Q</kbd> quick add</li>
                <li><kbd>N</kbd> new task</li>
                <li><kbd>Ctrl</kbd> <kbd>K</kbd> command palette</li>
                <li><kbd>G</kbd> then <kbd>C</kbd> calendar</li>
                <li><kbd>?</kbd> all shortcuts</li>
              </ul>
            </Widget>
          )}
        </div>
      )}
    </section>
  )
}
