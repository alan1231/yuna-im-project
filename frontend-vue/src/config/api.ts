import { ref } from 'vue'

export type ApiMode = 'local' | 'online'

const STORAGE_KEY = 'frontend-vue-api-mode'
const API_BASES: Record<ApiMode, string> = {
  local: 'http://localhost:8080',
  online: 'https://yuna-im-api.vercel.app',
}

const loadApiMode = (): ApiMode => {
  if (typeof window === 'undefined') return 'local'
  const value = window.localStorage.getItem(STORAGE_KEY)
  return value === 'online' ? 'online' : 'local'
}

export const apiMode = ref<ApiMode>(loadApiMode())

export const setApiMode = (mode: ApiMode) => {
  apiMode.value = mode
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, mode)
  }
}

export const toggleApiMode = () => {
  setApiMode(apiMode.value === 'local' ? 'online' : 'local')
}

export const getApiUrl = () => {
  if (apiMode.value === 'online' && import.meta.env.DEV) {
    return `${window.location.origin}/api`
  }

  return API_BASES[apiMode.value].replace(/\/$/, '')
}

export const getAdminApiUrl = () => {
  if (import.meta.env.DEV) {
    return `${window.location.origin}/api`
  }

  return API_BASES.online.replace(/\/$/, '')
}

export const getWsUrl = () => {
  if (apiMode.value === 'online' && import.meta.env.DEV) {
    return `${window.location.origin.replace(/^http/, 'ws')}`
  }

  return API_BASES[apiMode.value].replace(/\/$/, '').replace(/^http/, 'ws')
}
