import { useState } from 'react'

export default function AccountSetup({
  isSubmitting,
  showWakeHint = false,
  error = '',
  onCreate,
  onLogin,
}) {
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
      <form className="account-panel" onSubmit={submit}>
        <p className="eyebrow">Account</p>
        <h1>{mode === 'login' ? '登入帳號' : '建立你的帳號'}</h1>
        <p className="account-copy">
          {mode === 'login'
            ? '輸入既有顯示名稱，回到你的聊天與股票機器人。'
            : '輸入一個尚未使用的顯示名稱後，就可以開始聊天。'}
        </p>

        <div className="account-mode-switch" role="tablist" aria-label="帳號模式">
          <button
            type="button"
            className={mode === 'login' ? 'account-mode-active' : ''}
            onClick={() => setMode('login')}
          >
            登入
          </button>
          <button
            type="button"
            className={mode === 'create' ? 'account-mode-active' : ''}
            onClick={() => setMode('create')}
          >
            建立
          </button>
        </div>

        <label className="account-field">
          <span>顯示名稱</span>
          <input
            value={displayName}
            type="text"
            maxLength="32"
            placeholder="例如 Yuna"
            autoComplete="nickname"
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>

        {error ? <p className="account-error">{error}</p> : null}
        {!error && showWakeHint ? (
          <p className="account-wake-hint">免費雲端服務正在喚醒，第一次連線可能需要稍等。</p>
        ) : null}

        <button type="submit" disabled={isSubmitting || !displayName.trim()}>
          {isSubmitting ? '處理中' : mode === 'login' ? '登入' : '建立帳號'}
        </button>
      </form>
    </main>
  )
}
