// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as api from '../api/chatApi'
import { useChatViewModel } from './useChatViewModel'

const { t } = vi.hoisted(() => ({ t: (key) => key }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }))
vi.mock('../api/chatApi', async (original) => {
  const actual = await original()
  return { ...actual, fetchUsers: vi.fn(), fetchFriends: vi.fn(), fetchGroups: vi.fn(),
    fetchConversations: vi.fn(), fetchMessages: vi.fn(), createWebSocketTicket: vi.fn() }
})
let root, model, sockets, queryClient
const user = { id: 'me', displayName: 'Me', token: 'token' }
const message = (text, time, peer = 'a') => ({ sender_id: peer, recipient_id: 'me',
  conversation_id: `dm:${peer}:me`, text, time: `2026-09-01T00:00:${time}.000Z` })
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  sockets = []
  vi.stubGlobal('WebSocket', class {
    static OPEN = 1
    static CONNECTING = 0
    static CLOSED = 3
    readyState = 0
    send = vi.fn()
    close() { this.readyState = 3; this.onclose?.() }
    constructor() { sockets.push(this) }
  })
  api.fetchUsers.mockResolvedValue([])
  api.fetchFriends.mockResolvedValue(['a', 'b'].map((id) => ({ friend_id: id, display_name: id })))
  api.fetchGroups.mockResolvedValue([])
  api.fetchConversations.mockResolvedValue([])
  api.fetchMessages.mockResolvedValue([message('old', '01')])
  api.createWebSocketTicket.mockResolvedValue({ ticket: 'ticket' })
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  function Harness() { model = useChatViewModel(user); return null }
  root = createRoot(document.createElement('div'))
  await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Harness))))
})
afterEach(async () => {
  await act(async () => root.unmount())
  queryClient.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
const open = async (socket) => act(async () => { socket.readyState = WebSocket.OPEN; socket.onopen() })

it('pins the initial room while incoming messages reorder rooms and a draft is being typed', async () => {
  await open(sockets[0])
  expect(model.activeRoomId).toBe('a')
  await act(async () => model.setUserInput('draft for a'))
  await act(async () => sockets[0].onmessage({ data: JSON.stringify({ type: 'message', payload: message('new', '05', 'b') }) }))
  expect(model.rooms[0].id).toBe('b')
  expect(model.activeRoom.id).toBe('a')
  expect(model.userInput).toBe('draft for a')
  await act(async () => model.sendMessage())
  expect(JSON.parse(sockets[0].send.mock.calls.at(-1)[0]).recipient_id).toBe('a')
})

it('rejects an old room attachment callback even before the room switch renders', async () => {
  const attachInA = model.attachFile
  await act(async () => {
    model.selectRoom('b')
    attachInA({ url: 'data:old', name: 'a.png' })
  })
  expect(model.fileAttachment).toBeNull()
  await act(async () => model.attachFile({ url: 'data:new', name: 'b.png' }))
  expect(model.fileAttachment.name).toBe('b.png')
})

it('backfills reconnect history, merges live messages chronologically and invalidates inactive rooms', async () => {
  await open(sockets[0])
  await act(async () => model.selectRoom('b'))
  await act(async () => model.selectRoom('a'))
  sockets[0].readyState = WebSocket.CLOSED
  await act(async () => model.sendMessage('queued'))
  let resolveHistory
  api.fetchMessages.mockImplementation(({ conversationId }) => conversationId === 'dm:a:me'
    ? new Promise((resolve) => { resolveHistory = resolve }) : Promise.resolve([]))
  await open(sockets[1])
  expect(api.fetchConversations).toHaveBeenCalledTimes(3)
  await act(async () => sockets[1].onmessage({ data: JSON.stringify({ type: 'message', payload: message('live', '04') }) }))
  await act(async () => resolveHistory([message('old', '01'), message('missed', '02'), message('live', '04')]))
  expect(model.messages.map((item) => item.text)).toEqual(['old', 'missed', 'live'])
  expect(model.activeRoom.lastMessage).toBe('live')
  api.fetchMessages.mockClear()
  await act(async () => model.selectRoom('b'))
  expect(api.fetchMessages).toHaveBeenCalledWith({ userId: 'me', conversationId: 'dm:b:me' })
})

it('does not retry a terminal ticket 401, including manual reconnect attempts', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  api.createWebSocketTicket.mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }))
  sockets[0].readyState = WebSocket.CLOSED
  await act(async () => model.sendMessage('queued'))
  const attempts = api.createWebSocketTicket.mock.calls.length
  await act(async () => model.sendMessage('retry'))
  expect(api.createWebSocketTicket).toHaveBeenCalledTimes(attempts)
  expect(model.isConnected).toBe(false)
})

it('ignores a history response from before reconnect', async () => {
  await open(sockets[0])
  let resolveOld
  api.fetchMessages.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
  await act(async () => model.selectRoom('b'))
  sockets[0].readyState = WebSocket.CLOSED
  await act(async () => model.sendMessage('queued'))
  api.fetchMessages.mockResolvedValue([message('fresh', '03', 'b')])
  await open(sockets[1])
  await act(async () => resolveOld([message('stale', '02', 'b')]))
  expect(model.messages.map((item) => item.text)).toEqual(['fresh'])
})
