<template>
  <section class="admin-page">
    <div class="admin-shell">
      <header class="admin-topbar">
        <div>
          <p class="eyebrow">Admin Console</p>
          <h1>{{ t('adminTitle') }}</h1>
          <p class="admin-copy">{{ t('adminSubtitle') }}</p>
        </div>
        <div class="admin-header-actions">
          <RouterLink class="ghost-button" to="/">← {{ t('navChat') }}</RouterLink>
          <button class="primary-button" type="button" @click="refreshAll">{{ t('refresh') }}</button>
        </div>
      </header>

      <section class="admin-section">
        <form class="admin-token-form" @submit.prevent="saveToken">
          <label class="admin-field">
            <span>{{ t('adminToken') }}</span>
            <input
              v-model="tokenInput"
              type="password"
              :placeholder="t('adminTokenPlaceholder')"
              autocomplete="current-password"
            />
          </label>
          <button class="primary-button" type="submit">{{ t('adminApply') }}</button>
        </form>

        <div class="admin-toolbar">
          <label class="admin-search">
            <span>{{ t('search') }}</span>
            <input
              v-model="query"
              type="search"
              :placeholder="t('adminSearchPlaceholder')"
              @input="searchUsers"
            />
          </label>
          <button
            class="admin-filter-button"
            :class="{ 'admin-filter-button-active': onlineOnly }"
            type="button"
            @click="toggleOnlineOnly"
          >
            {{ t('onlineOnly') }}
          </button>
          <button class="admin-icon-button" type="button" :title="t('refresh')" :aria-label="t('refresh')" @click="refreshAll">
            ↻
          </button>
        </div>
      </section>

      <p v-if="error" class="admin-error">
        {{ t('errorPrefix') }} {{ error }}
      </p>

      <div class="admin-content">
        <div class="stats-grid">
        <article class="stat-card">
          <span>{{ t('statsUsers') }}</span>
          <strong>{{ stats?.users_total ?? '—' }}</strong>
        </article>
        <article class="stat-card">
          <span>{{ t('statsOnline') }}</span>
          <strong>{{ stats?.users_online ?? '—' }}</strong>
        </article>
        <article class="stat-card">
          <span>{{ t('statsMessages') }}</span>
          <strong>{{ stats?.messages_total ?? '—' }}</strong>
        </article>
        <article class="stat-card">
          <span>{{ t('statsPending') }}</span>
          <strong>{{ stats?.friend_requests_pending ?? '—' }}</strong>
        </article>
        <article class="stat-card">
          <span>{{ t('statsFriends') }}</span>
          <strong>{{ stats?.friends_total ?? '—' }}</strong>
        </article>
        </div>

        <section class="admin-section admin-users-section">
          <div class="section-head admin-section-header">
            <div>
              <p class="eyebrow">{{ t('adminUsersEyebrow') }}</p>
              <h2>{{ t('adminUsersTitle') }}</h2>
              <p>{{ t('lastChecked') }}: {{ formatDate(stats?.checked_at) }}</p>
            </div>
            <span class="muted-pill">{{ users.length }} rows</span>
          </div>

          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>{{ t('adminUser') }}</th>
                  <th>{{ t('status') }}</th>
                  <th>{{ t('adminCreatedAt') }}</th>
                  <th>{{ t('lastSeen') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="isLoading && !users.length">
                  <td colspan="4" class="table-empty">{{ t('adminLoading') }}</td>
                </tr>
                <tr v-else-if="!users.length">
                  <td colspan="4" class="table-empty">{{ t('adminEmpty') }}</td>
                </tr>
                <tr v-for="user in users" :key="user.user_id">
                  <td>
                    <div class="admin-user-cell">
                      <span class="admin-user-avatar">
                        {{ user.display_name?.slice(0, 1).toUpperCase() || '?' }}
                      </span>
                      <div>
                        <strong>{{ user.display_name }}</strong>
                        <span>{{ user.user_id }}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="status-pill" :class="{ online: user.online }">
                      {{ user.online ? 'online' : 'offline' }}
                    </span>
                  </td>
                  <td>{{ formatDate(user.created_at) }}</td>
                  <td>{{ formatDate(user.last_seen) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { fetchAdminStats, fetchAdminUsers } from '../api'
import { useI18n } from '../i18n'
import type { AdminStats, AdminUser } from '../types'

const { t } = useI18n()
const STORAGE_KEY = 'frontend-vue-admin-token'
const tokenInput = ref('')
const adminToken = ref('')
const query = ref('')
const onlineOnly = ref(false)
const stats = ref<AdminStats | null>(null)
const users = ref<AdminUser[]>([])
const error = ref('')
const isLoading = ref(false)

const readToken = () => {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(STORAGE_KEY) ?? ''
}

tokenInput.value = readToken()
adminToken.value = tokenInput.value

const saveToken = () => {
  if (typeof window === 'undefined') return
  const value = tokenInput.value.trim()
  adminToken.value = value
  if (value) {
    window.localStorage.setItem(STORAGE_KEY, value)
  } else {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}

const formatDate = (value?: string) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const normalizeAdminError = (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  if (message.includes('401')) return t('adminUnauthorized')
  return t('adminLoadFailed')
}

const refreshAll = async () => {
  isLoading.value = true
  error.value = ''

  const [statsResult, usersResult] = await Promise.allSettled([
    fetchAdminStats(adminToken.value),
    fetchAdminUsers({
      token: adminToken.value,
      q: query.value.trim() || undefined,
      online: onlineOnly.value,
      limit: 100,
    }),
  ])

  if (statsResult.status === 'fulfilled') {
    stats.value = statsResult.value
  } else if (!stats.value) {
    error.value = normalizeAdminError(statsResult.reason)
  }

  if (usersResult.status === 'fulfilled') {
    users.value = usersResult.value
  } else if (!users.value.length) {
    error.value = normalizeAdminError(usersResult.reason)
  }

  isLoading.value = false
}

const searchUsers = async () => {
  await refreshAll()
}

const toggleOnlineOnly = async () => {
  onlineOnly.value = !onlineOnly.value
  await refreshAll()
}

onMounted(async () => {
  await refreshAll()
})
</script>
