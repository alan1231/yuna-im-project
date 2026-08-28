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
}) {
  const { t } = useTranslation()
  const isVisible = videoCall.status !== 'idle'

  const statusText =
    videoCall.status === 'incoming'
      ? t('chat.videoIncoming', { name: videoCall.peerName })
      : videoCall.status === 'calling'
        ? t('chat.videoCalling', { name: videoCall.peerName })
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
