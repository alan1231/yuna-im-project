import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const AVATAR_STYLES = ['personas', 'adventurer', 'avataaars', 'bottts', 'pixel-art', 'identicon']

const createAvatarUrl = (style, seed, background) => {
  const params = new URLSearchParams({ seed, backgroundColor: background.replace('#', '') })
  return `https://api.dicebear.com/9.x/${style}/svg?${params.toString()}`
}

export default function AvatarSettings({ currentUser, onSave, onClose }) {
  const { t } = useTranslation()
  const [style, setStyle] = useState(currentUser.avatarStyle || 'personas')
  const [seed, setSeed] = useState(currentUser.avatarSeed || currentUser.id)
  const [background, setBackground] = useState(currentUser.avatarBackground || '#71d8c8')
  const avatarUrl = createAvatarUrl(style, seed || currentUser.id, background)

  const randomize = () => setSeed(`${currentUser.id}-${Math.random().toString(36).slice(2, 8)}`)

  return (
    <div className="modal-backdrop" role="presentation" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className="avatar-settings-modal" role="dialog" aria-modal="true" aria-labelledby="avatar-settings-title">
        <div className="modal-header">
          <h3 id="avatar-settings-title">{t('chat.avatarSettings')}</h3>
          <button type="button" className="modal-close" aria-label={t('chat.avatarSettingsClose')} onClick={onClose}>×</button>
        </div>
        <div className="avatar-preview-wrap">
          <img src={avatarUrl} alt={t('chat.avatarPreview')} />
        </div>
        <label className="avatar-setting-label">
          <span>{t('chat.avatarStyle')}</span>
          <select value={style} onChange={(event) => setStyle(event.target.value)}>
            {AVATAR_STYLES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="avatar-setting-label">
          <span>{t('chat.avatarSeed')}</span>
          <input value={seed} maxLength="64" onChange={(event) => setSeed(event.target.value)} />
        </label>
        <label className="avatar-setting-label">
          <span>{t('chat.avatarBackground')}</span>
          <input className="avatar-color-input" type="color" value={background} onChange={(event) => setBackground(event.target.value)} />
        </label>
        <div className="avatar-settings-actions">
          <button type="button" className="avatar-random-button" onClick={randomize}>{t('chat.avatarRandomize')}</button>
          <button type="button" onClick={() => onSave({ avatarUrl, avatarStyle: style, avatarSeed: seed, avatarBackground: background })}>{t('chat.avatarApply')}</button>
        </div>
      </section>
    </div>
  )
}
