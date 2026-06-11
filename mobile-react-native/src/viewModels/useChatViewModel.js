import {
  errorCodes as documentPickerErrorCodes,
  isErrorWithCode as isDocumentPickerErrorWithCode,
  keepLocalCopy,
  pick,
  types as documentPickerTypes,
} from '@react-native-documents/picker'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { maxCachedMessagesPerConversation, stockBotId, stockBotName } from '../config/runtime'
import {
  conversationIdFor,
  mergeRoom,
  messageKey,
  normalizeMessage,
  sortRooms,
  upsertRoom,
} from '../models/chat'
import {
  addFriend,
  createGroup,
  createUser,
  deleteFriend,
  leaveGroup,
  loadConversations,
  loadFriendRequests,
  loadFriends,
  loadGroups,
  loadMessages,
  loadUsers,
  loginByDisplayName,
  respondFriendRequest,
  wakeBackend,
} from '../services/chatApi'
import { clearProfile, restoreProfile, saveProfile } from '../services/profileStore'
import {
  maxAttachmentBytes,
  prepareAttachment,
  shareAttachment,
} from '../services/attachmentService'
import {
  closeRealtime,
  connectRealtime,
  sendActiveConversation,
  sendRealtimeMessage,
} from '../services/realtimeService'

const stockBotPendingId = 'stock-bot-pending'
const reconnectBackoffMs = [1000, 2000, 5000, 8000]
const socketConnectTimeoutMs = 8000
const maxReconnectAttempts = 4

function createStockRoom(profile) {
  return {
    id: stockBotId,
    name: stockBotName,
    recipientId: stockBotId,
    conversationId: conversationIdFor(profile.id, stockBotId),
    isFriend: false,
    isGroup: false,
    online: true,
    lastMessage: '',
    unreadCount: 0,
  }
}

