import { useTranslation } from 'react-i18next'

export default function AdminUsersTable({
  users = [],
  query = '',
  onlineOnly = false,
  isLoading = false,
  formatDateTime,
  onSearch,
  onToggleOnline,
  onRefresh,
}) {
  const { t } = useTranslation()

  return (
    <section className="admin-section admin-users-section">
      <div className="admin-section-header admin-users-header">
        <div>
          <p className="eyebrow">Users</p>
          <h2>{t('admin.usersTitle')}</h2>
        </div>
        <button className="admin-icon-button" type="button" title={t('admin.refresh')} onClick={onRefresh}>
          ↻
        </button>
      </div>

      <div className="admin-toolbar">
        <label className="admin-search">
          <span>{t('admin.search')}</span>
          <input
            value={query}
            type="search"
            placeholder={t('admin.searchPlaceholder')}
            onChange={(event) => onSearch(event.target.value)}
          />
        </label>
        <button
          className={`admin-filter-button ${onlineOnly ? 'admin-filter-button-active' : ''}`}
          type="button"
          onClick={onToggleOnline}
        >
          Online
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t('admin.table.user')}</th>
              <th>{t('admin.table.status')}</th>
              <th>{t('admin.table.createdAt')}</th>
              <th>{t('admin.table.lastSeen')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && users.length === 0 ? (
              <tr>
                <td colSpan="4">{t('admin.table.loading')}</td>
              </tr>
            ) : null}
            {!isLoading && users.length === 0 ? (
              <tr>
                <td colSpan="4">{t('admin.table.empty')}</td>
              </tr>
            ) : null}
            {users.map((user) => (
              <tr key={user.user_id}>
                <td>
                  <div className="admin-user-cell">
                    <span className="admin-user-avatar">
                      {user.display_name?.slice(0, 1).toUpperCase() || '?'}
                    </span>
                    <div>
                      <strong>{user.display_name}</strong>
                      <span>{user.user_id}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`admin-presence ${user.online ? 'admin-presence-online' : ''}`}>
                    {user.online ? 'Online' : 'Offline'}
                  </span>
                </td>
                <td>{formatDateTime(user.created_at)}</td>
                <td>{formatDateTime(user.last_seen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
