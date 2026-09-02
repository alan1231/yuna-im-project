import { useTranslation } from 'react-i18next'

export default function VideoCallBar({
  videoCall,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleCamera,
  remoteVideoRef,
  localVideoRef,
  quality = 'unknown',
  onToggleScreenShare,
}) {
  const { t } = useTranslation()
  const isVisible = videoCall.status !== 'idle'

  const statusText =
    videoCall.status === 'incoming'
      ? t('chat.videoIncoming', { name: videoCall.peerName })
      : videoCall.status === 'calling'
        ? t('chat.videoCalling', { name: videoCall.peerName })
        : videoCall.status === 'reconnecting'
          ? t('chat.videoReconnecting', { name: videoCall.peerName })
        : t('chat.videoConnected', { name: videoCall.peerName })

  if (videoCall.status === 'incoming') {
    return (
      <div className="video-call-overlay is-active">
        <div className="incoming-call-card">
          <div className="incoming-call-heading">
            <h2>{t('chat.videoCall')}</h2>
            <span>Encrypted connection</span>
          </div>
          <img className="incoming-call-avatar" src="/neon-ghost-logo.png" alt="" />
          <div className="incoming-call-caller">
            <h3>{videoCall.peerName}</h3>
            <p>{statusText}</p>
          </div>
          <div className="incoming-call-actions">
            <button type="button" className="voice-end-button" onClick={onReject}>
              {t('chat.videoReject')}
            </button>
            <button type="button" className="voice-accept-button" onClick={onAccept}>
              {t('chat.videoAccept')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (videoCall.status === 'calling') {
    return (
      <div className="outgoing-call-overlay">
        <div className="outgoing-call-content">
          <div className="outgoing-call-avatar-wrap">
            <span className="outgoing-call-ring" />
            <img className="incoming-call-avatar" src="/neon-ghost-logo.png" alt="" />
          </div>
          <div className="outgoing-call-caller">
            <h1>{videoCall.peerName}</h1>
            <p>{statusText}</p>
          </div>
          <button type="button" className="outgoing-call-cancel" onClick={onEnd}>
            <span aria-hidden="true">×</span>
            {t('chat.videoEnd')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`video-call-overlay ${isVisible ? 'is-active' : ''}`}>
      <div className="video-call-panel">
        <div className="video-call-stage">
          <video ref={remoteVideoRef} className="video-call-remote" autoPlay playsInline />
          <video ref={localVideoRef} className="video-call-local" autoPlay playsInline muted />
        </div>
        <div className="video-call-info">
          <span>{t('chat.videoCall')}</span>
          <strong>{statusText}</strong>
          {videoCall.status === 'connected' ? <small className={`call-quality call-quality-${quality}`}>{t(`chat.callQuality.${quality}`)}</small> : null}
        </div>
        <div className="video-call-actions">
          <>
              {videoCall.status === 'connected' ? (
                <>
                  <button type="button" className="voice-secondary-button" onClick={onToggleMute}>
                    {videoCall.isMuted ? t('chat.videoUnmute') : t('chat.videoMute')}
                  </button>
                  <button type="button" className="voice-secondary-button" onClick={onToggleCamera}>
                    {videoCall.isCameraOn ? t('chat.videoCameraOff') : t('chat.videoCameraOn')}
                  </button>
                  <button type="button" className="voice-secondary-button" onClick={onToggleScreenShare}>
                    {videoCall.isScreenSharing ? t('chat.screenShareStop') : t('chat.screenShareStart')}
                  </button>
                </>
              ) : null}
              <button type="button" className="voice-end-button" onClick={onEnd}>
                {t('chat.videoEnd')}
              </button>
          </>
        </div>
      </div>
    </div>
  )
}
