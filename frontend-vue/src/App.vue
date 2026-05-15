<script setup>
import { ref } from 'vue'
import AccountSetup from './components/account/AccountSetup.vue'
import ChatWindow from './components/chat/ChatWindow.vue'

const API_URL = 'http://localhost:8080'
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

const logout = () => {
  window.localStorage.removeItem(USER_PROFILE_KEY)
  currentUser.value = null
  accountError.value = ''
}
</script>

<template>
  <ChatWindow
    v-if="currentUser"
    :current-user="currentUser"
    @logout="logout"
  />
  <AccountSetup
    v-else
    :is-submitting="isCreatingUser"
    :error="accountError"
    @create="createUser"
  />
</template>
