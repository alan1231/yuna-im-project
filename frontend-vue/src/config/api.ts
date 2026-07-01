const rawApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || 'http://localhost:8080'

export const API_URL = rawApiUrl.replace(/\/$/, '')
export const WS_URL = API_URL.replace(/^http/, 'ws')
