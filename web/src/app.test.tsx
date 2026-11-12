import { screen, waitFor, within } from '@testing-library/react'
import { todayString, addDays } from './dates'
import { installFakeServer, makeCategory, makeTag, makeTask, reply } from './testing/fakeServer'
import { renderApp } from './testing/helpers'

afterEach(() => {
  vi.unstubAllGlobals()
  window.location.hash = ''
})

const NAV_LABELS = [
  'Dashboard', 'My Tasks', 'Inbox', 'Today', 'Upcoming', 'Completed', 'Calendar', 'Kanban',
  'Categories', 'Tags', 'Analytics', 'Focus', 'Achievements', 'Settings',
]

describe('navigation structure', () => {
  it('groups pages as Main menu, Tasks, Plan, Organize and Insights with the account controls at the bottom', async () => {
    installFakeServer()
    renderApp('#/dashboard')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    const groups = Array.from(nav.querySelectorAll('.nav-group')).map((g) => ({
      title: g.querySelector('h2')?.textContent,
      items: Array.from(g.querySelectorAll('a.nav-link')).map((a) => a.querySelector('span')?.textContent),
    }))
    expect(groups).toEqual([
      { title: 'Main menu', items: ['Dashboard'] },
      { title: 'Tasks', items: ['My Tasks', 'Inbox', 'Today', 'Upcoming', 'Completed'] },
      { title: 'Plan', items: ['Calendar', 'Kanban'] },
      { title: 'Organize', items: ['Categories', 'Tags'] },
      { title: 'Insights', items: ['Analytics', 'Focus', 'Achievements'] },
    ])
    expect(within(nav).getByRole('link', { name: /^Settings/ })).toHaveAttribute('href', '#/settings')
    expect(within(nav).getByRole('button', { name: 'Help Center' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Profile/ })).toHaveAttribute('href', '#/settings/account')
    expect(within(nav).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('opens the Help Center from the sidebar and closes it with Escape', async () => {
    installFakeServer()
    const { user } = renderApp('#/dashboard')
    await user.click(await screen.findByRole('button', { name: 'Help Center' }))
    const dialog = await screen.findByRole('dialog', { name: 'Help Center' })
    expect(within(dialog).getByText(/Low 5, Medium 10, High 15, Urgent 15/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('highlights Profile (not Settings) on the account settings page, and Settings elsewhere in settings', async () => {
    installFakeServer()
    renderApp('#/settings/account')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: /Profile/ })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: /^Settings/ })).not.toHaveAttribute('aria-current')
  })

  it('shows the current time period in the top bar', async () => {
    installFakeServer()
    renderApp('#/dashboard')
    await screen.findByRole('navigation', { name: 'Main' })
    expect(document.querySelector('.topbar .period-badge')?.textContent).not.toBe('')
  })
})

describe('achievements page', () => {
  it('shows level, XP progress, streaks, badges, weekly goal and reward history', async () => {
    installFakeServer({
      tasks: [
        makeTask({ id: 1, title: 'Done one', isCompleted: true, status: 'Done' }),
        makeTask({ id: 2, title: 'Done two', isCompleted: true, status: 'Done' }),
      ],
    })
    renderApp('#/achievements')
    expect(await screen.findByRole('heading', { name: 'Achievements' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Level 1' })).toBeInTheDocument()
    expect(screen.getByText('20 XP earned in total')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Progress to level 2' })).toBeInTheDocument()
    expect(screen.getByText('Current streak')).toBeInTheDocument()
    expect(screen.getByText('Longest streak')).toBeInTheDocument()
    expect(screen.getByText('1 of 2 unlocked')).toBeInTheDocument()
    expect(screen.getByText('First step')).toBeInTheDocument()
    expect(screen.getByText('Unlocked')).toBeInTheDocument()
    expect(screen.getByText('2 / 10')).toBeInTheDocument() // locked badge shows real progress
    expect(screen.getByLabelText('Weekly task goal')).toBeInTheDocument()
    expect(screen.getByText('Completed: Done one')).toBeInTheDocument()
    expect(document.title).toBe('Achievements · Lifegrid')
  })

  it('explains an empty reward history with a next step', async () => {
    installFakeServer()
    renderApp('#/achievements')
    expect(await screen.findByText('No rewards yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plan today' })).toHaveAttribute('href', '#/today')
  })
})

describe('app shell and navigation', () => {
  it('offers every section in the sidebar and marks the current one', async () => {
    installFakeServer()
    renderApp('#/tasks')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    for (const label of NAV_LABELS) expect(within(nav).getByRole('link', { name: new RegExp(`^${label}`) })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /^My Tasks/ })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: /^Calendar/ })).not.toHaveAttribute('aria-current')
  })

  it('navigates between pages and updates the document title', async () => {
    installFakeServer()
    const { user } = renderApp('#/tasks')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    await user.click(within(nav).getByRole('link', { name: /^Tags/ }))
    expect(await screen.findByRole('region', { name: 'Tag manager' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/tags')
    expect(document.title).toBe('Tags · Lifegrid')
    expect(within(nav).getByRole('link', { name: /^Tags/ })).toHaveAttribute('aria-current', 'page')
  })

  it('shows live counts in the sidebar, flagging overdue work', async () => {
    const today = todayString()
    installFakeServer({
      tasks: [
        makeTask({ id: 1, title: 'late', dueDate: addDays(today, -2) }),
        makeTask({ id: 2, title: 'now', dueDate: today }),
        makeTask({ id: 3, title: 'inbox item' }),
      ],
    })
    renderApp('#/tasks')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    await waitFor(() => expect(within(nav).getByRole('link', { name: /^Today/ })).toHaveTextContent('2'))
    expect(within(nav).getByRole('link', { name: /^Today/ })).toHaveTextContent('2')
    expect(within(nav).getByLabelText('2, some overdue')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /^Inbox/ })).toHaveTextContent('1')
  })

  it('falls back to the default view for an unknown route and honours the #/data alias', async () => {
    installFakeServer()
    renderApp('#/nonsense')
    expect(await screen.findByRole('region', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('opens and closes the mobile navigation drawer', async () => {
    installFakeServer()
    const { user } = renderApp('#/tasks')
    const menu = await screen.findByRole('button', { name: 'Open navigation' })
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    await user.click(menu)
    expect(document.querySelector('.shell')).toHaveClass('nav-open')
    await user.keyboard('{Escape}')
    expect(document.querySelector('.shell')).not.toHaveClass('nav-open')
  })

  it('shows a retryable error banner when the API is unreachable', async () => {
    installFakeServer({ handlers: { 'GET /api/tasks': () => { throw new TypeError('network down') } } })
    renderApp('#/tasks')
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})

describe('quick add', () => {
  it('parses natural language into a real task and shows it', async () => {
    const api = installFakeServer({ tags: [makeTag({ id: 4, name: 'home' })], categories: [makeCategory({ id: 2, name: 'Finance' })] })
    const { user } = renderApp('#/tasks')
    await screen.findByText('No tasks yet')
    await user.type(screen.getByLabelText('Quick add task'), 'Pay rent tomorrow at 9am !high #home @Finance')
    // The live preview shows what was understood before anything is saved.
    expect(await screen.findByText('Tomorrow')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Pay rent')).toBeInTheDocument()
    const sent = JSON.parse(String(api.bodies['POST /api/tasks'][0]))
    expect(sent).toMatchObject({
      title: 'Pay rent', priority: 'High', dueDate: addDays(todayString(), 1), dueTime: '09:00', categoryId: 2, tagIds: [4],
    })
    expect(screen.getByLabelText('Quick add task')).toHaveValue('')
  })

  it('refuses an empty title without calling the API', async () => {
    const api = installFakeServer()
    const { user } = renderApp('#/tasks')
    await screen.findByText('No tasks yet')
    await user.type(screen.getByLabelText('Quick add task'), 'tomorrow !high')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Type a task title first.')).toBeInTheDocument()
    expect(api.calls.some((c) => c.startsWith('POST /api/tasks'))).toBe(false)
  })

  it('is reachable with the Q shortcut from any page', async () => {
    installFakeServer()
    const { user } = renderApp('#/analytics')
    await screen.findByRole('navigation', { name: 'Main' })
    await user.keyboard('q')
    expect(screen.getByLabelText('Quick add task')).toHaveFocus()
  })

  it('shows the server error and keeps the text', async () => {
    installFakeServer({ handlers: { 'POST /api/tasks': () => reply({ title: 'Disk full' }, 500) } })
    const { user } = renderApp('#/tasks')
    await screen.findByText('No tasks yet')
    await user.type(screen.getByLabelText('Quick add task'), 'Keep me')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Disk full')).toBeInTheDocument()
    expect(screen.getByLabelText('Quick add task')).toHaveValue('Keep me')
  })
})

describe('command palette and shortcuts', () => {
  it('Ctrl+K opens the palette; typing filters; Enter navigates', async () => {
    installFakeServer()
    const { user } = renderApp('#/tasks')
    await screen.findByRole('navigation', { name: 'Main' })
    await user.keyboard('{Control>}k{/Control}')
    const input = await screen.findByRole('combobox', { name: /command or search/i })
    await user.type(input, 'calend')
    expect(screen.getByRole('option', { name: /Go to Calendar/ })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(window.location.hash).toBe('#/calendar'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('finds tasks by typing and opens them in the editor', async () => {
    installFakeServer({ tasks: [makeTask({ id: 1, title: 'Renew passport' }), makeTask({ id: 2, title: 'Buy milk' })] })
    const { user } = renderApp('#/tasks')
    await screen.findByText('Renew passport')
    await user.keyboard('{Control>}k{/Control}')
    await user.type(await screen.findByRole('combobox', { name: /command or search/i }), 'passp')
    expect(screen.queryByRole('option', { name: /Buy milk/ })).toBeNull()
    await user.click(screen.getByRole('option', { name: /Renew passport/ }))
    expect(await screen.findByRole('dialog', { name: 'Edit task' })).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Renew passport')
  })

  it('Escape closes the palette; arrows move the selection', async () => {
    installFakeServer()
    const { user } = renderApp('#/tasks')
    await screen.findByRole('navigation', { name: 'Main' })
    await user.keyboard('{Control>}k{/Control}')
    await screen.findByRole('combobox', { name: /command or search/i })
    const results = () => within(screen.getByRole('listbox', { name: 'Results' })).getAllByRole('option')
    expect(results()[0]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}')
    expect(results()[1]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowUp}')
    expect(results()[0]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('G-then-letter navigates, N opens the editor, ? shows the shortcut list', async () => {
    installFakeServer()
    const { user } = renderApp('#/tasks')
    await screen.findByRole('navigation', { name: 'Main' })
    await user.keyboard('gk')
    await waitFor(() => expect(window.location.hash).toBe('#/kanban'))
    await user.keyboard('n')
    expect(await screen.findByRole('dialog', { name: 'New task' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.keyboard('?')
    const dlg = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(within(dlg).getByText('Open the command palette')).toBeInTheDocument()
  })

  it('single-letter shortcuts do not fire while typing in a field', async () => {
    installFakeServer()
    const { user } = renderApp('#/tasks')
    await user.click(await screen.findByLabelText('Search tasks'))
    await user.keyboard('gk')
    expect(window.location.hash).toBe('#/tasks')
  })
})
