import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function AccountSetup({
  isSubmitting,
  showWakeHint = false,
  error = '',
  onCreate,
  onLogin,
}) {
  const { t } = useTranslation()
  const [displayName, setDisplayName] = useState('')
  const [mode, setMode] = useState('login')

  const submit = (event) => {
    event.preventDefault()
    const name = displayName.trim()
    if (!name) return

    if (mode === 'login') {
      onLogin(name)
      return
    }

    onCreate(name)
  }

  return (
    <main className="account-screen">
      <section className="account-entry" aria-label={t('account.brandName')}>
        <div className="account-brand">
          <p className="eyebrow">{t('account.eyebrow')}</p>
          <h1>{t('account.brandName')}</h1>
          <p>{t('account.brandCopy')}</p>
          <div className="account-feature-list" aria-label={t('account.featuresLabel')}>
            <span>{t('account.features.chat')}</span>
            <span>{t('account.features.market')}</span>
            <span>{t('account.features.realtime')}</span>
          </div>
        </div>

        <form className="account-panel" onSubmit={submit}>
          <div className="account-panel-heading">
            <span>{t('account.panelKicker')}</span>
            <h2>{t(`account.title.${mode}`)}</h2>
            <p className="account-copy">{t(`account.copy.${mode}`)}</p>
          </div>

          <div className="account-mode-switch" role="tablist" aria-label={t('account.modeLabel')}>
            <button
              type="button"
              className={mode === 'login' ? 'account-mode-active' : ''}
              onClick={() => setMode('login')}
            >
              {t('account.login')}
            </button>
            <button
              type="button"
              className={mode === 'create' ? 'account-mode-active' : ''}
              onClick={() => setMode('create')}
            >
              {t('account.create')}
            </button>
          </div>

          <label className="account-field">
            <span>{t('account.displayName')}</span>
            <input
              value={displayName}
              type="text"
              maxLength="32"
              placeholder={t('account.placeholder')}
              autoComplete="nickname"
              autoFocus
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>

          {error ? (
            <p className="account-message account-message-error">{error}</p>
          ) : null}
          {!error && showWakeHint ? (
            <p className="account-message account-message-info">{t('account.wakeHint')}</p>
          ) : null}

          <button className="account-submit" type="submit" disabled={isSubmitting || !displayName.trim()}>
            {isSubmitting
              ? t('account.submitting')
              : mode === 'login'
                ? t('account.login')
                : t('account.submitCreate')}
          </button>
        </form>
      </section>
    </main>
  )
}
