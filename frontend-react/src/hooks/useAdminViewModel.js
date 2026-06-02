import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { API_URL } from '../config/api'

const ADMIN_TOKEN_KEY = 'yuna-im-admin-token'

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
  const [tokenInput, setTokenInput] = useState(window.localStorage.getItem(ADMIN_TOKEN_KEY) || '')
  const [adminToken, setAdminToken] = useState(tokenInput)
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
  }, [fetchJSON, onlineOnly, query, t])

  const saveToken = (event) => {
    event.preventDefault()
    const nextToken = tokenInput.trim()
    setAdminToken(nextToken)

    if (nextToken) {
      window.localStorage.setItem(ADMIN_TOKEN_KEY, nextToken)
    } else {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY)
    }
  }

  const updateQuery = (value) => {
    setQuery(value)
  }

  const toggleOnlineOnly = () => {
    setOnlineOnly((current) => !current)
  }

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    stats,
    users,
    query,
    onlineOnly,
    tokenInput,
    setTokenInput,
    isLoading,
    error,
    formatDateTime,
    refresh,
    saveToken,
    updateQuery,
    toggleOnlineOnly,
  }
}
