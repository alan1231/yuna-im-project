import { computed, onMounted, ref } from 'vue'

const API_HOST = window.location.hostname || 'localhost'
const API_URL = `http://${API_HOST}:8080`
const ADMIN_TOKEN_KEY = 'yuna-im-admin-token'

// Admin dates come from MongoDB/Go as ISO timestamps. Invalid or missing values
// are displayed as an empty dash instead of leaking raw zero dates.
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
  const stats = ref(null)
  const users = ref([])
  const query = ref('')
  const onlineOnly = ref(false)
  const tokenInput = ref(window.localStorage.getItem(ADMIN_TOKEN_KEY) || '')
  const adminToken = ref(tokenInput.value)
  const isLoading = ref(false)
  const error = ref('')

  const hasStats = computed(() => Boolean(stats.value))

  // The backend admin API accepts a simple token gate for demo deployments.
  // Full admin login can later replace this without changing the table/stats UI.
  const requestHeaders = computed(() => {
    if (!adminToken.value) return {}

    return {
      'X-Admin-Token': adminToken.value,
    }
  })

  const fetchJSON = async (url) => {
    const response = await fetch(url, {
      headers: requestHeaders.value,
    })

    if (response.status === 401) {
      throw new Error('unauthorized')
    }
    if (!response.ok) {
      throw new Error('admin request failed')
    }

    return response.json()
  }

  const loadStats = async () => {
    stats.value = await fetchJSON(`${API_URL}/admin/stats`)
  }

  const loadUsers = async () => {
    const url = new URL(`${API_URL}/admin/users`)
    url.searchParams.set('limit', '100')
    if (query.value.trim()) {
      url.searchParams.set('q', query.value.trim())
    }
    if (onlineOnly.value) {
      url.searchParams.set('online', 'true')
    }

    users.value = await fetchJSON(url)
  }

  // Stats and users are fetched together so the dashboard refresh button gives a
  // consistent snapshot of Mongo counts and Redis presence.
  const refresh = async () => {
    isLoading.value = true
    error.value = ''

    try {
      await Promise.all([loadStats(), loadUsers()])
    } catch (requestError) {
      console.error('載入後台資料失敗:', requestError)
      error.value =
        requestError.message === 'unauthorized'
          ? '管理者權杖不正確。'
          : '後台資料載入失敗，請確認 Go 後端、MongoDB 與 Redis 已啟動。'
    } finally {
      isLoading.value = false
    }
  }

  // The token is local to this browser and is never written back to the server.
  const saveToken = () => {
    const nextToken = tokenInput.value.trim()
    adminToken.value = nextToken

    if (nextToken) {
      window.localStorage.setItem(ADMIN_TOKEN_KEY, nextToken)
    } else {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY)
    }

    refresh()
  }

  const updateQuery = (value) => {
    query.value = value
    refresh()
  }

  const toggleOnlineOnly = () => {
    onlineOnly.value = !onlineOnly.value
    refresh()
  }

  onMounted(refresh)

  return {
    stats,
    users,
    query,
    onlineOnly,
    tokenInput,
    isLoading,
    error,
    hasStats,
    formatDateTime,
    refresh,
    saveToken,
    updateQuery,
    toggleOnlineOnly,
  }
}
