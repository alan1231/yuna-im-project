import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import NetworkQrCode from '../NetworkQrCode.jsx'

type AccountMode = 'login' | 'create'

type AccountSetupProps = {
  isSubmitting: boolean
  showWakeHint?: boolean
  error?: string
  onCreate: (displayName: string, password: string) => void
  onLogin: (displayName: string, password: string) => void
}

const accountSchema = z.object({
  displayName: z.string().trim().min(1).max(32),
  password: z.string().refine((value) => {
    const bytes = new TextEncoder().encode(value).length
    return bytes >= 8 && bytes <= 72
  }),
})

type AccountFormValues = z.infer<typeof accountSchema>

export default function AccountSetup({
  isSubmitting,
  showWakeHint = false,
  error = '',
  onCreate,
  onLogin,
}: AccountSetupProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<AccountMode>('login')
  const {
    formState: { errors },
    handleSubmit,
    register,
    watch,
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      displayName: '',
      password: '',
    },
  })
  const displayName = watch('displayName')

  const password = watch('password')

  const submit = handleSubmit(({ displayName: rawDisplayName, password }) => {
    const name = rawDisplayName.trim()
    if (mode === 'login') {
      onLogin(name, password)
      return
    }

    onCreate(name, password)
  })

  return (
    <main className="account-screen">
      <section className="account-entry" aria-label={t('account.brandName')}>
        <div className="account-brand">
          <NetworkQrCode />
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
              {...register('displayName')}
              type="text"
              maxLength={32}
              placeholder={t('account.placeholder')}
              autoComplete="nickname"
              autoFocus
            />
          </label>

          <label className="account-field">
            <span>{t('account.password')}</span>
            <input
              {...register('password')}
              type="password"
              maxLength={72}
              placeholder={t('account.passwordPlaceholder')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {errors.displayName ? (
            <p className="account-message account-message-error">{t('account.errors.displayNameRequired')}</p>
          ) : null}
          {errors.password ? (
            <p className="account-message account-message-error">{t('account.errors.passwordInvalid')}</p>
          ) : null}
          {error ? <p className="account-message account-message-error">{error}</p> : null}
          {!error && showWakeHint ? (
            <p className="account-message account-message-info">{t('account.wakeHint')}</p>
          ) : null}

          <button className="account-submit" type="submit" disabled={isSubmitting || !displayName?.trim() || !password}>
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
