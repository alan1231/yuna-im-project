import { useTranslation } from 'react-i18next'
import type { ChatRoom } from '../../types/chat'

type ChatHeaderProps = {
  isConnected: boolean
  room: ChatRoom
  memberNames?: string[]
  canStartVoiceCall?: boolean
  canStartVideoCall?: boolean
  onBack: () => void
  onLeaveGroup: () => void
  onStartVoiceCall: () => void
  onStartVideoCall: () => void
}

export default function ChatHeader({
  isConnected,
  room,
  memberNames = [],
  canStartVoiceCall = false,
  canStartVideoCall = false,
  onBack,
  onLeaveGroup,
  onStartVoiceCall,
  onStartVideoCall,
}: ChatHeaderProps) {
  const { t } = useTranslation()
  const isGroup = Boolean(room.isGroup)
  const eyebrow = isGroup ? t('chat.groupChat') : t('chat.directMessage')
  const memberSummary = isGroup ? memberNames.join(', ') : ''

  return (
    <header className="chat-header">
      <div className="chat-header-main">
        <button type="button" className="chat-back-button" aria-label={t('chat.backToRooms')} onClick={onBack}>
          ‹
        </button>
        <div className="chat-title-block">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{room.name}</h1>
          {isGroup && memberSummary ? (
            <p className="chat-subtitle">{t('chat.groupMemberList', { members: memberSummary })}</p>
          ) : null}
        </div>
      </div>
      <div className="chat-header-actions">
        {canStartVoiceCall ? (
          <button type="button" className="voice-call-button" onClick={onStartVoiceCall}>
            {t('chat.voiceCall')}
          </button>
        ) : null}
        {canStartVideoCall ? (
          <button type="button" className="video-call-button" onClick={onStartVideoCall}>
            {t('chat.videoCall')}
          </button>
        ) : null}
        {isGroup ? (
          <button type="button" className="leave-group-button" onClick={onLeaveGroup}>
            {t('chat.leaveGroup')}
          </button>
        ) : null}
        <span className={`status ${isConnected ? 'status-connected' : ''}`}>
          {isConnected ? t('chat.connected') : t('chat.disconnected')}
        </span>
      </div>
    </header>
  )
}
