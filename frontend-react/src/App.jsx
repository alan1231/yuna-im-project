import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes } from 'react-router-dom'
import AccountSetup from './components/account/AccountSetup.jsx'
import AdminConsole from './components/admin/AdminConsole.jsx'
import ChatWindow from './components/chat/ChatWindow.jsx'
import LanguageSwitcher from './components/LanguageSwitcher.jsx'
import { API_URL } from './config/api'

const USER_PROFILE_KEY = 'stock-analysis-user-profile'

const loadStoredUser = () => {
  try {
    return JSON.parse(window.localStorage.getItem(USER_PROFILE_KEY) || 'null')
  } catch {
    return null
  }
}

const createLocalUserId = () => {
  return (
    window.crypto?.randomUUID?.() ||
    `user-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
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
  const [currentUser, setCurrentUser] = useState(loadStoredUser)
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const [showBackendWakeHint, setShowBackendWakeHint] = useState(false)
  const [accountError, setAccountError] = useState('')

  const persistUser = (user) => {
    setCurrentUser(user)
    window.localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user))
  }

  const createUser = async (displayName) => {
    const name = displayName.trim()
    if (!name) return

    setIsCreatingUser(true)
    setShowBackendWakeHint(false)
    setAccountError('')
    const wakeHintTimer = window.setTimeout(() => {
      setShowBackendWakeHint(true)
    }, 1200)

    try {
      const response = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: createLocalUserId(),
          display_name: name,
        }),
      })

      if (response.status === 409) {
        setAccountError(t('account.errors.duplicateName'))
        return
      }

      if (!response.ok) {
        throw new Error('create user failed')
      }

      const user = await response.json()
      persistUser({
        id: user.user_id,
        displayName: user.display_name,
      })
    } catch (error) {
      console.error('Account creation failed:', error)
      setAccountError(t('account.errors.createFailed'))
    } finally {
      window.clearTimeout(wakeHintTimer)
      setShowBackendWakeHint(false)
      setIsCreatingUser(false)
    }
  }

  const loginUser = async (displayName) => {
    const name = displayName.trim()
    if (!name) return

    setIsCreatingUser(true)
    setShowBackendWakeHint(false)
    setAccountError('')
    const wakeHintTimer = window.setTimeout(() => {
      setShowBackendWakeHint(true)
    }, 1200)

    try {
      const response = await fetch(`${API_URL}/users`)
      if (!response.ok) throw new Error('load users failed')

      const users = await response.json()
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
    window.localStorage.removeItem(USER_PROFILE_KEY)
    setCurrentUser(null)
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
