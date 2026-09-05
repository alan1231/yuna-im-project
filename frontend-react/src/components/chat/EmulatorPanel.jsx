import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

const bundledRomUrl = '/roms/mega-drive-game.md'

const systems = [
  { id: 'nes', label: 'NES / FC', extensions: '.nes,.zip' },
  { id: 'snes', label: 'SNES / SFC', extensions: '.sfc,.smc,.zip' },
  { id: 'gba', label: 'Game Boy Advance', extensions: '.gba,.zip' },
  { id: 'gb', label: 'Game Boy', extensions: '.gb,.gbc,.zip' },
  { id: 'segaMD', label: 'Mega Drive', extensions: '.md,.smd,.gen,.zip' },
]

const dataPath = 'https://cdn.emulatorjs.org/stable/data/'

function buildEmbedDocument(core, gameUrl) {
  const safe = (value) => JSON.stringify(value)
  return `<!doctype html>
<html><head><style>
html,body,#game{width:100%;height:100%;margin:0;background:#050b0d;overflow:hidden}
#game:fullscreen,.ejs_game:fullscreen,.ejs_canvas:fullscreen{width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;background:#050b0d}
.ejs_canvas:fullscreen{object-fit:fill!important}
</style></head>
<body><div id="game"></div><script>
window.EJS_player = '#game';
window.EJS_core = ${safe(core)};
window.EJS_pathtodata = ${safe(dataPath)};
window.EJS_gameUrl = ${safe(gameUrl)};
</script><script src="${dataPath}loader.js"></script></body></html>`
}

export default function EmulatorPanel({ onClose }) {
  const { t } = useTranslation()
  const [systemId, setSystemId] = useState('segaMD')
  const [rom, setRom] = useState(null)
  const [useBundledRom, setUseBundledRom] = useState(false)
  const [areControlsCollapsed, setAreControlsCollapsed] = useState(false)

  const system = systems.find((item) => item.id === systemId) || systems[0]
  const selectedRomUrl = useMemo(() => (rom ? URL.createObjectURL(rom) : ''), [rom])
  const romUrl = selectedRomUrl || (useBundledRom ? bundledRomUrl : '')

  useEffect(() => () => {
    if (selectedRomUrl) URL.revokeObjectURL(selectedRomUrl)
  }, [selectedRomUrl])

  return (
    <div className="modal-backdrop emulator-backdrop" role="dialog" aria-modal="true" aria-labelledby="emulator-title">
      <section className="emulator-modal">
        <header className="modal-header">
          <div>
            <p className="eyebrow">EmulatorJS</p>
            <h3 id="emulator-title">{t('chat.emulatorTitle')}</h3>
          </div>
          <div className="emulator-header-actions">
            <button
              type="button"
              className="emulator-controls-toggle"
              aria-expanded={!areControlsCollapsed}
              aria-controls="emulator-controls"
              onClick={() => setAreControlsCollapsed((current) => !current)}
            >
              {areControlsCollapsed ? t('chat.emulatorExpandControls') : t('chat.emulatorCollapseControls')}
              <span aria-hidden="true">{areControlsCollapsed ? '⌄' : '⌃'}</span>
            </button>
            <button type="button" className="modal-close" onClick={onClose} aria-label={t('chat.emulatorClose')}>×</button>
          </div>
        </header>

        <div id="emulator-controls" className={`emulator-controls ${areControlsCollapsed ? 'emulator-controls-collapsed' : ''}`}>
          <label>
            <span>{t('chat.emulatorSystem')}</span>
            <select value={systemId} onChange={(event) => { setSystemId(event.target.value); setRom(null); setUseBundledRom(false) }}>
              {systems.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="emulator-file-label">
            <span>{t('chat.emulatorRom')}</span>
            <input type="file" accept={system.extensions} onChange={(event) => { setRom(event.target.files?.[0] || null); setUseBundledRom(false) }} />
          </label>
          {systemId === 'segaMD' ? (
            <button type="button" className="emulator-load-button" onClick={() => { setRom(null); setUseBundledRom(true) }}>
              {t('chat.emulatorLoadBundled')}
            </button>
          ) : null}
        </div>

        <div className="emulator-stage">
          {romUrl ? (
            <iframe
              key={`${system.id}-${romUrl}`}
              className="emulator-frame"
              title={t('chat.emulatorTitle')}
              srcDoc={buildEmbedDocument(system.id, romUrl)}
              allow="fullscreen"
            />
          ) : (
            <div className="emulator-empty">{t('chat.emulatorChooseRom')}</div>
          )}
        </div>
        <p className="emulator-note">{t('chat.emulatorNote')}</p>
      </section>
    </div>
  )
}
