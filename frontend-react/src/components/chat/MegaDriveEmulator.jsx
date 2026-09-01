import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const EMULATOR_DATA_PATH = 'https://cdn.emulatorjs.org/stable/data/'

export default function MegaDriveEmulator({ onClose }) {
  const { t } = useTranslation()
  const [romUrl, setRomUrl] = useState('')
  const [error, setError] = useState('')
  const blobUrlRef = useRef('')

  useEffect(() => () => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
  }, [])

  const loadRom = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!/\.(md|gen|bin)$/i.test(file.name)) {
      setError(t('chat.emulatorInvalidRom'))
      return
    }
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    const nextUrl = URL.createObjectURL(file)
    blobUrlRef.current = nextUrl
    setError('')
    setRomUrl(nextUrl)
  }

  useEffect(() => {
    if (!romUrl) return undefined

    window.EJS_player = '#emulatorjs-player'
    window.EJS_core = 'segaMD'
    window.EJS_gameUrl = romUrl
    window.EJS_pathtodata = EMULATOR_DATA_PATH
    const script = document.createElement('script')
    script.src = `${EMULATOR_DATA_PATH}loader.js`
    script.async = true
    document.body.appendChild(script)
    return () => script.remove()
  }, [romUrl])

  return (
    <div className="modal-backdrop emulator-backdrop" role="presentation">
      <section className="emulator-modal" role="dialog" aria-modal="true" aria-labelledby="emulator-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Mega Drive</p>
            <h3 id="emulator-title">{t('chat.emulatorTitle')}</h3>
          </div>
          <button type="button" className="modal-close" aria-label={t('chat.emulatorClose')} onClick={onClose}>×</button>
        </div>
        {!romUrl ? (
          <label className="emulator-file-picker">
            <span>{t('chat.emulatorChooseRom')}</span>
            <small>{t('chat.emulatorRomHint')}</small>
            <input type="file" accept=".md,.gen,.bin" onChange={loadRom} />
          </label>
        ) : (
          <div id="emulatorjs-player" className="emulator-player" />
        )}
        {error ? <p className="room-error">{error}</p> : null}
      </section>
    </div>
  )
}
