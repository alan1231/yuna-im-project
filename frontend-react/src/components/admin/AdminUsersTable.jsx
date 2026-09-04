import { useTranslation } from 'react-i18next'

export default function AdminUsersTable({
  users = [],
  total = 0,
  offset = 0,
  pageSize = 25,
  query = '',
  onlineOnly = false,
  isLoading = false,
  formatDateTime,
  onSearch,
  onToggleOnline,
  onRefresh,
  onPreviousPage,
  onNextPage,
  onUserAction,
}) {
  const { t } = useTranslation()

  return (
    <section className="admin-section admin-users-section">
      <div className="admin-section-header admin-users-header">
        <div>
          <p className="eyebrow">{t('admin.usersEyebrow')}</p>
          <h2>{t('admin.usersTitle')}</h2>
        </div>
        <button
          className="admin-icon-button"
          type="button"
          aria-label={t('admin.refresh')}
          title={t('admin.refresh')}
          disabled={isLoading}
          onClick={onRefresh}
        >
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
          aria-pressed={onlineOnly}
          onClick={onToggleOnline}
        >
          {t('admin.onlineOnly')}
        </button>
      </div>

      <p className="admin-list-note">{t('admin.latestUsersNote')}</p>

      <div className="admin-table-wrap" aria-busy={isLoading}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t('admin.table.user')}</th>
              <th>{t('admin.table.status')}</th>
              <th>{t('admin.table.accountStatus')}</th>
              <th>{t('admin.table.createdAt')}</th>
              <th>{t('admin.table.lastSeen')}</th>
              <th>{t('admin.table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && users.length === 0 ? (
              <tr>
                <td colSpan="6">{t('admin.table.loading')}</td>
              </tr>
            ) : null}
            {!isLoading && users.length === 0 ? (
              <tr>
                <td colSpan="6">{t('admin.table.empty')}</td>
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
                      <span>{t('admin.table.userId')}: {user.user_id}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`admin-presence ${user.online ? 'admin-presence-online' : ''}`}>
                    {user.online ? t('admin.online') : t('admin.offline')}
                  </span>
                </td>
                <td>
                  <span className={`admin-account-status ${user.disabled ? 'admin-account-status-disabled' : ''}`}>
                    {user.disabled ? t('admin.status.disabled') : t('admin.status.active')}
                  </span>
                </td>
                <td>{formatDateTime(user.created_at)}</td>
                <td>{formatDateTime(user.last_seen)}</td>
                <td>
                  <div className="admin-row-actions">
                    <button type="button" onClick={() => onUserAction(user.disabled ? 'enable' : 'disable', user)}>
                      {t(`admin.actions.${user.disabled ? 'enable' : 'disable'}`)}
                    </button>
                    <button type="button" onClick={() => onUserAction('logout', user)}>{t('admin.actions.logout')}</button>
                    <button type="button" className="admin-row-action-danger" onClick={() => onUserAction('delete', user)}>
                      {t('admin.actions.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination">
        <span>{t('admin.pagination.range', {
          start: total === 0 ? 0 : offset + 1,
          end: Math.min(offset + users.length, total),
          total,
        })}</span>
        <div>
          <button type="button" disabled={isLoading || offset === 0} onClick={onPreviousPage}>{t('admin.pagination.previous')}</button>
          <button type="button" disabled={isLoading || offset + pageSize >= total} onClick={onNextPage}>{t('admin.pagination.next')}</button>
        </div>
      </div>
    </section>
  )
}
