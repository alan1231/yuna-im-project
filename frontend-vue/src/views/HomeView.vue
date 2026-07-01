<template>
  <ChatWindow
    v-if="currentUser"
    :current-user="currentUser"
    @logout="logout"
  />
  <AccountSetup
    v-else
    :is-submitting="isSubmitting"
    :show-wake-hint="showWakeHint"
    :error="error"
    @create="createUser"
    @login="loginUser"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AccountSetup from '../components/AccountSetup.vue'
import ChatWindow from '../components/ChatWindow.vue'
import { createUser as createUserApi, fetchUsers, wakeBackend } from '../api'
import { useI18n } from '../i18n'
import { clearCurrentUser, currentUser, setCurrentUser } from '../session'
import type { CurrentUser } from '../types'

const { t } = useI18n()
const isSubmitting = ref(false)
const showWakeHint = ref(false)
const error = ref('')

const createLocalUserId = () => {
  return window.crypto?.randomUUID?.() || `user-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const persistUser = (user: CurrentUser) => {
  setCurrentUser(user)
}

const runWithBackendWake = async (action: () => Promise<void>) => {
  isSubmitting.value = true
  showWakeHint.value = false
  error.value = ''

  const wakeHintTimer = window.setTimeout(() => {
    showWakeHint.value = true
  }, 1200)

  try {
    await wakeBackend()
    await action()
  } finally {
    window.clearTimeout(wakeHintTimer)
    showWakeHint.value = false
    isSubmitting.value = false
  }
}

const createUser = async (displayName: string) => {
  const name = displayName.trim()
  if (!name || isSubmitting.value) return

  try {
    await runWithBackendWake(async () => {
      const user = await createUserApi({
        userId: createLocalUserId(),
        displayName: name,
      })
      persistUser({
        id: user.user_id,
        displayName: user.display_name,
      })
    })
  } catch (cause) {
    console.error('Account creation failed:', cause)
    error.value = cause instanceof Error && cause.message.includes('409')
      ? t('duplicateName')
      : t('createFailed')
  }
}

const loginUser = async (displayName: string) => {
  const name = displayName.trim()
  if (!name || isSubmitting.value) return

  try {
    await runWithBackendWake(async () => {
      const users = await fetchUsers()
      const user = users.find((item) => item.display_name.toLowerCase() === name.toLowerCase())
      if (!user) {
        error.value = t('loginNotFound')
        return
      }

      persistUser({
        id: user.user_id,
        displayName: user.display_name,
      })
    })
  } catch (cause) {
    console.error('Sign in failed:', cause)
    error.value = t('loginFailed')
  }
}

const logout = () => {
  clearCurrentUser()
  error.value = ''
}
</script>
