import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import App from './App'
import { installFakeServer } from './testing/fakeServer'
import { describeTimePeriod, resolveTimeAccent, setTimeSimulation, TimeSimulator, useTimeTheme } from './timeTheme'

const localTime = (hour: number, minute = 0) => {
  const date = new Date(2026, 9, 21, hour, minute)
  return date
}

const luminance = (hex: string) => {
  const [r, g, b] = hex.slice(1).match(/.{2}/g)!.map((h) => Number.parseInt(h, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('time period descriptions', () => {
  it.each([
    [0, 0, 'early', 'neutral'],
    [8, 59, 'early', 'neutral'],
    [9, 0, 'morning', 'morning'],
    [11, 59, 'morning', 'morning'],
    [12, 0, 'midday', 'neutral'],
    [12, 59, 'midday', 'neutral'],
    [13, 0, 'bright', 'happy'],
    [13, 59, 'bright', 'happy'],
    [14, 0, 'calm', 'rest'],
    [14, 59, 'calm', 'rest'],
    [15, 0, 'shift', 'transition'],
    [15, 59, 'shift', 'transition'],
    [16, 0, 'deadline', 'warning'],
    [17, 49, 'deadline', 'warning'],
    [17, 50, 'critical', 'critical'],
    [18, 59, 'critical', 'critical'],
    [19, 0, 'evening', 'neutral'],
    [23, 59, 'evening', 'neutral'],
  ] as const)('%i:%i is "%s" and agrees with the accent phase "%s"', (hour, minute, id, phase) => {
    const period = describeTimePeriod(localTime(hour, minute))
    expect(period.id).toBe(id)
    expect(period.phase).toBe(phase)
    expect(period.phase).toBe(resolveTimeAccent(localTime(hour, minute)).phase)
    expect(period.label).not.toBe('')
    expect(period.message).not.toBe('')
  })

  it('every minute of the day resolves to the same phase for the accent and its description', () => {
    for (let minute = 0; minute < 24 * 60; minute++) {
      const at = localTime(Math.floor(minute / 60), minute % 60)
      expect(describeTimePeriod(at).phase).toBe(resolveTimeAccent(at).phase)
    }
  })
})

describe('accent readability', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = ''
  })

  it('keeps button text >= 4.5:1 and accent text on the pastel tint >= 4.5:1 across the whole schedule', () => {
    renderHook(() => useTimeTheme())
    const root = document.documentElement
    for (let minute = 8 * 60; minute <= 19 * 60 + 5; minute += 5) {
      act(() => setTimeSimulation(localTime(Math.floor(minute / 60), minute % 60)))
      const bg = root.style.getPropertyValue('--accent-bg')
      const ink = root.style.getPropertyValue('--accent-ink')
      const soft = root.style.getPropertyValue('--accent-soft')
      expect(contrast(bg, '#ffffff'), `button ${minute}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(ink, '#ffffff'), `ink on white ${minute}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(ink, soft), `ink on tint ${minute}`).toBeGreaterThanOrEqual(4.5)
    }
    act(() => setTimeSimulation(null))
  })
})

describe('local-time accent schedule', () => {
  it.each([
    [8, 59, 'neutral'],
    [9, 0, 'morning'],
    [10, 0, 'morning'],
    [11, 59, 'morning'],
    [12, 0, 'neutral'],
    [12, 59, 'neutral'],
    [13, 0, 'happy'],
    [13, 59, 'happy'],
    [14, 0, 'rest'],
    [14, 59, 'rest'],
    [15, 0, 'transition'],
    [15, 59, 'transition'],
    [16, 0, 'warning'],
    [17, 49, 'warning'],
    [17, 50, 'critical'],
    [18, 59, 'critical'],
    [19, 0, 'neutral'],
  ] as const)('%i:%i resolves to %s', (hour, minute, phase) => {
    expect(resolveTimeAccent(localTime(hour, minute)).phase).toBe(phase)
  })

  it('smoothly interpolates the morning, activity, and afternoon accents', () => {
    const morningStart = resolveTimeAccent(localTime(9)).color
    const morningMiddle = resolveTimeAccent(localTime(10)).color
    const morningEnd = resolveTimeAccent(localTime(11, 59)).color
    expect(new Set([morningStart, morningMiddle, morningEnd]).size).toBe(3)

    const transitionStart = resolveTimeAccent(localTime(15)).color
    const transitionMiddle = resolveTimeAccent(localTime(15, 30)).color
    const transitionEnd = resolveTimeAccent(localTime(15, 59)).color
    expect(new Set([transitionStart, transitionMiddle, transitionEnd]).size).toBe(3)

    const warningStart = resolveTimeAccent(localTime(16)).color
    const warningMiddle = resolveTimeAccent(localTime(17)).color
    const critical = resolveTimeAccent(localTime(17, 50)).color
    expect(new Set([warningStart, warningMiddle, critical]).size).toBe(3)
  })

  it('keeps critical red in force over the afternoon warning state', () => {
    expect(resolveTimeAccent(localTime(17, 50))).toEqual({ phase: 'critical', color: '#ce2929' })
    expect(resolveTimeAccent(localTime(18, 30)).phase).toBe('critical')
  })
})

describe('time theme integration', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-time-phase')
    document.documentElement.style.cssText = ''
  })

  it('applies the simulated local-time accent and updates when the override changes', () => {
    renderHook(() => useTimeTheme())

    act(() => setTimeSimulation(localTime(13)))
    expect(document.documentElement.dataset.timePhase).toBe('happy')
    expect(document.documentElement.style.getPropertyValue('--accent')).not.toBe('')

    act(() => setTimeSimulation(localTime(18)))
    expect(document.documentElement.dataset.timePhase).toBe('critical')

    act(() => setTimeSimulation(null))
  })

  it('always renders a white-only theme even if an old dark preference is saved', async () => {
    installFakeServer()
    window.localStorage.setItem('taskflow-theme', 'dark')
    window.location.hash = '#/tasks'
    render(<App />)
    await screen.findByRole('heading', { name: 'My Tasks' })
    expect(document.documentElement).not.toHaveAttribute('data-theme', 'dark')
    expect(screen.queryByRole('radiogroup', { name: /theme/i })).toBeNull()
    await waitFor(() => expect(document.title).toBe('My Tasks · Lifegrid'))
  })

  it('exposes the time simulator only in development builds', () => {
    const { container } = render(<TimeSimulator />)
    if (import.meta.env.DEV) {
      expect(screen.getByLabelText('Time theme preview (development)')).toBeInTheDocument()
    } else {
      expect(container).toBeEmptyDOMElement()
    }
  })
})
