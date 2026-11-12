import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, UNAUTHORIZED_EVENT, api, type AuthUser } from './api'

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous'; offline: boolean }
  | { status: 'authenticated'; user: AuthUser }

interface AuthApi {
  state: AuthState
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Forget the signed-in user locally (after the account was deleted or the session ended). */
  clear: () => void
}

const AuthContext = createContext<AuthApi | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let live = true
    api.me().then(
      (user) => live && setState({ status: 'authenticated', user }),
      (e) => live && setState({ status: 'anonymous', offline: e instanceof ApiError && e.status === 0 }),
    )
    return () => {
      live = false
    }
  }, [])

  // Any request that comes back 401 means the session ended (expired, password changed elsewhere, account removed).
  useEffect(() => {
    const onSignedOut = () => setState({ status: 'anonymous', offline: false })
    window.addEventListener(UNAUTHORIZED_EVENT, onSignedOut)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onSignedOut)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setState({ status: 'authenticated', user: await api.login(email, password) })
  }, [])
  const register = useCallback(async (email: string, password: string) => {
    setState({ status: 'authenticated', user: await api.register(email, password) })
  }, [])
  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setState({ status: 'anonymous', offline: false })
    }
  }, [])
  const clear = useCallback(() => setState({ status: 'anonymous', offline: false }), [])

  const value = useMemo(() => ({ state, login, register, logout, clear }), [state, login, register, logout, clear])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export function useUser(): AuthUser | null {
  const { state } = useAuth()
  return state.status === 'authenticated' ? state.user : null
}
