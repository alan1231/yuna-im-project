import { useTranslation } from 'react-i18next'

export default function VoiceCallBar({
  voiceCall,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  remoteAudioRef,
}) {
  const { t } = useTranslation()
  const isVisible = voiceCall.status !== 'idle'
  if (!isVisible) {
    return <audio ref={remoteAudioRef} autoPlay playsInline />
  }

  const statusText =
    voiceCall.status === 'incoming'
      ? t('chat.voiceIncoming', { name: voiceCall.peerName })
      : voiceCall.status === 'calling'
        ? t('chat.voiceCalling', { name: voiceCall.peerName })
        : t('chat.voiceConnected', { name: voiceCall.peerName })

  if (voiceCall.status === 'incoming') {
    return (
      <div className="incoming-call-overlay">
        <div className="incoming-call-card">
          <div className="incoming-call-heading">
            <h2>{t('chat.voiceCall')}</h2>
            <span>Encrypted connection</span>
          </div>
          <img className="incoming-call-avatar" src="/neon-ghost-logo.png" alt="" />
          <div className="incoming-call-caller">
            <h3>{voiceCall.peerName}</h3>
            <p>{statusText}</p>
          </div>
          <audio ref={remoteAudioRef} autoPlay playsInline />
          <div className="incoming-call-actions">
            <button type="button" className="voice-end-button" onClick={onReject}>
              {t('chat.voiceReject')}
            </button>
            <button type="button" className="voice-accept-button" onClick={onAccept}>
              {t('chat.voiceAccept')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (voiceCall.status === 'calling') {
    return (
      <div className="outgoing-call-overlay">
        <div className="outgoing-call-content">
          <div className="outgoing-call-avatar-wrap">
            <span className="outgoing-call-ring" />
            <img className="incoming-call-avatar" src="/neon-ghost-logo.png" alt="" />
          </div>
          <div className="outgoing-call-caller">
            <h1>{voiceCall.peerName}</h1>
            <p>{statusText}</p>
          </div>
          <audio ref={remoteAudioRef} autoPlay playsInline />
          <button type="button" className="outgoing-call-cancel" onClick={onEnd}>
            <span aria-hidden="true">×</span>
            {t('chat.voiceEnd')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="voice-call-bar">
      <audio ref={remoteAudioRef} autoPlay playsInline />
      <div className="voice-call-text">
        <span>{t('chat.voiceCall')}</span>
        <strong>{statusText}</strong>
      </div>
      <div className="voice-call-actions">
        <>
            {voiceCall.status === 'connected' ? (
              <button type="button" className="voice-secondary-button" onClick={onToggleMute}>
                {voiceCall.isMuted ? t('chat.voiceUnmute') : t('chat.voiceMute')}
              </button>
            ) : null}
            <button type="button" className="voice-end-button" onClick={onEnd}>
              {t('chat.voiceEnd')}
            </button>
        </>
      </div>
    </div>
  )
}
