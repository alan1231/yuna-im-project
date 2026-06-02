import { useTranslation } from 'react-i18next'

export default function ChatHeader({ isConnected, room, onBack }) {
  const { t } = useTranslation()

  return (
    <header className="chat-header">
      <div className="chat-header-main">
        <button type="button" className="chat-back-button" aria-label={t('chat.backToRooms')} onClick={onBack}>
          ‹
        </button>
        <div>
          <p className="eyebrow">Direct Message</p>
          <h1>{room.name}</h1>
        </div>
      </div>
      <span className={`status ${isConnected ? 'status-connected' : ''}`}>
        {isConnected ? t('chat.connected') : t('chat.disconnected')}
      </span>
    </header>
  )
}
