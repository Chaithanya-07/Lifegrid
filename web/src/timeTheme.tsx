import { useEffect, useState } from 'react'

export type TimePhase = 'morning' | 'neutral' | 'happy' | 'rest' | 'transition' | 'warning' | 'critical'

export interface TimeAccent {
  phase: TimePhase
  color: string
}

interface Stop {
  minute: number
  color: string
}

const MORNING: Stop[] = [
  { minute: 9 * 60, color: '#3e9560' },
  { minute: 10 * 60, color: '#91c878' },
  { minute: 11 * 60, color: '#efaa7c' },
  { minute: 12 * 60, color: '#e5d77b' },
]
const TRANSITION: Stop[] = [
  { minute: 15 * 60, color: '#e5d77b' },
  { minute: 15 * 60 + 30, color: '#efa27a' },
  { minute: 16 * 60, color: '#ed852f' },
]
const WARNING: Stop[] = [
  { minute: 16 * 60, color: '#ed852f' },
  { minute: 17 * 60, color: '#ef684f' },
  { minute: 18 * 60, color: '#d93636' },
]
const NEUTRAL: TimeAccent = { phase: 'neutral', color: '#555b66' }

function interpolate(stops: Stop[], minute: number): string {
  const left = stops.findLast((stop) => stop.minute <= minute) ?? stops[0]
  const right = stops.find((stop) => stop.minute > minute)
  if (!right) return left.color
  const ratio = (minute - left.minute) / (right.minute - left.minute)
  const a = left.color.slice(1).match(/.{2}/g)!.map((part) => Number.parseInt(part, 16))
  const b = right.color.slice(1).match(/.{2}/g)!.map((part) => Number.parseInt(part, 16))
  return `#${a.map((value, i) => Math.round(value + (b[i] - value) * ratio).toString(16).padStart(2, '0')).join('')}`
}

export function resolveTimeAccent(now: Date): TimeAccent {
  const minute = now.getHours() * 60 + now.getMinutes()
  if (minute >= 17 * 60 + 50 && minute < 19 * 60) return { phase: 'critical', color: '#ce2929' }
  if (minute >= 9 * 60 && minute < 12 * 60) return { phase: 'morning', color: interpolate(MORNING, minute) }
  if (minute >= 13 * 60 && minute < 14 * 60) return { phase: 'happy', color: '#d8b820' }
  if (minute >= 14 * 60 && minute < 15 * 60) return { phase: 'rest', color: '#8972c7' }
  if (minute >= 15 * 60 && minute < 16 * 60) return { phase: 'transition', color: interpolate(TRANSITION, minute) }
  if (minute >= 16 * 60 && minute < 18 * 60) return { phase: 'warning', color: interpolate(WARNING, minute) }
  return NEUTRAL
}

export interface TimePeriod {
  /** Stable key for the period; `early` and `evening` both resolve to the neutral phase. */
  id: 'early' | 'morning' | 'midday' | 'bright' | 'calm' | 'shift' | 'deadline' | 'critical' | 'evening'
  phase: TimePhase
  label: string
  message: string
}

/** The human-readable side of the schedule. Boundaries mirror `resolveTimeAccent` exactly. */
export function describeTimePeriod(now: Date): TimePeriod {
  const minute = now.getHours() * 60 + now.getMinutes()
  if (minute >= 17 * 60 + 50 && minute < 19 * 60) {
    return { id: 'critical', phase: 'critical', label: 'Critical hour', message: 'Final stretch: close out whatever is due today.' }
  }
  if (minute < 9 * 60) return { id: 'early', phase: 'neutral', label: 'Before the day starts', message: 'Plan the day ahead and choose your top priorities.' }
  if (minute < 12 * 60) return { id: 'morning', phase: 'morning', label: 'Morning momentum', message: 'Fresh energy: start with the task that needs the most thought.' }
  if (minute < 13 * 60) return { id: 'midday', phase: 'neutral', label: 'Midday reset', message: 'Take a proper break, then pick up what matters next.' }
  if (minute < 14 * 60) return { id: 'bright', phase: 'happy', label: 'Bright afternoon', message: 'Good energy for a few quick wins.' }
  if (minute < 15 * 60) return { id: 'calm', phase: 'rest', label: 'Calm focus', message: 'A quiet stretch, well suited to steady, focused work.' }
  if (minute < 16 * 60) return { id: 'shift', phase: 'transition', label: 'Afternoon shift', message: 'Start wrapping up open items before the day closes.' }
  if (minute < 18 * 60) return { id: 'deadline', phase: 'warning', label: 'Deadline window', message: 'Check what is due today and close it out.' }
  return { id: 'evening', phase: 'neutral', label: 'Evening wind-down', message: 'Review today and set up tomorrow.' }
}

