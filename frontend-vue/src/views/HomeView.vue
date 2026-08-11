<template>
  <ChatWindow
    v-if="currentUser && !isRestoringSession"
    :current-user="currentUser"
    @logout="logout"
  />
  <AccountSetup
    v-else-if="!isRestoringSession"
    :is-submitting="isSubmitting"
    :show-wake-hint="showWakeHint"
    :error="error"
    @create="createUser"
    @login="loginUser"
  />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AccountSetup from '../components/AccountSetup.vue'
import ChatWindow from '../components/ChatWindow.vue'
import { fetchCurrentUser, loginAccount, logoutAccount, registerAccount, wakeBackend } from '../api'
import { useI18n } from '../i18n'
import { clearCurrentUser, currentUser, setCurrentUser } from '../session'
import type { CurrentUser } from '../types'

const { t } = useI18n()
const isSubmitting = ref(false)
const showWakeHint = ref(false)
const error = ref('')
const isRestoringSession = ref(Boolean(currentUser.value))

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

onMounted(async () => {
  if (!currentUser.value) {
    isRestoringSession.value = false
    return
  }
  try {
    const user = await fetchCurrentUser()
    persistUser({ id: user.user_id, displayName: user.display_name, token: currentUser.value.token })
  } catch {
    clearCurrentUser()
  } finally {
    isRestoringSession.value = false
  }
})

const requestedPassword = (password = '') => password || window.prompt('密碼（至少 8 個字元）') || ''
const passwordIsValid = (password: string) => {
  const bytes = new TextEncoder().encode(password).length
  return bytes >= 8 && bytes <= 72
}

const createUser = async (displayName: string, password = '') => {
  const name = displayName.trim()
  const credential = requestedPassword(password)
  if (!name || !passwordIsValid(credential) || isSubmitting.value) return

  try {
    await runWithBackendWake(async () => {
      const { user, token } = await registerAccount(name, credential)
      persistUser({
        id: user.user_id,
        displayName: user.display_name,
        token,
      })
    })
  } catch (cause) {
    console.error('Account creation failed:', cause)
    error.value = cause instanceof Error && cause.message.includes('409')
      ? t('duplicateName')
      : t('createFailed')
  }
}

const loginUser = async (displayName: string, password = '') => {
  const name = displayName.trim()
  const credential = requestedPassword(password)
  if (!name || !passwordIsValid(credential) || isSubmitting.value) return

  try {
    await runWithBackendWake(async () => {
      const { user, token } = await loginAccount(name, credential)
      persistUser({
        id: user.user_id,
        displayName: user.display_name,
        token,
      })
    })
  } catch (cause) {
    console.error('Sign in failed:', cause)
    error.value = t('loginFailed')
  }
}

const logout = async () => {
  try {
    await logoutAccount()
  } catch (cause) {
    console.warn('Server logout failed:', cause)
  }
  clearCurrentUser()
  error.value = ''
}
</script>
