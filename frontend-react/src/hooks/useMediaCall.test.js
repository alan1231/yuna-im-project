// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useMediaCall } from './useMediaCall'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }))
let root, call, stop, close, socket, localRef, onError
const room = { id: 'peer', recipientId: 'peer', conversationId: 'dm:me:peer' }
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  stop = vi.fn()
  close = vi.fn()
  socket = { readyState: WebSocket.CLOSED, send: vi.fn() }
  localRef = { current: { srcObject: null } }
  onError = vi.fn()
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }),
  } })
  vi.stubGlobal('RTCPeerConnection', class {
    close = close
    addTrack = vi.fn()
    createOffer = vi.fn().mockResolvedValue({})
    createAnswer = vi.fn().mockResolvedValue({})
    setLocalDescription = vi.fn().mockResolvedValue()
    setRemoteDescription = vi.fn().mockResolvedValue()
  })
  vi.stubGlobal('RTCSessionDescription', class {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  function Harness() {
    call = useMediaCall({ media: 'video', currentUserId: 'me', getSocket: () => socket,
      getRooms: () => [room], getActiveRoom: () => room, remoteRef: { current: null }, localRef, onError })
    return null
  }
  root = createRoot(document.createElement('div'))
  await act(async () => root.render(createElement(Harness)))
})
afterEach(async () => {
  await act(async () => { call.cleanup(); root.unmount() })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each(['closed', 'throw'])('releases media when offer signaling is %s', async (mode) => {
  if (mode === 'throw') {
    socket.readyState = WebSocket.OPEN
    socket.send.mockImplementation(() => { throw new Error('closed during send') })
  }
  await act(async () => call.startCall())
  expect(stop).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
  expect(localRef.current.srcObject).toBeNull()
  expect(call.call.status).toBe('idle')
  expect(onError).toHaveBeenCalledOnce()
})

it('releases media when answer signaling fails', async () => {
  await act(async () => call.handleSignal('video_offer', { sender_id: 'peer', offer: {} }))
  await act(async () => call.acceptCall())
  expect(stop).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
  expect(call.call.status).toBe('idle')
})

it('stops media acquired after cleanup without resurrecting the call', async () => {
  let resolve
  navigator.mediaDevices.getUserMedia.mockImplementation(() => new Promise((done) => { resolve = done }))
  let pending
  await act(async () => { pending = call.startCall() })
  await act(async () => call.cleanup())
  await act(async () => { resolve({ getTracks: () => [{ stop }] }); await pending })
  expect(stop).toHaveBeenCalledOnce()
  expect(socket.send).not.toHaveBeenCalled()
  expect(call.call.status).toBe('idle')
})
