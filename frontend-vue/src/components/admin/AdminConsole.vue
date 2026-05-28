<script setup>
import AdminStats from './AdminStats.vue'
import AdminUsersTable from './AdminUsersTable.vue'
import { useAdminViewModel } from '../../composables/useAdminViewModel'

const {
  stats,
  users,
  query,
  onlineOnly,
  tokenInput,
  isLoading,
  error,
  formatDateTime,
  refresh,
  saveToken,
  updateQuery,
  toggleOnlineOnly,
} = useAdminViewModel()
</script>

<template>
  <main class="admin-shell">
    <header class="admin-topbar">
      <div>
        <p class="eyebrow">Admin Console</p>
        <h1>Yuna IM 後台</h1>
      </div>
      <form class="admin-token-form" @submit.prevent="saveToken">
        <label>
          <span>Token</span>
          <input
            v-model="tokenInput"
            type="password"
            autocomplete="current-password"
            placeholder="ADMIN_TOKEN"
          >
        </label>
        <button type="submit">套用</button>
      </form>
    </header>

    <p v-if="error" class="admin-error">{{ error }}</p>

    <div class="admin-content">
      <AdminStats
        :stats="stats"
        :format-date-time="formatDateTime"
      />
      <AdminUsersTable
        :users="users"
        :query="query"
        :online-only="onlineOnly"
        :is-loading="isLoading"
        :format-date-time="formatDateTime"
        @search="updateQuery"
        @toggle-online="toggleOnlineOnly"
        @refresh="refresh"
      />
    </div>
  </main>
</template>
