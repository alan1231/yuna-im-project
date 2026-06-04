import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes } from 'react-router-dom'
import AccountSetup from './components/account/AccountSetup'
import AdminConsole from './components/admin/AdminConsole.jsx'
import ChatWindow from './components/chat/ChatWindow'
import LanguageSwitcher from './components/LanguageSwitcher.jsx'
import { chatQueryKeys, createUser as createUserApi, fetchUsers } from './api/chatApi'
import { useAuthStore } from './stores/authStore'
import type { CurrentUser } from './types/chat'

const createLocalUserId = () => {
  return window.crypto?.randomUUID?.() || `user-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function App() {
  return (
    <div className="app-shell">
      <LanguageSwitcher />
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

  const persistUser = (user: CurrentUser) => {
    setCurrentUser(user)
  }

  const createUserMutation = useMutation({
    mutationFn: createUserApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.users('') })
    },
  })

  const createUser = async (displayName: string) => {
    const name = displayName.trim()
    if (!name) return

    setIsCreatingUser(true)
    setShowBackendWakeHint(false)
    setAccountError('')
    const wakeHintTimer = window.setTimeout(() => {
      setShowBackendWakeHint(true)
    }, 1200)

    try {
      const user = await createUserMutation.mutateAsync({
        userId: createLocalUserId(),
        displayName: name,
      })
      persistUser({
        id: user.user_id,
        displayName: user.display_name,
      })
    } catch (error) {
      console.error('Account creation failed:', error)
      setAccountError(error instanceof Error && error.message.includes('409')
        ? t('account.errors.duplicateName')
        : t('account.errors.createFailed'))
    } finally {
      window.clearTimeout(wakeHintTimer)
      setShowBackendWakeHint(false)
      setIsCreatingUser(false)
    }
  }

  const loginUser = async (displayName: string) => {
    const name = displayName.trim()
    if (!name) return

    setIsCreatingUser(true)
    setShowBackendWakeHint(false)
    setAccountError('')
    const wakeHintTimer = window.setTimeout(() => {
      setShowBackendWakeHint(true)
    }, 1200)

    try {
      const users = await queryClient.fetchQuery({
        queryKey: chatQueryKeys.users(''),
        queryFn: () => fetchUsers(),
      })
      const user = users.find((item) => item.display_name.toLowerCase() === name.toLowerCase())
      if (!user) {
        setAccountError(t('account.errors.loginNotFound'))
        return
      }

      persistUser({
        id: user.user_id,
        displayName: user.display_name,
      })
    } catch (error) {
      console.error('Sign in failed:', error)
      setAccountError(t('account.errors.loginFailed'))
    } finally {
      window.clearTimeout(wakeHintTimer)
      setShowBackendWakeHint(false)
      setIsCreatingUser(false)
    }
  }

  const logout = () => {
    clearCurrentUser()
    setAccountError('')
  }

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
