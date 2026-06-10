import * as DocumentPicker from 'expo-document-picker'
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
  const [accountError, setAccountError] = useState('')
  const [roomError, setRoomError] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const socketRef = useRef(null)
  const activeRoomIdRef = useRef('')
  const eventHandlerRef = useRef(null)
  const loadedConversationIdsRef = useRef(new Set())
  const profileRef = useRef(null)

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
    loadedConversationIdsRef.current = loadedConversationIds
  }, [loadedConversationIds])

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

  const connectSocket = useCallback((currentProfile, room) => {
    closeRealtime(socketRef)

    try {
      const socket = connectRealtime({
        profile: currentProfile,
        room,
        onEvent: (...args) => eventHandlerRef.current?.(...args),
        onDisconnected: () => {
          setIsConnected(false)
          setConnectionError('連線中斷，請重新連線或喚醒後端。')
        },
      })
      socketRef.current = socket
      socket.onopen = () => {
        setIsConnected(true)
        setConnectionError('')
        sendActiveConversation(socket, room.conversationId)
      }
    } catch {
      setConnectionError('WebSocket 連線失敗。')
      setIsConnected(false)
    }
  }, [])

  const loadInitialChat = useCallback(
    async (currentProfile) => {
      const stockRoom = createStockRoom(currentProfile)

      setIsLoadingChat(true)
      setRoomError('')
      setRooms([stockRoom])
      setActiveRoomId(stockRoom.id)
      setMobileView('rooms')

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

        setRooms(sortRooms([...merged.values()], stockBotId))
        setAvailableUsers(users)
        setFriendRequests(requests)
        setConnectionError('')
        setActiveRoomId((currentRoomId) =>
          merged.has(currentRoomId) ? currentRoomId : stockRoom.id,
        )
        await loadMessagesForRoom(currentProfile, stockRoom)
        connectSocket(currentProfile, stockRoom)
      } catch {
        setRoomError('聊天資料載入失敗，請稍後再試。')
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
      closeRealtime(socketRef)
    }
  }, [loadInitialChat])

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
    if (!profileRef.current || isWakingBackend) return false

    setIsWakingBackend(true)
    try {
      await wakeBackend()
      await loadInitialChat(profileRef.current)
      setConnectionError('')
      return true
    } catch {
      setConnectionError('後端尚未就緒，請稍後再試。')
      return false
    } finally {
      setIsWakingBackend(false)
    }
  }, [isWakingBackend, loadInitialChat])

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
      setConnectionError('WebSocket 尚未連線，正在嘗試重新連線。')
      await wakeAndReload()
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
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: '*/*',
      })
      if (result.canceled) return

      const asset = result.assets?.[0]
      if (!asset?.uri) return
      const nextAttachment = await prepareAttachment(asset)
      setAttachment(nextAttachment)
      setRoomError('')
    } catch (attachmentError) {
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
    closeRealtime(socketRef)
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