export function useChatViewModel() {
  const [profile, setProfile] = useState(null)
  const [isRestoring, setIsRestoring] = useState(true)
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false)
  const [isLoadingChat, setIsLoadingChat] = useState(false)
  const [isWakingBackend, setIsWakingBackend] = useState(false)
  const [rooms, setRooms] = useState([])
  const [availableUsers, setAvailableUsers] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  const [activeRoomId, setActiveRoomId] = useState('')
  const [mobileView, setMobileView] = useState('rooms')
  const [messagesByConversation, setMessagesByConversation] = useState({})
  const [loadedConversationIds, setLoadedConversationIds] = useState(new Set())
  const [isConnected, setIsConnected] = useState(false)
  const [attachment, setAttachment] = useState(null)
  const [isPreparingAttachment, setIsPreparingAttachment] = useState(false)
  const [connectionState, setConnectionState] = useState('idle')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [accountError, setAccountError] = useState('')
  const [roomError, setRoomError] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const socketRef = useRef(null)
  const connectSocketRef = useRef(null)
  const activeRoomIdRef = useRef('')
  const eventHandlerRef = useRef(null)
  const loadedConversationIdsRef = useRef(new Set())
  const profileRef = useRef(null)
  const roomsRef = useRef([])
  const reconnectTimerRef = useRef(null)
  const shouldReconnectRef = useRef(true)
  const isWakingBackendRef = useRef(false)
  const reconnectAttemptRef = useRef(0)
  const socketTokenRef = useRef(0)
  const socketConnectTimerRef = useRef(null)

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) || rooms[0] || null,
    [activeRoomId, rooms],
  )
  const activeMessages = activeRoom
    ? messagesByConversation[activeRoom.conversationId] || []
    : []
  const isStockBotPending =
    activeRoom?.id === stockBotId &&
    activeMessages.some((message) => message.isPending)

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId
  }, [activeRoomId])

  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  useEffect(() => {
    isWakingBackendRef.current = isWakingBackend
  }, [isWakingBackend])

  useEffect(() => {
    roomsRef.current = rooms
  }, [rooms])

  useEffect(() => {
    loadedConversationIdsRef.current = loadedConversationIds
  }, [loadedConversationIds])

  useEffect(() => {
    reconnectAttemptRef.current = reconnectAttempt
  }, [reconnectAttempt])

  const loadMessagesForRoom = useCallback(async (currentProfile, room) => {
    if (!room?.conversationId) return
    if (loadedConversationIdsRef.current.has(room.conversationId)) return

    try {
      const messages = await loadMessages(currentProfile, room)
      setMessagesByConversation((current) => ({
        ...current,
        [room.conversationId]: messages,
      }))
      setLoadedConversationIds((current) => {
        const next = new Set(current)
        next.add(room.conversationId)
        return next
      })
    } catch {
      setRoomError('訊息載入失敗。')
    }
  }, [])

  const appendMessage = useCallback((message, currentUserId) => {
    setMessagesByConversation((current) => {
      let existing = current[message.conversationId] || []
      if (message.senderId === stockBotId) {
        existing = existing.filter((item) => item.pendingId !== stockBotPendingId)
      }
      const key = messageKey(message)
      if (existing.some((item) => messageKey(item) === key)) return current

      const nextMessages = [...existing, message].slice(
        -maxCachedMessagesPerConversation,
      )
      return { ...current, [message.conversationId]: nextMessages }
    })

    setRooms((current) =>
      sortRooms(
        current.map((room) => {
          if (room.conversationId !== message.conversationId) return room
          return {
            ...room,
            lastMessage:
              message.text ||
              (message.attachmentUrl ? '已傳送檔案' : '已傳送訊息'),
            lastMessageAt: message.sentAt,
            lastMessageIsSelf: message.senderId === currentUserId,
            lastMessageReadAt: message.readAt || room.lastMessageReadAt,
            unreadCount:
              room.id === activeRoomIdRef.current ||
              message.senderId === currentUserId
                ? 0
                : room.unreadCount + 1,
          }
        }),
        stockBotId,
      ),
    )
  }, [])

  const applyReadReceipt = useCallback((message) => {
    if (!message.readAt) return

    setMessagesByConversation((current) => ({
      ...current,
      [message.conversationId]: (current[message.conversationId] || []).map((item) => {
        const sameMessage =
          item.senderId === message.senderId &&
          item.recipientId === message.recipientId &&
          item.sentAt.getTime() === message.sentAt.getTime() &&
          item.text === message.text &&
          item.attachmentName === message.attachmentName
        return sameMessage ? { ...item, readAt: message.readAt } : item
      }),
    }))

    setRooms((current) =>
      current.map((room) => {
        if (room.conversationId !== message.conversationId) return room
        if (!room.lastMessageIsSelf) return room
        return {
          ...room,
          lastMessageReadAt: message.readAt,
        }
      }),
    )
  }, [])

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const clearSocketConnectTimer = useCallback(() => {
    if (socketConnectTimerRef.current) {
      clearTimeout(socketConnectTimerRef.current)
      socketConnectTimerRef.current = null
    }
  }, [])

  const getReconnectRoom = useCallback(() => {
    const currentRooms = roomsRef.current
    const activeRoom =
      currentRooms.find((room) => room.id === activeRoomIdRef.current) || currentRooms[0]
    return activeRoom || (profileRef.current ? createStockRoom(profileRef.current) : null)
  }, [])

  const disconnectSocket = useCallback(({ allowReconnect = false } = {}) => {
    shouldReconnectRef.current = allowReconnect
    socketTokenRef.current += 1
    clearReconnectTimer()
    clearSocketConnectTimer()
    closeRealtime(socketRef)
  }, [clearReconnectTimer, clearSocketConnectTimer])

  const scheduleReconnect = useCallback((reason = '即時連線中斷，正在重新連線。') => {
    if (!profileRef.current || isWakingBackendRef.current) return
    if (reconnectTimerRef.current) return

    setIsConnected(false)
    setConnectionState('reconnecting')
    setReconnectAttempt((currentAttempt) => {
      if (currentAttempt >= maxReconnectAttempts) {
        setConnectionState('disconnected')
        setConnectionError('即時連線暫時中斷。請按「喚醒後端」重新建立連線。')
        return currentAttempt
      }

      const nextAttempt = currentAttempt + 1
      const delay =
        reconnectBackoffMs[Math.min(nextAttempt - 1, reconnectBackoffMs.length - 1)]
      setConnectionError(`${reason} 將在 ${Math.round(delay / 1000)} 秒後重試。`)

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null
        const currentProfile = profileRef.current
        const room = getReconnectRoom()
        if (!currentProfile || !room) return
        connectSocketRef.current?.(currentProfile, room)
      }, delay)

      return nextAttempt
    })
  }, [getReconnectRoom])

  const connectSocket = useCallback((currentProfile, room) => {
    shouldReconnectRef.current = false
    clearReconnectTimer()
    clearSocketConnectTimer()
    closeRealtime(socketRef)
    shouldReconnectRef.current = true
    const socketToken = socketTokenRef.current + 1
    socketTokenRef.current = socketToken
    setConnectionState(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting')

    try {
      const socket = connectRealtime({
        profile: currentProfile,
        room,
        onEvent: (...args) => eventHandlerRef.current?.(...args),
        onOpen: ({ url }) => {
          if (socketTokenRef.current !== socketToken) return
          clearSocketConnectTimer()
          if (__DEV__) console.log('[YunaIM socket] open', url)
          setIsConnected(true)
          setConnectionState('connected')
          setReconnectAttempt(0)
          setConnectionError('')
          sendActiveConversation(socket, room.conversationId)
        },
        onClose: ({ url, code, reason, wasClean }) => {
          if (socketTokenRef.current !== socketToken) return
          clearSocketConnectTimer()
          if (__DEV__) {
            console.log('[YunaIM socket] close', {
              url,
              code,
              reason,
              wasClean,
            })
          }
          setIsConnected(false)
          setConnectionState(shouldReconnectRef.current ? 'disconnected' : 'idle')
          if (shouldReconnectRef.current) {
            const closeCodeText = code ? `（code ${code}）` : ''
            setConnectionError(`即時連線已中斷${closeCodeText}。請按「喚醒後端」重新建立連線。`)
          }
        },
        onError: ({ url, reason }) => {
          if (socketTokenRef.current !== socketToken) return
          clearSocketConnectTimer()
          if (__DEV__) console.log('[YunaIM socket] error', { url, reason })
          setIsConnected(false)
          setConnectionState('disconnected')
          setConnectionError('即時連線失敗。請按「喚醒後端」重新建立連線。')
        },
      })
      socketRef.current = socket
      socketConnectTimerRef.current = setTimeout(() => {
        if (socketTokenRef.current !== socketToken) return
        if (socket.readyState === WebSocket.OPEN) return
        if (__DEV__) console.log('[YunaIM socket] timeout', { room: room.conversationId })
        setIsConnected(false)
        setConnectionState('disconnected')
        setConnectionError('即時連線逾時。請按「喚醒後端」重新建立連線。')
        closeRealtime(socketRef)
      }, socketConnectTimeoutMs)
    } catch {
      clearSocketConnectTimer()
      scheduleReconnect('WebSocket 連線失敗，正在重新連線。')
      setIsConnected(false)
    }
  }, [clearReconnectTimer, clearSocketConnectTimer, scheduleReconnect])

  connectSocketRef.current = connectSocket

  const loadInitialChat = useCallback(
    async (currentProfile, options = {}) => {
      const { resetView = true, reconnectSocket = true } = options
      const stockRoom = createStockRoom(currentProfile)

      setIsLoadingChat(true)
      setRoomError('')
      if (resetView) {
        setRooms([stockRoom])
        setActiveRoomId(stockRoom.id)
        setMobileView('rooms')
      }

      try {
        const [friends, groups, conversations, users, requests] = await Promise.all([
          loadFriends(currentProfile),
          loadGroups(currentProfile),
          loadConversations(currentProfile),
          loadUsers(currentProfile.id),
          loadFriendRequests(currentProfile),
        ])
        const merged = new Map([[stockRoom.id, stockRoom]])
        ;[...friends, ...groups, ...conversations].forEach((room) => {
          const existing = merged.get(room.id)
          merged.set(room.id, mergeRoom(existing, room))
        })

        const sortedRooms = sortRooms([...merged.values()], stockBotId)
        const resolvedActiveRoomId = merged.has(activeRoomIdRef.current)
          ? activeRoomIdRef.current
          : stockRoom.id
        const activeSocketRoom =
          sortedRooms.find((item) => item.id === resolvedActiveRoomId) || stockRoom

        setRooms(sortedRooms)
        setAvailableUsers(users)
        setFriendRequests(requests)
        setConnectionError('')
        setConnectionState('connecting')
        setReconnectAttempt(0)
        setActiveRoomId(resolvedActiveRoomId)
        await loadMessagesForRoom(currentProfile, activeSocketRoom)
        if (reconnectSocket) connectSocket(currentProfile, activeSocketRoom)
        return activeSocketRoom
      } catch {
        setRoomError('聊天資料載入失敗，請稍後再試。')
        return null
      } finally {
        setIsLoadingChat(false)
      }
    },
    [connectSocket, loadMessagesForRoom],
  )

  const handleSocketEvent = useCallback(
    (event, currentUserId) => {
      const payload = event?.payload
      if (!payload || typeof payload !== 'object') return

      if (event.type === 'message') {
        appendMessage(normalizeMessage(payload), currentUserId)
        return
      }

      if (event.type === 'read_receipt') {
        applyReadReceipt(normalizeMessage(payload))
        return
      }

      if (event.type === 'friend_request' || event.type === 'friend_added') {
        const currentProfile = profileRef.current
        if (currentProfile) loadInitialChat(currentProfile)
      }
    },
    [appendMessage, applyReadReceipt, loadInitialChat],
  )

  useEffect(() => {
    let mounted = true
    restoreProfile()
      .then((restoredProfile) => {
        if (!mounted || !restoredProfile) return
        setProfile(restoredProfile)
        loadInitialChat(restoredProfile)
      })
      .catch(() => setAccountError('無法還原本機帳號。'))
      .finally(() => {
        if (mounted) setIsRestoring(false)
      })

    return () => {
      mounted = false
      disconnectSocket({ allowReconnect: false })
    }
  }, [disconnectSocket, loadInitialChat])

  const createOrLogin = async (displayName, create) => {
    const name = displayName.trim()
    if (!name) return

    setIsSubmittingProfile(true)
    setAccountError('')
    try {
      const nextProfile = create
        ? await createUser(name)
        : await loginByDisplayName(name)
      await saveProfile(nextProfile)
      setProfile(nextProfile)
      await loadInitialChat(nextProfile)
    } catch (profileError) {
      setAccountError(profileError.message || '帳號處理失敗。')
    } finally {
      setIsSubmittingProfile(false)
    }
  }

  const selectRoom = async (room) => {
    setActiveRoomId(room.id)
    setMobileView('chat')
    setAttachment(null)
    setIsPreparingAttachment(false)
    setRooms((current) =>
      current.map((item) =>
        item.id === room.id ? { ...item, unreadCount: 0 } : item,
      ),
    )
    if (profile) await loadMessagesForRoom(profile, room)
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      sendActiveConversation(socketRef.current, room.conversationId)
    }
  }

  const startChatWithUser = async (targetUser) => {
    if (!profile || targetUser.id === profile.id) return
    const room = {
      id: targetUser.id,
      name: targetUser.displayName,
      recipientId: targetUser.id,
      conversationId: conversationIdFor(profile.id, targetUser.id),
      online: targetUser.online,
      isFriend: false,
      isGroup: false,
      lastMessage: '',
      unreadCount: 0,
    }
    setRooms((current) => sortRooms(upsertRoom(current, room), stockBotId))
    setMobileView('chat')
    await selectRoom(room)
  }

  const wakeAndReload = useCallback(async () => {
    const currentProfile = profileRef.current
    if (!currentProfile || isWakingBackend) return false

    setIsWakingBackend(true)
    setConnectionState('waking')
    setConnectionError('正在喚醒後端並重新建立連線。')
    setReconnectAttempt(0)
    reconnectAttemptRef.current = 0
    clearReconnectTimer()
    try {
      await wakeBackend()
      const activeSocketRoom = await loadInitialChat(currentProfile, {
        resetView: false,
        reconnectSocket: false,
      })
      const reconnectRoom = activeSocketRoom || getReconnectRoom()
      if (reconnectRoom) connectSocket(currentProfile, reconnectRoom)
      setConnectionState('connecting')
      setReconnectAttempt(0)
      return true
    } catch {
      setConnectionError('後端尚未就緒，請稍後再試。')
      setConnectionState('disconnected')
      return false
    } finally {
      setIsWakingBackend(false)
    }
  }, [clearReconnectTimer, connectSocket, getReconnectRoom, isWakingBackend, loadInitialChat])

  const sendMessage = async (text) => {
    const trimmed = text.trim()
    if (!profile || !activeRoom) return false
    if (!trimmed && !attachment) return false
    if (isPreparingAttachment) {
      setRoomError('附件仍在處理中，請稍候。')
      return false
    }
    if (activeRoom.id === stockBotId && attachment) {
      setRoomError('行情小幫手只支援文字訊息。')
      return false
    }
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setConnectionError('即時連線尚未建立，正在重新連線。')
      setConnectionState('reconnecting')
      connectSocket(profile, activeRoom)
      return false
    }

    if (activeRoom.id === stockBotId && trimmed) {
      setMessagesByConversation((current) => {
        const conversationId = activeRoom.conversationId
        const existing = current[conversationId] || []
        return {
          ...current,
          [conversationId]: [
            ...existing.filter((message) => message.pendingId !== stockBotPendingId),
            {
              sender: stockBotName,
              senderId: stockBotId,
              recipientId: profile.id,
              conversationId,
              text: '',
              sentAt: new Date(),
              isPending: true,
              pendingId: stockBotPendingId,
            },
          ],
        }
      })
    }

    sendRealtimeMessage(socketRef.current, {
      profile,
      room: activeRoom,
      text: trimmed,
      attachment,
    })
    setAttachment(null)
    return true
  }

  const pickAttachment = async () => {
    if (activeRoom?.id === stockBotId) {
      setRoomError('行情小幫手只支援文字訊息。')
      return
    }

    try {
      setIsPreparingAttachment(true)
      const [result] = await pick({
        mode: 'open',
        type: [documentPickerTypes.allFiles],
      })
      const [copiedFile] = await keepLocalCopy({
        destination: 'cachesDirectory',
        files: [
          {
            uri: result.uri,
            fileName: result.name || 'attachment',
            ...(result.isVirtual && result.convertibleToMimeTypes?.[0]?.mimeType
              ? {
                  convertVirtualFileToType:
                    result.convertibleToMimeTypes[0].mimeType,
                }
              : {}),
          },
        ],
      })
      const localUri =
        copiedFile?.status === 'success' ? copiedFile.localUri : result.uri
      const asset = {
        uri: localUri,
        name: result.name || 'attachment',
        mimeType: result.type || 'application/octet-stream',
        size: result.size || undefined,
      }
      if (!asset.uri) return
      const nextAttachment = await prepareAttachment(asset)
      setAttachment(nextAttachment)
      setRoomError('')
    } catch (attachmentError) {
      if (
        isDocumentPickerErrorWithCode(attachmentError) &&
        attachmentError.code === documentPickerErrorCodes.OPERATION_CANCELED
      ) {
        return
      }
      setRoomError(attachmentError.message || `附件需小於 ${Math.round(maxAttachmentBytes / 1024 / 1024)} MB。`)
    } finally {
      setIsPreparingAttachment(false)
    }
  }

  const clearAttachment = () => setAttachment(null)

  const openMessageAttachment = async (message) => {
    try {
      await shareAttachment({
        attachmentName: message.attachmentName,
        attachmentType: message.attachmentType,
        attachmentUrl: message.attachmentUrl,
      })
    } catch (attachmentError) {
      setRoomError(attachmentError.message || '附件開啟失敗。')
    }
  }

  const refreshRooms = async () => {
    if (profile) await loadInitialChat(profile)
  }

  const submitAddFriend = async (displayName) => {
    const currentProfile = profileRef.current
    const name = displayName.trim()
    if (!currentProfile || !name) return false

    try {
      await addFriend(currentProfile, name)
      setRoomError('好友邀請已送出。')
      await loadInitialChat(currentProfile)
      return true
    } catch {
      setRoomError('新增好友失敗。')
      return false
    }
  }

  const submitDeleteFriend = async (roomId) => {
    const currentProfile = profileRef.current
    const room = rooms.find((item) => item.id === roomId)
    if (!currentProfile || !room?.isFriend) return false

    try {
      await deleteFriend(currentProfile, room.recipientId)
      await loadInitialChat(currentProfile)
      setRoomError('')
      return true
    } catch {
      setRoomError('刪除好友失敗。')
      return false
    }
  }

  const submitCreateGroup = async ({ name, memberIds }) => {
    const currentProfile = profileRef.current
    const groupName = String(name || '').trim()
    const selectedMemberIds = [...new Set(memberIds || [])].filter(Boolean)
    if (!currentProfile || !groupName || !selectedMemberIds.length) return false

    try {
      const nextGroup = await createGroup(currentProfile, {
        name: groupName,
        memberIds: selectedMemberIds,
      })
      await loadInitialChat(currentProfile)
      const room = {
        ...nextGroup,
        lastMessage: '',
        unreadCount: 0,
      }
      await selectRoom(room)
      setRoomError('')
      return true
    } catch {
      setRoomError('建立群組失敗。')
      return false
    }
  }

  const submitLeaveGroup = async (roomId) => {
    const currentProfile = profileRef.current
    const room = rooms.find((item) => item.id === roomId)
    if (!currentProfile || !room?.isGroup) return false

    try {
      await leaveGroup(currentProfile, room.recipientId)
      await loadInitialChat(currentProfile)
      setMobileView('rooms')
      setRoomError('')
      return true
    } catch {
      setRoomError('退出群組失敗。')
      return false
    }
  }

  const answerFriendRequest = async (requestId, accept) => {
    const currentProfile = profileRef.current
    if (!currentProfile || !requestId) return false

    try {
      await respondFriendRequest(currentProfile, requestId, accept)
      await loadInitialChat(currentProfile)
      setRoomError('')
      return true
    } catch {
      setRoomError(accept ? '接受好友邀請失敗。' : '拒絕好友邀請失敗。')
      return false
    }
  }

  const logout = async () => {
    await clearProfile()
    disconnectSocket({ allowReconnect: false })
    setProfile(null)
    setRooms([])
    setAvailableUsers([])
    setFriendRequests([])
    setActiveRoomId('')
    setMobileView('rooms')
    setMessagesByConversation({})
    setAttachment(null)
    setIsPreparingAttachment(false)
    const emptyLoadedConversationIds = new Set()
    loadedConversationIdsRef.current = emptyLoadedConversationIds
    setLoadedConversationIds(emptyLoadedConversationIds)
    setIsConnected(false)
    setIsWakingBackend(false)
    setConnectionState('idle')
    setReconnectAttempt(0)
    setAccountError('')
    setRoomError('')
    setConnectionError('')
  }

  const dismissRoomError = () => setRoomError('')
  const showRooms = () => setMobileView('rooms')

  eventHandlerRef.current = handleSocketEvent

  return {
    activeMessages,
    activeRoom,
    accountError,
    attachment,
    availableUsers,
    connectionError,
    connectionState,
    createOrLogin,
    createGroup: submitCreateGroup,
    deleteFriend: submitDeleteFriend,
    dismissRoomError,
    friendRequests,
    isConnected,
    isLoadingChat,
    isPreparingAttachment,
    isRestoring,
    isSubmittingProfile,
    isStockBotPending,
    isWakingBackend,
    leaveGroup: submitLeaveGroup,
    logout,
    mobileView,
    openMessageAttachment,
    pickAttachment,
    profile,
    reconnectAttempt,
    refreshRooms,
    respondToFriendRequest: answerFriendRequest,
    roomError,
    rooms,
    selectRoom,
    sendMessage,
    showRooms,
    startChatWithUser,
    submitAddFriend,
    clearAttachment,
    wakeAndReload,
  }
}
