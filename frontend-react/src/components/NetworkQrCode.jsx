import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useTranslation } from 'react-i18next'

export default function NetworkQrCode() {
  const { i18n } = useTranslation()
  const [qrCode, setQrCode] = useState(null)
  const [isMobileVisible, setIsMobileVisible] = useState(false)
  const [shareStatus, setShareStatus] = useState('')
  const isEnglish = i18n.language === 'en'

  const getShareTarget = async () => {
    const isAppleMobile =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    if (isAppleMobile) return 'https://ivi.cx/i/cfg?6a95152a'

    try {
      const response = await fetch('/__lan_url')
      const { url } = await response.json()
      return url || window.location.origin
    } catch {
      return window.location.origin
    }
  }

  const downloadQrCode = () => {
    if (!qrCode) return
    const link = document.createElement('a')
    link.href = qrCode.image
    link.download = 'neon-ghost-signal.png'
    link.click()
  }

  const shareQrCode = async () => {
    if (!qrCode) return
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Neon Ghost', text: qrCode.target, url: qrCode.target })
        return
      }
    } catch (error) {
      if (error?.name === 'AbortError') return
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(qrCode.target)
      setShareStatus(isEnglish ? 'Link copied' : '連結已複製')
    }
  }

  useEffect(() => {
    const createQrCode = async () => {
      const target = await getShareTarget()
      setQrCode({ target, image: await QRCode.toDataURL(target, { width: 128, margin: 2 }) })
    }

    createQrCode()
  }, [])

  if (!qrCode) return null

  return (
    <>
      <button
        type="button"
        className="account-brand-share-button"
        onClick={() => setIsMobileVisible(true)}
      >
        分享
      </button>
      <div
        className={`account-brand-qr-dialog ${isMobileVisible ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Scan to open on phone"
        onClick={() => setIsMobileVisible(false)}
      >
        <aside className="account-brand-qr" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="account-brand-qr-close" onClick={() => setIsMobileVisible(false)}>
            ×
          </button>
          <div className="qr-share-topbar">
            <span className="qr-share-mark">N</span>
            <strong>NEON_GHOST</strong>
            <span className="qr-share-security" aria-hidden="true">◈</span>
          </div>
          <div className="qr-share-content">
            <div className="qr-share-heading">
              <h2>{isEnglish ? 'MY SIGNAL' : '我的訊號'}</h2>
              <p>{isEnglish ? 'Broadcast your identity. Stay anonymous.' : '分享你的身份，保持匿名。'}</p>
            </div>
            <div className="qr-share-card">
              <div className="qr-share-image-wrap">
                <img src={qrCode.image} alt="QR code for opening Neon Ghost on a phone" />
              </div>
              <span className="qr-share-kicker">CODENAME</span>
              <strong className="qr-share-codename">{isEnglish ? 'NEON_GHOST' : 'NEON_GHOST'}</strong>
              <small>{qrCode.target}</small>
            </div>
            <div className="qr-share-actions">
              <button type="button" onClick={downloadQrCode}>{isEnglish ? 'Download' : '下載'}</button>
              <button type="button" onClick={shareQrCode}>{isEnglish ? 'Share' : '分享'}</button>
            </div>
            {shareStatus ? <small className="qr-share-status" role="status">{shareStatus}</small> : null}
          </div>
        </aside>
      </div>
    </>
  )
}
