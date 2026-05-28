<script setup>
defineProps({
  stats: {
    type: Object,
    default: null,
  },
  formatDateTime: {
    type: Function,
    required: true,
  },
})
</script>

<template>
  <section class="admin-section">
    <div class="admin-section-header">
      <div>
        <p class="eyebrow">System</p>
        <h2>狀態總覽</h2>
      </div>
      <time v-if="stats" class="admin-checked-at">
        {{ formatDateTime(stats.checked_at) }}
      </time>
    </div>

    <div class="admin-stat-grid">
      <article class="admin-stat">
        <span>使用者</span>
        <strong>{{ stats?.users_total ?? '—' }}</strong>
      </article>
      <article class="admin-stat">
        <span>在線</span>
        <strong>{{ stats?.users_online ?? '—' }}</strong>
      </article>
      <article class="admin-stat">
        <span>Redis Presence</span>
        <strong>{{ stats?.redis_online_keys ?? '—' }}</strong>
      </article>
      <article class="admin-stat">
        <span>訊息</span>
        <strong>{{ stats?.messages_total ?? '—' }}</strong>
      </article>
      <article class="admin-stat">
        <span>好友關係</span>
        <strong>{{ stats?.friends_total ?? '—' }}</strong>
      </article>
      <article class="admin-stat">
        <span>待處理邀請</span>
        <strong>{{ stats?.friend_requests_pending ?? '—' }}</strong>
      </article>
    </div>
  </section>
</template>
