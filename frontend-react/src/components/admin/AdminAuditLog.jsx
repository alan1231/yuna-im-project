import { useTranslation } from 'react-i18next'

export default function AdminAuditLog({ logs = [], formatDateTime }) {
  const { t } = useTranslation()

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <div>
          <p className="eyebrow">{t('admin.audit.eyebrow')}</p>
          <h2>{t('admin.audit.title')}</h2>
        </div>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table admin-audit-table">
          <thead>
            <tr>
              <th>{t('admin.audit.time')}</th>
              <th>{t('admin.audit.admin')}</th>
              <th>{t('admin.audit.action')}</th>
              <th>{t('admin.audit.target')}</th>
              <th>{t('admin.audit.result')}</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan="5">{t('admin.audit.empty')}</td></tr>
            ) : logs.map((log) => (
              <tr key={`${log.created_at}-${log.action}-${log.target_user_id}`}>
                <td>{formatDateTime(log.created_at)}</td>
                <td>{log.admin_username}</td>
                <td>{t(`admin.audit.actions.${log.action}`, { defaultValue: log.action })}</td>
                <td>{log.target_name || log.target_user_id}</td>
                <td>{t(`admin.audit.results.${log.result}`, { defaultValue: log.result })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
