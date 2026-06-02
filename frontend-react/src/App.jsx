import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AccountSetup from './components/account/AccountSetup.jsx'
import AdminConsole from './components/admin/AdminConsole.jsx'
import ChatWindow from './components/chat/ChatWindow.jsx'
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
    <Routes>
      <Route path="/" element={<ChatRoute />} />
      <Route path="/admin" element={<AdminConsole />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function ChatRoute() {
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
        setAccountError('這個顯示名稱已被使用，請換一個名稱。')
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
      console.error('建立帳號失敗:', error)
      setAccountError('建立帳號失敗，請確認 Go 後端已啟動。')
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
        setAccountError('找不到這個帳號，請確認名稱是否正確。')
        return
      }

      persistUser({
        id: user.user_id,
        displayName: user.display_name,
      })
    } catch (error) {
      console.error('登入失敗:', error)
      setAccountError('登入失敗，請確認 Go 後端已啟動。')
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
