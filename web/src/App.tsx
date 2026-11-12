import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CommandPalette, type Command } from './components/CommandPalette'
import { HelpCenter } from './components/HelpCenter'
import { Icon } from './components/Icon'
import { Modal } from './components/Modal'
import { NotificationBell } from './components/NotificationBell'
import { PeriodBadge } from './components/PeriodBadge'
import { QUICK_ADD_EVENT, QuickAdd } from './components/QuickAdd'
import { SideNav } from './components/SideNav'
import { TaskEditorProvider, useTaskEditor } from './components/TaskEditor'
import { FocusMiniTimer, FocusProvider } from './focus/FocusProvider'
import { AchievementsPage } from './pages/AchievementsPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { CalendarPage } from './pages/CalendarPage'
import { DashboardPage } from './pages/DashboardPage'
import { FocusPage } from './pages/FocusPage'
import { KanbanPage } from './pages/KanbanPage'
import { LoginPage } from './pages/LoginPage'
import { ManagePage } from './pages/ManagePage'
import { SettingsPage } from './pages/SettingsPage'
import { TasksPage } from './pages/TasksPage'
import { AuthProvider, useAuth } from './useAuth'
import { SettingsProvider, useSettings, type Settings } from './useSettings'
import { ShortcutTable, useGlobalShortcuts } from './shortcuts'
import { TaskFlowProvider, useTaskFlow } from './useTaskFlow'
import { ToastProvider, Toasts } from './useToast'
import { useRoute, type Route } from './useRoute'
import { useTimeTheme } from './timeTheme'

