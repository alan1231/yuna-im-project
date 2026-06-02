import { useTranslation } from 'react-i18next'
import AdminStats from './AdminStats.jsx'
import AdminUsersTable from './AdminUsersTable.jsx'
import { useAdminViewModel } from '../../hooks/useAdminViewModel'

export default function AdminConsole() {
  const { t } = useTranslation()
  const {
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
  } = useAdminViewModel()

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">Admin Console</p>
          <h1>{t('admin.consoleTitle')}</h1>
        </div>
        <form className="admin-token-form" onSubmit={saveToken}>
          <label>
            <span>Token</span>
            <input
              value={tokenInput}
              type="password"
              autoComplete="current-password"
              placeholder="ADMIN_TOKEN"
              onChange={(event) => setTokenInput(event.target.value)}
            />
          </label>
          <button type="submit">{t('admin.apply')}</button>
        </form>
      </header>

      {error ? <p className="admin-error">{error}</p> : null}

      <div className="admin-content">
        <AdminStats stats={stats} formatDateTime={formatDateTime} />
        <AdminUsersTable
          users={users}
          query={query}
          onlineOnly={onlineOnly}
          isLoading={isLoading}
          formatDateTime={formatDateTime}
          onSearch={updateQuery}
          onToggleOnline={toggleOnlineOnly}
          onRefresh={refresh}
        />
      </div>
    </main>
  )
}
