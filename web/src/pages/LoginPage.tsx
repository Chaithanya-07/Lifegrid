import { useId, useState, type FormEvent } from 'react'
import { ApiError } from '../api'
import { Icon } from '../components/Icon'
import { useAuth } from '../useAuth'
import './auth.css'

const MIN_PASSWORD = 10

/** Sign in / create account. The server enforces every rule; this form only gives faster feedback. */
export function LoginPage({ offline }: { offline: boolean }) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(offline ? 'Cannot reach the server. Try again in a moment.' : null)
  const [busy, setBusy] = useState(false)
  const emailId = useId()
  const pwId = useId()
  const registering = mode === 'register'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (registering && password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`)
      return
    }
    setBusy(true)
    try {
      await (registering ? register : login)(email.trim(), password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <main className="auth-page" id="main">
      <section className="auth-hero" aria-label="About Lifegrid">
        <div className="brand">
          <span className="brand-mark"><Icon name="grid" /></span>
          Lifegrid
        </div>
        <div className="auth-hero-copy">
          <h2>Plan the day. Earn the progress.</h2>
          <p>A calm, white workspace for your tasks, with colours that follow the time of day.</p>
        </div>
        <ul className="auth-points">
          <li><span className="auth-point-icon" aria-hidden="true"><Icon name="today" /></span> Today, upcoming and overdue work at a glance</li>
          <li><span className="auth-point-icon" aria-hidden="true"><Icon name="focus" /></span> Built-in focus timer and productivity trends</li>
          <li><span className="auth-point-icon" aria-hidden="true"><Icon name="trophy" /></span> XP, levels, streaks and achievements</li>
        </ul>
      </section>
      <div className="auth-card">
        <div className="brand auth-card-brand">
          <span className="brand-mark"><Icon name="grid" /></span>
          Lifegrid
        </div>
        <h1>{registering ? 'Create your account' : 'Sign in'}</h1>
        <p className="hint">
          {registering ? 'Your tasks are private to your account.' : 'Welcome back. Sign in to see your tasks.'}
        </p>
        <form onSubmit={submit} noValidate>
          <div className="auth-field">
            <label htmlFor={emailId}>Email</label>
            <input
              id={emailId} type="email" autoComplete="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} aria-invalid={error ? true : undefined}
            />
          </div>
          <div className="auth-field">
            <label htmlFor={pwId}>Password</label>
            <input
              id={pwId} type="password" required value={password}
              autoComplete={registering ? 'new-password' : 'current-password'}
              onChange={(e) => setPassword(e.target.value)} aria-invalid={error ? true : undefined}
              aria-describedby={registering ? `${pwId}-hint` : undefined}
            />
            {registering && <span id={`${pwId}-hint`} className="hint">At least {MIN_PASSWORD} characters.</span>}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="primary" disabled={busy || !email || !password}>
            {busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p className="auth-switch">
          {registering ? 'Already have an account?' : 'New to Lifegrid?'}{' '}
          <button
            type="button" className="link"
            onClick={() => { setMode(registering ? 'login' : 'register'); setError(null) }}
          >
            {registering ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </div>
    </main>
  )
}
