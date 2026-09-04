import { useTranslation } from 'react-i18next'
import AdminStats from './AdminStats.jsx'
import AdminAuditLog from './AdminAuditLog.jsx'
import AdminUserActionDialog from './AdminUserActionDialog.jsx'
import AdminUsersTable from './AdminUsersTable.jsx'
import { useAdminViewModel } from '../../hooks/useAdminViewModel'

export default function AdminConsole() {
  const { t } = useTranslation()
  const {
    stats,
    users,
    usersTotal,
    usersOffset,
    usersPageSize,
    auditLogs,
    query,
    onlineOnly,
    username,
    password,
    isLoggingIn,
    adminUsername,
    adminToken,
    isLoading,
    isRefreshing,
    error,
    selectedAction,
    confirmation,
    isSubmittingAction,
    formatDateTime,
    refresh,
    setUsername,
    setPassword,
    submitLogin,
    signOut,
    updateQuery,
    toggleOnlineOnly,
    previousUsersPage,
    nextUsersPage,
    openUserAction,
    closeUserAction,
    submitUserAction,
    setConfirmation,
  } = useAdminViewModel()

  const headerActions = adminToken ? (
    <>
      <span className="admin-identity">{adminUsername}</span>
      <button className="admin-header-button" type="button" onClick={refresh} disabled={isRefreshing}>
        {isRefreshing ? t('admin.refreshing') : t('admin.refresh')}
      </button>
      <button className="admin-header-button admin-header-button-secondary" type="button" onClick={signOut}>
        {t('admin.signOut')}
      </button>
    </>
  ) : null

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">{t('admin.consoleEyebrow')}</p>
          <h1>{t('admin.consoleTitle')}</h1>
        </div>
        <div className="admin-header-actions">{headerActions}</div>
      </header>

      {!adminToken ? (
        <section className="admin-section">
          <div className="admin-login-heading">
            <p className="eyebrow">{t('admin.loginEyebrow')}</p>
            <h2>{t('admin.loginTitle')}</h2>
            <p>{t('admin.loginHint')}</p>
          </div>
          <form className="admin-login-form" onSubmit={submitLogin}>
            <label>
              <span>{t('admin.username')}</span>
              <input
                value={username}
                required
                maxLength="64"
                autoComplete="username"
                placeholder={t('admin.usernamePlaceholder')}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label>
              <span>{t('admin.password')}</span>
              <input
                value={password}
                type="password"
                required
                minLength="8"
                maxLength="72"
                autoComplete="current-password"
                placeholder={t('admin.passwordHint')}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={isLoggingIn || !username.trim() || password.length < 8}
            >
              {isLoggingIn ? t('admin.working') : t('admin.signIn')}
            </button>
          </form>
          {error ? <p className="admin-error" role="alert">{error}</p> : null}
        </section>
      ) : null}

      {adminToken ? (
        <>
          {error ? <p className="admin-error" role="alert">{error}</p> : null}

          <div className="admin-content">
            <AdminStats stats={stats} formatDateTime={formatDateTime} />
            <AdminUsersTable
              users={users}
              total={usersTotal}
              offset={usersOffset}
              pageSize={usersPageSize}
              query={query}
              onlineOnly={onlineOnly}
              isLoading={isLoading}
              formatDateTime={formatDateTime}
              onSearch={updateQuery}
              onToggleOnline={toggleOnlineOnly}
              onRefresh={refresh}
              onPreviousPage={previousUsersPage}
              onNextPage={nextUsersPage}
              onUserAction={openUserAction}
            />
            <AdminAuditLog logs={auditLogs} formatDateTime={formatDateTime} />
          </div>
        </>
      ) : null}

      {selectedAction ? (
        <AdminUserActionDialog
          selectedAction={selectedAction}
          confirmation={confirmation}
          isSubmitting={isSubmittingAction}
          onConfirmationChange={setConfirmation}
          onConfirm={submitUserAction}
          onClose={closeUserAction}
        />
      ) : null}
    </main>
  )
}
