import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export default function AdminUserActionDialog({
  selectedAction,
  confirmation,
  isSubmitting,
  onConfirmationChange,
  onConfirm,
  onClose,
}) {
  const { t } = useTranslation()
  const { action, user } = selectedAction
  const isDelete = action === 'delete'
  const canConfirm = !isDelete || confirmation.trim() === user.user_id

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop admin-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="admin-action-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-action-title">
        <header className="modal-header">
          <div>
            <p className="eyebrow">{t('admin.actions.management')}</p>
            <h2 id="admin-action-title">{t(`admin.confirm.${action}Title`)}</h2>
          </div>
          <button className="modal-close" type="button" aria-label={t('admin.confirm.cancel')} disabled={isSubmitting} onClick={onClose}>×</button>
        </header>

        <p>{t(`admin.confirm.${action}Body`, { name: user.display_name })}</p>
        <div className="admin-dialog-user">
          <strong>{user.display_name}</strong>
          <span>User ID: {user.user_id}</span>
        </div>

        {isDelete ? (
          <label className="admin-confirm-field">
            <span>{t('admin.confirm.deleteInputLabel')}</span>
            <input
              autoFocus
              value={confirmation}
              placeholder={user.user_id}
              disabled={isSubmitting}
              onChange={(event) => onConfirmationChange(event.target.value)}
            />
          </label>
        ) : null}

        <div className="admin-dialog-actions">
          <button type="button" className="admin-action-button" disabled={isSubmitting} onClick={onClose}>
            {t('admin.confirm.cancel')}
          </button>
          <button
            autoFocus={!isDelete}
            type="button"
            className={`admin-action-button ${isDelete ? 'admin-action-button-danger' : 'admin-action-button-primary'}`}
            disabled={isSubmitting || !canConfirm}
            onClick={onConfirm}
          >
            {isSubmitting ? t('admin.actions.processing') : t('admin.confirm.confirm')}
          </button>
        </div>
      </section>
    </div>
  )
}
