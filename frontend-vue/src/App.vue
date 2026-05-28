<script setup>
import { ref } from 'vue'
import AccountSetup from './components/account/AccountSetup.vue'
import AdminConsole from './components/admin/AdminConsole.vue'
import ChatWindow from './components/chat/ChatWindow.vue'

const API_HOST = window.location.hostname || 'localhost'
const API_URL = `http://${API_HOST}:8080`
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

const currentUser = ref(loadStoredUser())
const isCreatingUser = ref(false)
const accountError = ref('')
// The admin console is bundled in the same Vue app, but kept on a separate
// route so chat and management UI can evolve independently.
const isAdminRoute = window.location.pathname.startsWith('/admin')

const createUser = async (displayName) => {
  const name = displayName.trim()
  if (!name) return

  isCreatingUser.value = true
  accountError.value = ''

  try {
    const payload = {
      user_id: createLocalUserId(),
      display_name: name,
    }

    const response = await fetch(`${API_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (response.status === 409) {
      accountError.value = '這個顯示名稱已被使用，請換一個名稱。'
      return
    }

    if (!response.ok) {
      throw new Error('create user failed')
    }

    const user = await response.json()
    currentUser.value = {
      id: user.user_id,
      displayName: user.display_name,
    }
    window.localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(currentUser.value))
  } catch (error) {
    console.error('建立帳號失敗:', error)
    accountError.value = '建立帳號失敗，請確認 Go 後端已啟動。'
  } finally {
    isCreatingUser.value = false
  }
}

const loginUser = async (displayName) => {
  const name = displayName.trim()
  if (!name) return

  isCreatingUser.value = true
  accountError.value = ''

  try {
    const response = await fetch(`${API_URL}/users`)
    if (!response.ok) throw new Error('load users failed')

    const users = await response.json()
    const user = users.find((item) => item.display_name.toLowerCase() === name.toLowerCase())
    if (!user) {
      accountError.value = '找不到這個帳號，請確認名稱是否正確。'
      return
    }

    currentUser.value = {
      id: user.user_id,
      displayName: user.display_name,
    }
    window.localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(currentUser.value))
  } catch (error) {
    console.error('登入失敗:', error)
    accountError.value = '登入失敗，請確認 Go 後端已啟動。'
  } finally {
    isCreatingUser.value = false
  }
}

const logout = () => {
  window.localStorage.removeItem(USER_PROFILE_KEY)
  currentUser.value = null
  accountError.value = ''
}
</script>

<template>
  <AdminConsole v-if="isAdminRoute" />
  <ChatWindow
    v-else-if="currentUser"
    :current-user="currentUser"
    @logout="logout"
  />
  <AccountSetup
    v-else
    :is-submitting="isCreatingUser"
    :error="accountError"
    @create="createUser"
    @login="loginUser"
  />
</template>
