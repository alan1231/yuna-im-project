import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes } from 'react-router-dom'
import AccountSetup from './components/account/AccountSetup'
import AdminConsole from './components/admin/AdminConsole.jsx'
import ChatWindow from './components/chat/ChatWindow'
import {
  fetchCurrentUser,
  loginAccount,
  logoutAccount,
  registerAccount,
  wakeBackend as wakeBackendApi,
} from './api/chatApi'
import { useAuthStore } from './stores/authStore'
import type { CurrentUser } from './types/chat'

export default function App() {
  const [showLaunchScreen, setShowLaunchScreen] = useState(true)
  const [isLaunchLeaving, setIsLaunchLeaving] = useState(false)

  useEffect(() => {
    const leaveTimer = window.setTimeout(() => setIsLaunchLeaving(true), 1800)
    const hideTimer = window.setTimeout(() => setShowLaunchScreen(false), 2200)
    return () => {
      window.clearTimeout(leaveTimer)
      window.clearTimeout(hideTimer)
    }
  }, [])

  return (
    <div className="app-shell">
      {showLaunchScreen ? (
        <div className={`launch-screen launch-screen-app ${isLaunchLeaving ? 'launch-screen-leaving' : ''}`} aria-hidden="true">
          <div className="launch-card">
            <div className="launch-logo">N</div>
            <p className="launch-title">NEON_GHOST</p>
          </div>
        </div>
      ) : null}
      <Routes>
        <Route path="/" element={<ChatRoute />} />
        <Route path="/admin" element={<AdminConsole />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

function ChatRoute() {
  const { t } = useTranslation()
  const currentUser = useAuthStore((state) => state.currentUser)
  const setCurrentUser = useAuthStore((state) => state.setCurrentUser)
  const clearCurrentUser = useAuthStore((state) => state.clearCurrentUser)
  const queryClient = useQueryClient()
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const [showBackendWakeHint, setShowBackendWakeHint] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [isRestoringSession, setIsRestoringSession] = useState(Boolean(currentUser))

  const persistUser = (user: CurrentUser) => {
    setCurrentUser(user)
  }

  useEffect(() => {
    if (!currentUser) {
      setIsRestoringSession(false)
      return
    }
    fetchCurrentUser()
      .then((user) => persistUser({
        id: user.user_id,
        displayName: user.display_name,
        token: currentUser.token,
        avatarUrl: user.avatar_url || currentUser.avatarUrl,
        avatarStyle: currentUser.avatarStyle,
        avatarSeed: currentUser.avatarSeed,
        avatarBackground: currentUser.avatarBackground,
      }))
      .catch(() => clearCurrentUser())
      .finally(() => setIsRestoringSession(false))
    // The persisted token only needs verification once when the app starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runWithBackendWake = async (action: () => Promise<void>) => {
    setIsCreatingUser(true)
    setShowBackendWakeHint(false)
    setAccountError('')
    const wakeHintTimer = window.setTimeout(() => {
      setShowBackendWakeHint(true)
    }, 1200)

    try {
      await wakeBackendApi()
      await action()
    } finally {
      window.clearTimeout(wakeHintTimer)
      setShowBackendWakeHint(false)
      setIsCreatingUser(false)
    }
  }

  const createUser = async (displayName: string, password: string) => {
    const name = displayName.trim()
    if (!name || isCreatingUser) return

    try {
      await runWithBackendWake(async () => {
        const { user, token } = await registerAccount(name, password)
        persistUser({
          id: user.user_id,
          displayName: user.display_name,
          token,
        })
      })
    } catch (error) {
      console.error('Account creation failed:', error)
      const status = error instanceof Error ? (error as Error & { status?: number }).status : undefined
      setAccountError(status === 409
        ? t('account.errors.duplicateName')
        : status
          ? t('account.errors.createFailed')
          : t('account.errors.backendUnavailable'))
    }
  }

  const loginUser = async (displayName: string, password: string) => {
    const name = displayName.trim()
    if (!name || isCreatingUser) return

    try {
      await runWithBackendWake(async () => {
        const { user, token } = await loginAccount(name, password)
        persistUser({
          id: user.user_id,
          displayName: user.display_name,
          token,
        })
      })
    } catch (error) {
      console.error('Sign in failed:', error)
      const status = error instanceof Error ? (error as Error & { status?: number }).status : undefined
      setAccountError(status === 401
        ? t('account.errors.loginNotFound')
        : status
          ? t('account.errors.loginFailed')
          : t('account.errors.backendUnavailable'))
    }
  }

  const logout = async () => {
    try {
      await logoutAccount()
    } catch (error) {
      console.warn('Server logout failed:', error)
    }
    clearCurrentUser()
    queryClient.clear()
    setAccountError('')
  }

  if (isRestoringSession) return null
  if (currentUser) return <ChatWindow currentUser={currentUser} onLogout={logout} />

  return (
    <AccountSetup
      isSubmitting={isCreatingUser}
      showWakeHint={showBackendWakeHint}
      error={accountError}
      onCreate={createUser}
      onLogin={loginUser}
    />
  )
}
