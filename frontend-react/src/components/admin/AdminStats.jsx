import { useTranslation } from 'react-i18next'

export default function AdminStats({ stats, formatDateTime }) {
  const { t } = useTranslation()

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <div>
          <p className="eyebrow">System</p>
          <h2>{t('admin.statsTitle')}</h2>
        </div>
        {stats ? <time className="admin-checked-at">{formatDateTime(stats.checked_at)}</time> : null}
      </div>

      <div className="admin-stat-grid">
        <article className="admin-stat">
          <span>{t('admin.stats.users')}</span>
          <strong>{stats?.users_total ?? '—'}</strong>
        </article>
        <article className="admin-stat">
          <span>{t('admin.stats.online')}</span>
          <strong>{stats?.users_online ?? '—'}</strong>
        </article>
        <article className="admin-stat">
          <span>Redis Presence</span>
          <strong>{stats?.redis_online_keys ?? '—'}</strong>
        </article>
        <article className="admin-stat">
          <span>{t('admin.stats.messages')}</span>
          <strong>{stats?.messages_total ?? '—'}</strong>
        </article>
        <article className="admin-stat">
          <span>{t('admin.stats.friends')}</span>
          <strong>{stats?.friends_total ?? '—'}</strong>
        </article>
        <article className="admin-stat">
          <span>{t('admin.stats.pendingRequests')}</span>
          <strong>{stats?.friend_requests_pending ?? '—'}</strong>
        </article>
      </div>
    </section>
  )
}