function mixWithWhite(color: string, amount: number): string {
  const channels = color.slice(1).match(/.{2}/g)!.map((part) => Number.parseInt(part, 16))
  return `#${channels.map((value) => Math.round(value + (255 - value) * amount).toString(16).padStart(2, '0')).join('')}`
}

/** Relative luminance ceiling for accent ink: gives >= 7:1 on white and >= 4.5:1 on the pastel tint of the same hue. */
const MAX_INK_LUMINANCE = 0.1

function contrastInk(color: string): string {
  const channels = color.slice(1).match(/.{2}/g)!.map((part) => Number.parseInt(part, 16))
  const luminance = (factor: number) => channels
    .map((channel) => {
      const value = (channel * factor) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    .reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i], 0)
  if (luminance(1) <= MAX_INK_LUMINANCE) return color
  let low = 0
  let high = 1
  for (let i = 0; i < 12; i++) {
    const middle = (low + high) / 2
    if (luminance(middle) <= MAX_INK_LUMINANCE) low = middle
    else high = middle
  }
  return `#${channels.map((channel) => Math.round(channel * low).toString(16).padStart(2, '0')).join('')}`
}

function applyAccent(accent: TimeAccent) {
  const root = document.documentElement
  const ink = contrastInk(accent.color)
  root.dataset.timePhase = accent.phase
  root.style.setProperty('--accent', ink)
  root.style.setProperty('--accent-bg', ink)
  root.style.setProperty('--accent-hover', contrastInk(mixWithWhite(ink, 0.12)))
  root.style.setProperty('--accent-ink', ink)
  root.style.setProperty('--accent-soft', mixWithWhite(accent.color, 0.88))
  root.style.setProperty('--accent-wash', mixWithWhite(accent.color, 0.94))
  root.style.setProperty('--accent-line', mixWithWhite(accent.color, 0.72))
  root.style.setProperty('--accent-pastel', mixWithWhite(accent.color, 0.8))
  root.style.setProperty('--focus', ink)
  root.style.setProperty('--chart-bar', accent.color)
  root.style.setProperty('--accent-decoration', accent.color)
}

const OVERRIDE_EVENT = 'lifegrid:time-override'
type OverrideEvent = CustomEvent<Date | null>

export function setTimeSimulation(value: Date | null) {
  window.dispatchEvent(new CustomEvent<Date | null>(OVERRIDE_EVENT, { detail: value }))
}

/** The current instant (or the development simulation), refreshed every 30 seconds. */
export function useNow(): Date {
  const [override, setOverride] = useState<Date | null>(null)
  const [tick, setTick] = useState(() => new Date())

  useEffect(() => {
    const update = (event: Event) => setOverride((event as OverrideEvent).detail)
    window.addEventListener(OVERRIDE_EVENT, update)
    return () => window.removeEventListener(OVERRIDE_EVENT, update)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setTick(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  return override ?? tick
}

export function useTimeTheme() {
  const now = useNow()
  useEffect(() => {
    applyAccent(resolveTimeAccent(now))
  }, [now])
}

/** Live period label and message for the dashboard and topbar. */
export function useTimePeriod() {
  const now = useNow()
  return { now, period: describeTimePeriod(now), accent: resolveTimeAccent(now) }
}

export function TimeSimulator() {
  const [value, setValue] = useState(() => new Date().toTimeString().slice(0, 5))

  if (!import.meta.env.DEV) return null

  function simulate(time: string) {
    setValue(time)
    if (!time) return
    const [hour, minute] = time.split(':').map(Number)
    const simulated = new Date()
    simulated.setHours(hour, minute, 0, 0)
    setTimeSimulation(simulated)
  }

  return (
    <div className="time-simulator">
      <label htmlFor="lifegrid-time-simulator">Time theme preview (development)</label>
      <input id="lifegrid-time-simulator" type="time" value={value} onChange={(event) => simulate(event.target.value)} />
      <button type="button" onClick={() => { setValue(new Date().toTimeString().slice(0, 5)); setTimeSimulation(null) }}>
        Use device time
      </button>
    </div>
  )
}
