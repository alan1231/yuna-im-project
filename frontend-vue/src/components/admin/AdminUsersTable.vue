<script setup>
defineProps({
  users: {
    type: Array,
    default: () => [],
  },
  query: {
    type: String,
    default: '',
  },
  onlineOnly: {
    type: Boolean,
    default: false,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  formatDateTime: {
    type: Function,
    required: true,
  },
})

defineEmits(['search', 'toggle-online', 'refresh'])
</script>

<template>
  <section class="admin-section admin-users-section">
    <div class="admin-section-header admin-users-header">
      <div>
        <p class="eyebrow">Users</p>
        <h2>使用者管理</h2>
      </div>
      <button class="admin-icon-button" type="button" title="重新整理" @click="$emit('refresh')">
        ↻
      </button>
    </div>

    <div class="admin-toolbar">
      <label class="admin-search">
        <span>搜尋</span>
        <input
          :value="query"
          type="search"
          placeholder="user id 或顯示名稱"
          @input="$emit('search', $event.target.value)"
        >
      </label>
      <button
        class="admin-filter-button"
        :class="{ 'admin-filter-button-active': onlineOnly }"
        type="button"
        @click="$emit('toggle-online')"
      >
        Online
      </button>
    </div>

    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>使用者</th>
            <th>狀態</th>
            <th>建立時間</th>
            <th>最後上線</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="isLoading && users.length === 0">
            <td colspan="4">載入中</td>
          </tr>
          <tr v-else-if="users.length === 0">
            <td colspan="4">沒有符合條件的使用者</td>
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
              <span class="admin-presence" :class="{ 'admin-presence-online': user.online }">
                {{ user.online ? 'Online' : 'Offline' }}
              </span>
            </td>
            <td>{{ formatDateTime(user.created_at) }}</td>
            <td>{{ formatDateTime(user.last_seen) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
