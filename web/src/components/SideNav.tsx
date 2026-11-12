import type { Stats } from '../api'
import { Icon, type IconName } from './Icon'
import { useAuth, useUser } from '../useAuth'
import { hashFor, type Route } from '../useRoute'

interface Item {
  route: Route
  label: string
  icon: IconName
  count?: (s: Stats) => { n: number; alert?: boolean } | null
}

const GROUPS: { title: string; items: Item[] }[] = [
  { title: 'Main menu', items: [{ route: 'dashboard', label: 'Dashboard', icon: 'dashboard' }] },
  {
    title: 'Tasks',
    items: [
      { route: 'tasks', label: 'My Tasks', icon: 'tasks', count: (s) => ({ n: s.active }) },
      { route: 'inbox', label: 'Inbox', icon: 'inbox', count: (s) => ({ n: s.inbox }) },
      { route: 'today', label: 'Today', icon: 'today', count: (s) => ({ n: s.dueToday + s.overdue, alert: s.overdue > 0 }) },
      { route: 'upcoming', label: 'Upcoming', icon: 'upcoming', count: (s) => ({ n: s.upcoming }) },
      { route: 'completed', label: 'Completed', icon: 'completed', count: (s) => ({ n: s.completed }) },
    ],
  },
  {
    title: 'Plan',
    items: [
      { route: 'calendar', label: 'Calendar', icon: 'calendar' },
      { route: 'kanban', label: 'Kanban', icon: 'kanban' },
    ],
  },
  {
    title: 'Organize',
    items: [
      { route: 'categories', label: 'Categories', icon: 'categories' },
      { route: 'tags', label: 'Tags', icon: 'tags' },
    ],
  },
  {
    title: 'Insights',
    items: [
      { route: 'analytics', label: 'Analytics', icon: 'analytics' },
      { route: 'focus', label: 'Focus', icon: 'focus' },
      { route: 'achievements', label: 'Achievements', icon: 'trophy' },
    ],
  },
]

export function SideNav({
  route, param, stats, onNavigate, onHelp,
}: { route: Route; param: string | null; stats: Stats | null; onNavigate: () => void; onHelp: () => void }) {
  const { logout } = useAuth()
  const user = useUser()
  const onProfile = route === 'settings' && param === 'account'

  const link = (it: Item, current = route === it.route) => {
    const c = stats && it.count ? it.count(stats) : null
    return (
      <li key={it.route}>
        <a
          className="nav-link"
          href={hashFor(it.route)}
          title={it.label}
          aria-current={current ? 'page' : undefined}
          onClick={onNavigate}
        >
          <Icon name={it.icon} />
          <span>{it.label}</span>
          {c && c.n > 0 && (
            <span className={`nav-count${c.alert ? ' alert' : ''}`} aria-label={`${c.n}${c.alert ? ', some overdue' : ''}`}>
              {c.n}
            </span>
          )}
        </a>
      </li>
    )
  }

  return (
    <nav aria-label="Main">
      <div className="nav-groups">
        {GROUPS.map((g) => (
          <div key={g.title} className="nav-group">
            <h2>{g.title}</h2>
            <ul>{g.items.map((it) => link(it))}</ul>
          </div>
        ))}
      </div>
      <div className="side-foot">
        <ul>
          {link({ route: 'settings', label: 'Settings', icon: 'settings' }, route === 'settings' && !onProfile)}
          <li>
            <button type="button" className="nav-link" onClick={onHelp}>
              <Icon name="help" />
              <span>Help Center</span>
            </button>
          </li>
        </ul>
        {user && (
          <div className="profile">
            <a
              className="profile-link"
              href={hashFor('settings', 'account')}
              title={`Profile · ${user.email}`}
              aria-current={onProfile ? 'page' : undefined}
              onClick={onNavigate}
            >
              <span className="avatar" aria-hidden="true">{user.email.charAt(0).toUpperCase()}</span>
              <span className="profile-text">
                <strong>Profile</strong>
                <small>{user.email}</small>
              </span>
            </a>
            <button type="button" className="icon-btn sign-out" onClick={() => void logout()} title="Sign out" aria-label="Sign out">
              <Icon name="logout" />
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
