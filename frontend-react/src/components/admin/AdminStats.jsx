export default function AdminStats({ stats, formatDateTime }) {
  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <div>
          <p className="eyebrow">System</p>
          <h2>狀態總覽</h2>
        </div>
        {stats ? <time className="admin-checked-at">{formatDateTime(stats.checked_at)}</time> : null}
      </div>

      <div className="admin-stat-grid">
        <article className="admin-stat">
          <span>使用者</span>
          <strong>{stats?.users_total ?? '—'}</strong>
        </article>
        <article className="admin-stat">
          <span>在線</span>
          <strong>{stats?.users_online ?? '—'}</strong>
        </article>
        <article className="admin-stat">
          <span>Redis Presence</span>
          <strong>{stats?.redis_online_keys ?? '—'}</strong>
        </article>
        <article className="admin-stat">
          <span>訊息</span>
          <strong>{stats?.messages_total ?? '—'}</strong>
        </article>
        <article className="admin-stat">
          <span>好友關係</span>
          <strong>{stats?.friends_total ?? '—'}</strong>
        </article>
        <article className="admin-stat">
          <span>待處理邀請</span>
          <strong>{stats?.friend_requests_pending ?? '—'}</strong>
        </article>
      </div>
    </section>
  )
}
