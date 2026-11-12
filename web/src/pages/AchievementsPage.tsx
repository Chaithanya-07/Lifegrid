import { EmptyState, PageHeader, Skeleton } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { BadgeGrid, LevelMedal, WeeklyGoal, XpBar, useGamification } from '../components/Rewards'
import { formatDate } from '../dates'
import { hashFor } from '../useRoute'
import { useSettings } from '../useSettings'
import './achievements.css'

export function AchievementsPage() {
  const { data, failed, reload } = useGamification()
  const { settings } = useSettings()

  if (!data) {
    return (
      <section aria-label="Achievements" className="achievements">
        <PageHeader title="Achievements" subtitle="Levels, streaks and badges earned by finishing tasks." />
        {failed ? <p className="banner" role="alert"><span>Achievements are unavailable right now.</span><button type="button" onClick={() => void reload()}>Retry</button></p> : <Skeleton rows={3} label="Loading achievements…" />}
      </section>
    )
  }

  const unlocked = data.achievements.filter((a) => a.unlocked).length

  return (
    <section aria-label="Achievements" className="achievements">
      <PageHeader title="Achievements" subtitle="Levels, streaks and badges earned by finishing tasks.">
        <a className="button" href={hashFor('tasks')}><Icon name="tasks" /> Open My Tasks</a>
      </PageHeader>

      {failed && <p className="banner" role="alert"><span>Showing the last loaded numbers; they could not be refreshed.</span></p>}

      <div className="ach-grid">
        <section className="card ach-level" aria-labelledby="ach-level-title">
          <LevelMedal level={data.level} />
          <div className="ach-level-body">
            <h3 id="ach-level-title">Level {data.level}</h3>
            <p className="hint">{data.totalXp} XP earned in total</p>
            <XpBar data={data} />
          </div>
        </section>

        <dl className="ach-stats">
          <div className="stat-tile"><dt><Icon name="flame" /> Current streak</dt><dd>{data.currentStreak} day{data.currentStreak === 1 ? '' : 's'}</dd></div>
          <div className="stat-tile"><dt><Icon name="trophy" /> Longest streak</dt><dd>{data.longestStreak} day{data.longestStreak === 1 ? '' : 's'}</dd></div>
          <div className="stat-tile"><dt><Icon name="zap" /> XP this week</dt><dd>{data.xpThisWeek}</dd></div>
          <div className="stat-tile"><dt><Icon name="target" /> Done this week</dt><dd>{data.completedThisWeek}</dd></div>
        </dl>

        <section className="card ach-badges" aria-labelledby="ach-badges-title">
          <header className="card-head">
            <h3 id="ach-badges-title">Badges</h3>
            <span className="count-pill">{unlocked} of {data.achievements.length} unlocked</span>
          </header>
          <BadgeGrid items={data.achievements} />
        </section>

        <section className="card ach-goal" aria-labelledby="ach-goal-title">
          <header className="card-head"><h3 id="ach-goal-title">Weekly goal</h3></header>
          <WeeklyGoal data={data} onSaved={reload} />
        </section>

        <section className="card ach-history" aria-labelledby="ach-history-title">
          <header className="card-head"><h3 id="ach-history-title">Reward history</h3></header>
          {data.rewardHistory.length === 0 ? (
            <EmptyState icon="trophy" title="No rewards yet" action={<a className="button primary" href={hashFor('today')}>Plan today</a>}>
              Complete a task to earn your first XP.
            </EmptyState>
          ) : (
            <ul className="reward-table">
              {data.rewardHistory.map((r) => (
                <li key={r.id}>
                  <span className="reward-text">{r.description}</span>
                  <time dateTime={r.date}>{formatDate(r.date, settings.dateFormat, true)}</time>
                  <b>+{r.points} XP</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  )
}
