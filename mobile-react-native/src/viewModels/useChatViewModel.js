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
  createUser,
  loadConversations,
  loadFriends,
  loadMessages,
  loadUsers,
  loginByDisplayName,
} from '../services/chatApi'
import { clearProfile, restoreProfile, saveProfile } from '../services/profileStore'
import {
  closeRealtime,
  connectRealtime,
  sendActiveConversation,
  sendRealtimeMessage,
} from '../services/realtimeService'

export function useChatViewModel() {
  const [profile, setProfile] = useState(null)
  const [isRestoring, setIsRestoring] = useState(true)
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false)
  const [isLoadingChat, setIsLoadingChat] = useState(false)
  const [rooms, setRooms] = useState([])
  const [availableUsers, setAvailableUsers] = useState([])
  const [activeRoomId, setActiveRoomId] = useState('')
  const [mobileView, setMobileView] = useState('rooms')
  const [messagesByConversation, setMessagesByConversation] = useState({})
  const [loadedConversationIds, setLoadedConversationIds] = useState(new Set())
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState('')
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

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId
  }, [activeRoomId])

  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  useEffect(() => {
    loadedConversationIdsRef.current = loadedConversationIds
  }, [loadedConversationIds])

  const loadMessagesForRoom = useCallback(
    async (currentProfile, room) => {
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
        setError('訊息載入失敗。')
      }
    },
    [],
  )

  const handleSocketEvent = useCallback((event, currentUserId) => {
    const payload = event?.payload
    if (!payload || typeof payload !== 'object') return

    if (event.type === 'message') {
      appendMessage(normalizeMessage(payload), currentUserId)
    } else if (event.type === 'friend_added') {
      const currentProfile = profileRef.current
      if (currentProfile) loadInitialChat(currentProfile)
    }
  }, [])

  const connectSocket = useCallback((currentProfile, room) => {
    closeRealtime(socketRef)

    try {
      const socket = connectRealtime({
        profile: currentProfile,
        room,
        onEvent: (...args) => eventHandlerRef.current?.(...args),
        onDisconnected: () => setIsConnected(false),
      })
      socketRef.current = socket
      socket.onopen = () => {
        setIsConnected(true)
        sendActiveConversation(socket, room.conversationId)
      }
    } catch {
      setError('WebSocket 連線失敗。')
      setIsConnected(false)
    }
  }, [])

  const loadInitialChat = useCallback(
    async (currentProfile) => {
      const stockRoom = {
        id: stockBotId,
        name: stockBotName,
        recipientId: stockBotId,
        conversationId: conversationIdFor(currentProfile.id, stockBotId),
        isFriend: false,
        online: true,
        lastMessage: '',
        unreadCount: 0,
      }

      setIsLoadingChat(true)
      setError('')
      setRooms([stockRoom])
      setActiveRoomId(stockRoom.id)
      setMobileView('rooms')

      try {
        const [friends, conversations, users] = await Promise.all([
          loadFriends(currentProfile),
          loadConversations(currentProfile),
          loadUsers(currentProfile.id),
        ])
        const merged = new Map([[stockRoom.id, stockRoom]])
        ;[...friends, ...conversations].forEach((room) => {
          const existing = merged.get(room.id)
          merged.set(room.id, mergeRoom(existing, room))
        })

        setRooms(sortRooms([...merged.values()], stockBotId))
        setAvailableUsers(users)
        setActiveRoomId((currentRoomId) =>
          merged.has(currentRoomId) ? currentRoomId : stockRoom.id,
        )
        await loadMessagesForRoom(currentProfile, stockRoom)
        connectSocket(currentProfile, stockRoom)
      } catch {
        setError('聊天資料載入失敗，請確認 Go 後端正在執行。')
      } finally {
        setIsLoadingChat(false)
      }
    },
    [connectSocket, loadMessagesForRoom],
  )

  useEffect(() => {
    let mounted = true
    restoreProfile()
      .then((restoredProfile) => {
        if (!mounted || !restoredProfile) return
        setProfile(restoredProfile)
        loadInitialChat(restoredProfile)
      })
      .catch(() => setError('無法還原本機帳號。'))
      .finally(() => {
        if (mounted) setIsRestoring(false)
      })

    return () => {
      mounted = false
      closeRealtime(socketRef)
    }
  }, [])

  const createOrLogin = async (displayName, create) => {
    const name = displayName.trim()
    if (!name) return

    setIsSubmittingProfile(true)
    setError('')
    try {
      const nextProfile = create
        ? await createUser(name)
        : await loginByDisplayName(name)
      await saveProfile(nextProfile)
      setProfile(nextProfile)
      await loadInitialChat(nextProfile)
    } catch (profileError) {
      setError(profileError.message || '帳號處理失敗。')
    } finally {
      setIsSubmittingProfile(false)
    }
  }

  const selectRoom = async (room) => {
    setActiveRoomId(room.id)
    setMobileView('chat')
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

  const sendMessage = (text) => {
    const trimmed = text.trim()
    if (!profile || !activeRoom || !trimmed) return false
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setError('WebSocket 尚未連線。')
      return false
    }

    sendRealtimeMessage(socketRef.current, {
      profile,
      room: activeRoom,
      text: trimmed,
    })
    return true
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
      lastMessage: '',
      unreadCount: 0,
    }
    setRooms((current) => sortRooms(upsertRoom(current, room), stockBotId))
    setMobileView('chat')
    await selectRoom(room)
  }

  const refreshRooms = async () => {
    if (profile) await loadInitialChat(profile)
  }

  const logout = async () => {
    await clearProfile()
    closeRealtime(socketRef)
    setProfile(null)
    setRooms([])
    setAvailableUsers([])
    setActiveRoomId('')
    setMobileView('rooms')
    setMessagesByConversation({})
    const emptyLoadedConversationIds = new Set()
    loadedConversationIdsRef.current = emptyLoadedConversationIds
    setLoadedConversationIds(emptyLoadedConversationIds)
    setIsConnected(false)
    setError('')
  }

  const dismissError = () => setError('')
  const showRooms = () => setMobileView('rooms')

  const appendMessage = (message, currentUserId) => {
    setMessagesByConversation((current) => {
      const existing = current[message.conversationId] || []
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
            lastMessage: message.text || '已傳送訊息',
            lastMessageAt: message.sentAt,
            lastMessageIsSelf: message.senderId === currentUserId,
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
  }

  eventHandlerRef.current = handleSocketEvent

  return {
    activeMessages,
    activeRoom,
    availableUsers,
    createOrLogin,
    dismissError,
    error,
    isConnected,
    isLoadingChat,
    isRestoring,
    isSubmittingProfile,
    logout,
    mobileView,
    profile,
    refreshRooms,
    rooms,
    selectRoom,
    sendMessage,
    showRooms,
    startChatWithUser,
  }
}
