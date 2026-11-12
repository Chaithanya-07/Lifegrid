import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { installFakeServer, reply } from './testing/fakeServer'

function renderSignedOut(extra?: Parameters<typeof installFakeServer>[0]) {
  window.localStorage.clear()
  window.location.hash = '#/tasks'
  const fake = installFakeServer({ signedOut: true, ...extra })
  const user = userEvent.setup()
  render(<App />)
  return { fake, user }
}

describe('authentication', () => {
  beforeEach(() => window.localStorage.clear())

  it('shows the sign-in page, not the app, when there is no session', async () => {
    renderSignedOut()
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  it('signs in and shows the app with the user email and a sign-out button', async () => {
    const { user } = renderSignedOut()
    await user.type(await screen.findByLabelText('Email'), 'me@example.test')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByText('me@example.test')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('shows the server message when the credentials are wrong', async () => {
    const { user } = renderSignedOut({
      handlers: { 'POST /api/auth/login': () => reply({ title: 'Invalid email or password.' }, 401) },
    })
    await user.type(await screen.findByLabelText('Email'), 'me@example.test')
    await user.type(screen.getByLabelText('Password'), 'wrong-password-1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  it('creates an account after a client-side length check', async () => {
    const { user, fake } = renderSignedOut()
    await user.click(await screen.findByRole('button', { name: 'Create an account' }))
    await user.type(screen.getByLabelText('Email'), 'new@example.test')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 10 characters')
    expect(fake.calls.some((c) => c.startsWith('POST /api/auth/register'))).toBe(false)

    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), 'a-long-enough-password')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('signs out and returns to the sign-in page', async () => {
    window.localStorage.clear()
    window.location.hash = '#/tasks'
    installFakeServer()
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('drops back to the sign-in page when the server says the session ended', async () => {
    window.localStorage.clear()
    window.location.hash = '#/tasks'
    let expired = false
    installFakeServer({
      handlers: { 'GET /api/tasks': () => (expired ? reply({ title: 'Unauthorized' }, 401) : undefined) },
    })
    render(<App />)
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expired = true
    window.dispatchEvent(new Event('taskflow:unauthorized'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument())
  })
})
