import { useTimePeriod } from '../timeTheme'

/** Small live indicator of the current time-based period; the dot takes the current accent. */
export function PeriodBadge() {
  const { period } = useTimePeriod()
  return (
    <span className="period-badge" data-phase={period.phase} title={period.message}>
      <span className="period-dot" aria-hidden="true" />
      <span className="period-label">{period.label}</span>
    </span>
  )
}
