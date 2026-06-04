import { create } from 'zustand'
import type { CurrentUser } from '../types/chat'

const USER_PROFILE_KEY = 'stock-analysis-user-profile'

const loadStoredUser = (): CurrentUser | null => {
  try {
    const storedValue = window.localStorage.getItem(USER_PROFILE_KEY)
    if (!storedValue) return null

    const parsed = JSON.parse(storedValue) as Partial<CurrentUser>
    if (!parsed.id || !parsed.displayName) return null

    return {
      id: parsed.id,
      displayName: parsed.displayName,
    }
  } catch {
    return null
  }
}

type AuthState = {
  currentUser: CurrentUser | null
  setCurrentUser: (user: CurrentUser) => void
  clearCurrentUser: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: loadStoredUser(),
  setCurrentUser: (user) => {
    window.localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user))
    set({ currentUser: user })
  },
  clearCurrentUser: () => {
    window.localStorage.removeItem(USER_PROFILE_KEY)
    set({ currentUser: null })
  },
}))