/** Every context the pages need. Tests render a single page inside this instead of the whole shell. */
export function Providers({ children, settings }: { children: ReactNode; settings?: Partial<Settings> }) {
  return (
    <ToastProvider>
      <SettingsProvider initial={settings}>
        <TaskFlowProvider>
          <FocusProvider>
            <TaskEditorProvider>{children}</TaskEditorProvider>
          </FocusProvider>
        </TaskFlowProvider>
      </SettingsProvider>
      <Toasts />
    </ToastProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

/** Shows the sign-in page until the server confirms a session; the app is rebuilt from scratch for every user. */
function Gate() {
  const { state } = useAuth()
  if (state.status === 'loading') return <div className="auth-page" role="status">Loading…</div>
  if (state.status === 'anonymous') return <LoginPage offline={state.offline} />
  return (
    <Providers key={state.user.id}>
      <Shell />
    </Providers>
  )
}

const TITLES: Record<Route, string> = {
  dashboard: 'Dashboard', tasks: 'My Tasks', inbox: 'Inbox', today: 'Today', upcoming: 'Upcoming', calendar: 'Calendar',
  kanban: 'Kanban', completed: 'Completed', categories: 'Categories', tags: 'Tags', analytics: 'Analytics', focus: 'Focus', achievements: 'Achievements', settings: 'Settings',
}

function Shell() {
  const store = useTaskFlow()
  useTimeTheme()
  const { settings } = useSettings()
  const editor = useTaskEditor()
  const { route, param, go } = useRoute(settings.defaultView)
  const [navOpen, setNavOpen] = useState(false)
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [palette, setPalette] = useState(false)
  const [overlay, setOverlay] = useState<'help' | 'shortcuts' | null>(null)

  useEffect(() => {
    document.title = `${TITLES[route]} · Lifegrid`
  }, [route])

  const handlers = useMemo(
    () => ({
      palette: () => setPalette(true),
      quickAdd: () => window.dispatchEvent(new Event(QUICK_ADD_EVENT)),
      newTask: () => editor.open({}),
      help: () => setOverlay('shortcuts'),
      go,
    }),
    [editor, go],
  )
  useGlobalShortcuts(handlers)

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navOpen])

  const commands = useMemo<Command[]>(() => {
    const nav = (Object.keys(TITLES) as Route[]).map<Command>((r) => ({
      id: `go-${r}`, label: `Go to ${TITLES[r]}`, group: 'Go to', keywords: r, run: () => go(r),
    }))
    return [
      { id: 'new-task', label: 'New task', group: 'Actions', shortcut: 'N', keywords: 'add create', run: () => editor.open({}) },
      { id: 'quick-add', label: 'Quick add a task', group: 'Actions', shortcut: 'Q', run: () => window.dispatchEvent(new Event(QUICK_ADD_EVENT)) },
      { id: 'focus-start', label: 'Start a focus session', group: 'Actions', keywords: 'pomodoro timer', run: () => go('focus') },
      { id: 'backup', label: 'Create or restore a backup', group: 'Actions', keywords: 'export import data', run: () => go('settings', 'backup') },
      { id: 'help', label: 'Keyboard shortcuts', group: 'Actions', shortcut: '?', run: () => setOverlay('shortcuts') },
      ...nav,
    ]
  }, [go, editor])

  return (
    <div className={`shell${navOpen ? ' nav-open' : ''}${navCollapsed ? ' nav-collapsed' : ''}`}>
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }}>
        Skip to content
      </a>
      <aside className="side" aria-label="Sidebar">
        <div className="brand">
          <span className="brand-mark"><Icon name="grid" /></span>
          <span className="brand-name">Lifegrid</span>
          <button
            type="button"
            className="icon-btn collapse-btn"
            aria-label={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!navCollapsed}
            onClick={() => setNavCollapsed((value) => !value)}
          >
            <Icon name="chevronLeft" />
          </button>
        </div>
        <SideNav route={route} param={param} stats={store.stats} onNavigate={() => setNavOpen(false)} onHelp={() => { setNavOpen(false); setOverlay('help') }} />
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />

      <div className="main-col">
        <header className="topbar">
          <button type="button" className="menu-btn icon-btn" aria-label="Open navigation" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
            <Icon name="menu" />
          </button>
          <QuickAdd />
          <span className="spacer" />
          <PeriodBadge />
          <FocusMiniTimer />
          <button type="button" className="icon-btn" aria-label="Open command palette (Ctrl+K)" title="Command palette (Ctrl+K)" onClick={() => setPalette(true)}>
            <Icon name="search" />
          </button>
          <NotificationBell />
        </header>

        {store.error && (
          <div className="banner page-banner" role="alert">
            <span>{store.error}</span>
            <button onClick={store.dismissError}>Dismiss</button>
            <button onClick={() => void store.reload()}>Retry</button>
          </div>
        )}

        <main id="main" tabIndex={-1} className={`page${route === 'calendar' || route === 'kanban' ? ' wide' : ''}`}>
          <Page route={route} param={param} />
        </main>
      </div>

      {palette && <CommandPalette commands={commands} onClose={() => setPalette(false)} />}
      {overlay === 'help' && <HelpCenter onClose={() => setOverlay(null)} onShortcuts={() => setOverlay('shortcuts')} />}
      {overlay === 'shortcuts' && (
        <Modal title="Keyboard shortcuts" onClose={() => setOverlay(null)}>
          <ShortcutTable />
        </Modal>
      )}
    </div>
  )
}

function Page({ route, param }: { route: Route; param: string | null }) {
  const store = useTaskFlow()
  const reload = useCallback(() => void store.reload(), [store])
  switch (route) {
    case 'dashboard': return <DashboardPage />
    case 'tasks':
    case 'inbox':
    case 'today':
    case 'upcoming':
    case 'completed': return <TasksPage key={route} route={route} />
    case 'calendar': return <CalendarPage />
    case 'kanban': return <KanbanPage />
    case 'categories': return <ManagePage kind="category" />
    case 'tags': return <ManagePage kind="tag" />
    case 'analytics': return <AnalyticsPage />
    case 'focus': return <FocusPage />
    case 'achievements': return <AchievementsPage />
    case 'settings': return <SettingsPage section={param} onDataChanged={reload} />
  }
}
