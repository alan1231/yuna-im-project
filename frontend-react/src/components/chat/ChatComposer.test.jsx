// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ChatComposer from './ChatComposer'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }))
let root, container, props, readers, images, exports
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  props = { value: 'draft', canSend: true, onChange: vi.fn(), onSend: vi.fn(), onAttachFile: vi.fn() }
  readers = []; images = []; exports = []
  vi.stubGlobal('FileReader', class {
    constructor() { readers.push(this) }
    readAsDataURL() {}
  })
  vi.stubGlobal('Image', class {
    width = 2000; height = 2000
    constructor() { images.push(this) }
  })
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() })
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => exports.push(callback))
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const render = async (room = 'a') => act(async () => root.render(<ChatComposer key={room} {...props} />))
const event = async (type, init = {}) => act(async () => {
  const textarea = container.querySelector('textarea')
  textarea.dispatchEvent(type.startsWith('composition')
    ? new CompositionEvent(type, { bubbles: true })
    : new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }))
})
const pick = async (large = false) => act(async () => {
  const input = container.querySelector('input')
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(
    [large ? new Uint8Array(2 * 1024 * 1024 + 1) : 'text'], 'test.png', { type: 'image/png' },
  )] })
  input.dispatchEvent(new Event('change', { bubbles: true }))
})
const finishRead = async (index = 0) => act(async () => {
  readers[index].result = 'data:image/png;base64,test'
  readers[index].onload()
})

it('does not submit composition Enter, Safari confirmation, or keyCode 229; normal Enter still sends', async () => {
  let now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  await render()
  await event('compositionstart')
  await event('keydown', { key: 'Enter' })
  await event('compositionend')
  await event('keydown', { key: 'Enter' })
  now += 200
  await event('keydown', { key: 'Enter', keyCode: 229 })
  await event('keydown', { key: 'Enter', isComposing: true })
  await event('keydown', { key: 'Enter', shiftKey: true })
  expect(props.onSend).not.toHaveBeenCalled()
  await event('keydown', { key: 'Enter' })
  expect(props.onSend).toHaveBeenCalledTimes(1)
})

it('ignores room A FileReader completion after switching to B and back to A', async () => {
  await render(); await pick()
  await render('b'); await render('a')
  await finishRead()
  expect(props.onAttachFile).not.toHaveBeenCalled()
  await pick(); await finishRead(1)
  expect(props.onAttachFile).toHaveBeenCalledTimes(1)
})

it('ignores compression completion after switching rooms and leaves B usable', async () => {
  await render(); await pick(true)
  await act(async () => images[0].onload())
  await render('b')
  await act(async () => exports[0](new Blob(['compressed'], { type: 'image/jpeg' })))
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  expect(readers).toHaveLength(0)
  expect(props.onAttachFile).not.toHaveBeenCalled()
  expect(container.querySelector('.composer-status')).toBeNull()
  expect(container.querySelector('button[type="submit"]').disabled).toBe(false)
})

it('ignores readers after unmount and superseded file selections', async () => {
  await render(); await pick(); await pick()
  await finishRead(0)
  expect(props.onAttachFile).not.toHaveBeenCalled()
  await act(async () => root.render(null))
  await finishRead(1)
  expect(props.onAttachFile).not.toHaveBeenCalled()
})
