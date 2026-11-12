import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, type Gamification } from '../api'
import { useTaskFlow } from '../useTaskFlow'
import { Icon, type IconName } from './Icon'
import './rewards.css'

const BADGE_ICON: Record<string, IconName> = {
  'first-task': 'sparkles',
  'ten-tasks': 'zap',
  'fifty-tasks': 'layers',
  'three-day-streak': 'flame',
  'seven-day-streak': 'target',
  'five-hundred-xp': 'star',
}

/** Server-calculated XP, level, streaks and badges. Reloads whenever the task list changes (a completion may have earned XP). */
export function useGamification() {
  const { tasks } = useTaskFlow()
  const [data, setData] = useState<Gamification | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api.gamification())
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    let live = true
    api.gamification().then(
      (summary) => {
        if (!live) return
        setData(summary)
        setFailed(false)
      },
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [tasks])

  return { data, failed, reload: load }
}

export function LevelMedal({ level }: { level: number }) {
  return (
    <span className="level-medal" role="img" aria-label={`Level ${level}`}>
      <small>LVL</small>
      <strong>{level}</strong>
    </span>
  )
}

export function XpBar({ data }: { data: Gamification }) {
  const remaining = data.xpPerLevel - data.levelProgress
  return (
    <div className="xp-bar">
      <div className="xp-bar-text">
        <span><strong>{data.levelProgress}</strong> / {data.xpPerLevel} XP</span>
        <span className="hint">{remaining} XP to level {data.level + 1}</span>
      </div>
      <progress value={data.levelProgress} max={data.xpPerLevel} aria-label={`Progress to level ${data.level + 1}`} />
    </div>
  )
}

export function BadgeGrid({ items, limit }: { items: Gamification['achievements']; limit?: number }) {
  const sorted = [...items].sort((a, b) => Number(b.unlocked) - Number(a.unlocked))
  const shown = limit ? sorted.slice(0, limit) : sorted
  return (
    <ul className="badge-grid">
      {shown.map((a) => (
        <li key={a.key} className={`badge-tile${a.unlocked ? ' unlocked' : ' locked'}`} title={a.description}>
          <span className="badge-icon" aria-hidden="true">
            <Icon name={a.unlocked ? (BADGE_ICON[a.key] ?? 'trophy') : 'lock'} />
          </span>
          <span className="badge-name">{a.name}</span>
          <span className="badge-state">
            {a.unlocked ? 'Unlocked' : `${Math.min(a.progress, a.target)} / ${a.target}`}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function NextBadge({ items }: { items: Gamification['achievements'] }) {
  const next = items
    .filter((a) => !a.unlocked)
    .sort((a, b) => b.progress / b.target - a.progress / a.target)[0]
  if (!next) return <p className="next-badge"><Icon name="trophy" /> Every badge unlocked. Well done!</p>
  const left = Math.max(0, next.target - next.progress)
  return (
    <p className="next-badge">
      <Icon name="target" />
      <span>Next badge: <strong>{next.name}</strong> · {left} to go</span>
    </p>
  )
}

export function WeeklyGoal({ data, onSaved }: { data: Gamification; onSaved: () => Promise<void> | void }) {
  const [goal, setGoal] = useState(data.weeklyGoal)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => setGoal(data.weeklyGoal), [data.weeklyGoal])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      await api.setWeeklyGoal(goal)
      await onSaved()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Weekly goal could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="weekly-goal">
      <div className="weekly-goal-label">
        <strong>This week</strong>
        <span>{data.completedThisWeek} / {data.weeklyGoal} tasks</span>
      </div>
      <progress value={Math.min(data.completedThisWeek, data.weeklyGoal)} max={data.weeklyGoal} aria-label="Weekly task goal progress" />
      <form className="weekly-goal-form" onSubmit={(event) => void save(event)}>
        <label htmlFor="weekly-goal-input">Weekly task goal</label>
        <input id="weekly-goal-input" type="number" min={1} max={100} value={goal} onChange={(event) => setGoal(Number(event.target.value))} />
        <button type="submit" disabled={saving || goal < 1 || goal > 100}>{saving ? 'Saving…' : 'Save'}</button>
      </form>
      {message && <p role="alert" className="widget-error">{message}</p>}
    </div>
  )
}

export function RewardList({ items, limit, empty }: { items: Gamification['rewardHistory']; limit?: number; empty?: string }) {
  const shown = limit ? items.slice(0, limit) : items
  if (shown.length === 0) return <p className="hint">{empty ?? 'Rewards appear here as you complete tasks.'}</p>
  return (
    <ul className="reward-list">
      {shown.map((reward) => (
        <li key={reward.id}>
          <span className="reward-text">{reward.description}</span>
          <b>+{reward.points} XP</b>
        </li>
      ))}
    </ul>
  )
}
