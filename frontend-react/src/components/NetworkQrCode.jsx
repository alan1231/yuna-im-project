import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export default function NetworkQrCode() {
  const [qrCode, setQrCode] = useState(null)
  const [isMobileVisible, setIsMobileVisible] = useState(false)

  useEffect(() => {
    const createQrCode = async () => {
      try {
        const response = await fetch('/__lan_url')
        const { url } = await response.json()
        const target = url || window.location.origin
        setQrCode({ target, image: await QRCode.toDataURL(target, { width: 128, margin: 2 }) })
      } catch {
        const target = window.location.origin
        setQrCode({ target, image: await QRCode.toDataURL(target, { width: 128, margin: 2 }) })
      }
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
          <strong>手機掃描開啟</strong>
          <img src={qrCode.image} alt="QR code for opening Neon Ghost on a phone" />
          <small>{qrCode.target}</small>
        </aside>
      </div>
    </>
  )
}
