import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { API_URL } from '../config/api'

const ADMIN_TOKEN_KEY = 'yuna-im-admin-token'
const ADMIN_USERNAME_KEY = 'yuna-im-admin-username'
const USERS_PAGE_SIZE = 25

const formatDate = (value, locale) => {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1) return '—'

  return date.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export const useAdminViewModel = () => {
  const { t, i18n } = useTranslation()
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [usersTotal, setUsersTotal] = useState(0)
  const [usersOffset, setUsersOffset] = useState(0)
  const [auditLogs, setAuditLogs] = useState([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
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
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [selectedAction, setSelectedAction] = useState(null)
  const [confirmation, setConfirmation] = useState('')
  const [isSubmittingAction, setIsSubmittingAction] = useState(false)
  const [error, setError] = useState('')

  const clearAdminSession = useCallback(() => {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY)
    window.localStorage.removeItem(ADMIN_USERNAME_KEY)
    setAdminToken('')
    setAdminUsername('')
    setStats(null)
    setUsers([])
    setUsersTotal(0)
    setUsersOffset(0)
    setAuditLogs([])
    setIsLoadingUsers(false)
    setIsLoadingStats(false)
  }, [])

  const adminRequest = useCallback(async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'X-Admin-Token': adminToken,
      },
    })

    if (response.status === 401) {
      clearAdminSession()
      throw new Error('unauthorized')
    }
    if (!response.ok) throw new Error('admin request failed')
    if (response.status === 204) return null

    return response.json()
  }, [adminToken, clearAdminSession])

  const reportLoadError = useCallback((requestError) => {
    if (requestError.name === 'AbortError') return
    console.error('Admin data load failed:', requestError)
    setError(
      requestError.message === 'unauthorized'
        ? t('admin.errors.unauthorized')
        : t('admin.errors.loadFailed'),
    )
  }, [t])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!adminToken) return undefined

    const controller = new AbortController()
    setIsLoadingStats(true)
    adminRequest(`${API_URL}/admin/stats`, { signal: controller.signal })
      .then(setStats)
      .catch(reportLoadError)
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingStats(false)
      })

    return () => controller.abort()
  }, [adminRequest, adminToken, refreshVersion, reportLoadError])

  useEffect(() => {
    if (!adminToken) return undefined

    const controller = new AbortController()
    const usersUrl = new URL(`${API_URL}/admin/users`)
    usersUrl.searchParams.set('limit', String(USERS_PAGE_SIZE))
    usersUrl.searchParams.set('offset', String(usersOffset))
    if (debouncedQuery) usersUrl.searchParams.set('q', debouncedQuery)
    if (onlineOnly) usersUrl.searchParams.set('online', 'true')

    setIsLoadingUsers(true)
    adminRequest(usersUrl, { signal: controller.signal })
      .then((result) => {
        setUsers(result.items)
        setUsersTotal(result.total)
      })
      .catch(reportLoadError)
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingUsers(false)
      })

    return () => controller.abort()
  }, [adminRequest, adminToken, debouncedQuery, onlineOnly, refreshVersion, reportLoadError, usersOffset])

  useEffect(() => {
    if (!adminToken) return undefined

    const controller = new AbortController()
    adminRequest(`${API_URL}/admin/audit-logs`, { signal: controller.signal })
      .then(setAuditLogs)
      .catch(reportLoadError)
    return () => controller.abort()
  }, [adminRequest, adminToken, refreshVersion, reportLoadError])

  const refresh = () => {
    if (!adminToken) return
    setError('')
    setRefreshVersion((current) => current + 1)
  }

  const submitLogin = async (event) => {
    event.preventDefault()
    const name = username.trim()
    if (!name || password.length < 8 || isLoggingIn) return

    setIsLoggingIn(true)
    setError('')

    try {
      const response = await fetch(`${API_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name, password }),
      })
      if (response.status === 401) throw new Error('unauthorized')
      if (!response.ok) throw new Error('admin login failed')

      const result = await response.json()
      window.localStorage.setItem(ADMIN_TOKEN_KEY, result.token)
      window.localStorage.setItem(ADMIN_USERNAME_KEY, result.admin.username)
      setAdminToken(result.token)
      setAdminUsername(result.admin.username)
      setUsername(result.admin.username)
      setPassword('')
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
          headers: { 'X-Admin-Token': adminToken },
        })
      } catch (requestError) {
        console.warn('Server admin logout failed:', requestError)
      }
    }
    clearAdminSession()
    setUsername('')
    setPassword('')
    setError('')
  }

  const openUserAction = (action, user) => {
    setSelectedAction({ action, user })
    setConfirmation('')
    setError('')
  }

  const closeUserAction = () => {
    if (isSubmittingAction) return
    setSelectedAction(null)
    setConfirmation('')
  }

  const submitUserAction = async () => {
    if (!selectedAction || isSubmittingAction) return
    const { action, user } = selectedAction
    if (action === 'delete' && confirmation.trim() !== user.user_id) return

    setIsSubmittingAction(true)
    setError('')
    try {
      if (action === 'delete') {
        const url = new URL(`${API_URL}/admin/users`)
        url.searchParams.set('user_id', user.user_id)
        await adminRequest(url, { method: 'DELETE' })
      } else {
        const endpoint = action === 'logout' ? 'logout' : 'status'
        await adminRequest(`${API_URL}/admin/users/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.user_id,
            ...(action !== 'logout' ? { disabled: action === 'disable' } : {}),
          }),
        })
      }
      setSelectedAction(null)
      setConfirmation('')
      setRefreshVersion((current) => current + 1)
    } catch (requestError) {
      console.error('Admin user action failed:', requestError)
      setError(
        requestError.message === 'unauthorized'
          ? t('admin.errors.unauthorized')
          : t('admin.errors.actionFailed'),
      )
    } finally {
      setIsSubmittingAction(false)
    }
  }

  return {
    stats,
    users,
    usersTotal,
    usersOffset,
    usersPageSize: USERS_PAGE_SIZE,
    auditLogs,
    query,
    onlineOnly,
    username,
    password,
    isLoggingIn,
    adminUsername,
    adminToken,
    isLoading: isLoadingUsers,
    isRefreshing: isLoadingUsers || isLoadingStats,
    error,
    selectedAction,
    confirmation,
    isSubmittingAction,
    formatDateTime: (value) => formatDate(value, i18n.resolvedLanguage || i18n.language),
    refresh,
    setUsername,
    setPassword,
    submitLogin,
    signOut,
    updateQuery: (value) => {
      setQuery(value)
      setUsersOffset(0)
    },
    toggleOnlineOnly: () => {
      setOnlineOnly((current) => !current)
      setUsersOffset(0)
    },
    previousUsersPage: () => setUsersOffset((current) => Math.max(0, current - USERS_PAGE_SIZE)),
    nextUsersPage: () => setUsersOffset((current) => current + USERS_PAGE_SIZE),
    openUserAction,
    closeUserAction,
    submitUserAction,
    setConfirmation,
  }
}
