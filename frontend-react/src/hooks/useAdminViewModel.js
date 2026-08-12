import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { API_URL } from '../config/api'

const ADMIN_TOKEN_KEY = 'yuna-im-admin-token'
const ADMIN_USERNAME_KEY = 'yuna-im-admin-username'

const formatDateTime = (value) => {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export const useAdminViewModel = () => {
  const { t } = useTranslation()
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [query, setQuery] = useState('')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [adminUsername, setAdminUsername] = useState(
    window.localStorage.getItem(ADMIN_USERNAME_KEY) || '',
  )
  const [adminToken, setAdminToken] = useState(
    window.localStorage.getItem(ADMIN_TOKEN_KEY) || '',
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const requestHeaders = useMemo(() => {
    if (!adminToken) return {}

    return {
      'X-Admin-Token': adminToken,
    }
  }, [adminToken])

  const fetchJSON = useCallback(
    async (url) => {
      const response = await fetch(url, {
        headers: requestHeaders,
      })

      if (response.status === 401) {
        throw new Error('unauthorized')
      }
      if (!response.ok) {
        throw new Error('admin request failed')
      }

      return response.json()
    },
    [requestHeaders],
  )

  const refresh = useCallback(async () => {
    if (!adminToken) return

    setIsLoading(true)
    setError('')

    try {
      const usersUrl = new URL(`${API_URL}/admin/users`)
      usersUrl.searchParams.set('limit', '100')
      if (query.trim()) {
        usersUrl.searchParams.set('q', query.trim())
      }
      if (onlineOnly) {
        usersUrl.searchParams.set('online', 'true')
      }

      const [nextStats, nextUsers] = await Promise.all([
        fetchJSON(`${API_URL}/admin/stats`),
        fetchJSON(usersUrl),
      ])
      setStats(nextStats)
      setUsers(nextUsers)
    } catch (requestError) {
      console.error('Admin data load failed:', requestError)
      setError(
        requestError.message === 'unauthorized'
          ? t('admin.errors.unauthorized')
          : t('admin.errors.loadFailed'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [adminToken, fetchJSON, onlineOnly, query, t])

  const submitLogin = async (event) => {
    event.preventDefault()
    const name = username.trim()
    if (!name || password.length < 8 || isLoggingIn) return

    setIsLoggingIn(true)
    setError('')

    try {
      const response = await fetch(`${API_URL}/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: name, password }),
      })
      if (response.status === 401) {
        throw new Error('unauthorized')
      }
      if (!response.ok) {
        throw new Error('admin login failed')
      }

      const result = await response.json()
      setAdminToken(result.token)
      setAdminUsername(result.admin.username)
      setPassword('')
      window.localStorage.setItem(ADMIN_TOKEN_KEY, result.token)
      window.localStorage.setItem(ADMIN_USERNAME_KEY, result.admin.username)
      setUsername(result.admin.username)
      await refresh()
    } catch (requestError) {
      console.error('Admin sign in failed:', requestError)
      setError(
        requestError.message === 'unauthorized'
          ? t('admin.errors.unauthorized')
          : t('admin.errors.loginFailed'),
      )
    } finally {
      setIsLoggingIn(false)
    }
  }

  const signOut = async () => {
    if (adminToken) {
      try {
        await fetch(`${API_URL}/admin/logout`, {
          method: 'POST',
          headers: requestHeaders,
        })
      } catch (requestError) {
        console.warn('Server admin logout failed:', requestError)
      }
    }
    window.localStorage.removeItem(ADMIN_TOKEN_KEY)
    window.localStorage.removeItem(ADMIN_USERNAME_KEY)
    setAdminToken('')
    setAdminUsername('')
    setUsername('')
    setPassword('')
    setStats(null)
    setUsers([])
    setError('')
  }

  const updateQuery = (value) => {
    setQuery(value)
  }

  const toggleOnlineOnly = () => {
    setOnlineOnly((current) => !current)
  }

  useEffect(() => {
    if (adminToken) {
      refresh()
    }
  }, [refresh, adminToken])

  return {
    stats,
    users,
    query,
    onlineOnly,
    username,
    password,
    isLoggingIn,
    adminUsername,
    adminToken,
    isLoading,
    error,
    formatDateTime,
    refresh,
    setUsername,
    setPassword,
    submitLogin,
    signOut,
    updateQuery,
    toggleOnlineOnly,
  }
}