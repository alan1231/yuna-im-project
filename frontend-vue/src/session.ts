import { ref } from 'vue'
import type { CurrentUser } from './types'

const STORAGE_KEY = 'frontend-vue-current-user'

const readCurrentUser = (): CurrentUser | null => {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as CurrentUser
    if (parsed && typeof parsed.id === 'string' && typeof parsed.displayName === 'string') {
      return parsed
    }
  } catch {
    return null
  }

  return null
}

export const currentUser = ref<CurrentUser | null>(readCurrentUser())

export const setCurrentUser = (user: CurrentUser) => {
  currentUser.value = user
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
  }
}

export const clearCurrentUser = () => {
  currentUser.value = null
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}
