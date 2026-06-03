import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { API_URL, WS_URL } from '../config/api'
import { resolveChangePercent } from '../utils/stockChange'

const STOCK_BOT_ID = 'stock_bot'
const STOCK_BOT_NAME = '行情小幫手'
const STOCK_BOT_PENDING_ID = 'stock-bot-pending'
const MAX_MESSAGES_PER_CONVERSATION = 200
const MAX_CACHED_CONVERSATIONS = 30
const MAX_HANDLED_REQUEST_IDS = 100

const getConversationId = (userId, recipientId) => {
  const [firstId, secondId] = [userId, recipientId].sort()
  return `dm:${firstId}:${secondId}`
}
const getInitials = (name) => name.trim().slice(0, 1).toUpperCase() || '?'
const getCurrentTime = () => {
  return new Date().toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
const formatRoomTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value || '')

  return date.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
const getTimeMs = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}
const sortRooms = (rooms) => {
  return [...rooms].sort((a, b) => {
    if (a.id === STOCK_BOT_ID && !b.lastMessageTimeMs) return -1
    if (b.id === STOCK_BOT_ID && !a.lastMessageTimeMs) return 1
    return (b.lastMessageTimeMs || 0) - (a.lastMessageTimeMs || 0)
  })
}
const getMessageKey = (message) => {
  return [
    message.senderId,
    message.recipientId,
    message.conversationId,
    message.sentAt,
    message.text,
    message.attachmentName,
    message.attachmentSize,
  ].join('|')
}
const normalizeIncomingMessage = (data, currentUserId) => {
  const senderId = data.sender_id || data.senderId || ''
  const recipientId = data.recipient_id || data.recipientId || ''
  const readAt = data.read_at || data.readAt || ''
  const conversationId =
    senderId && recipientId
      ? getConversationId(senderId, recipientId)
      : data.conversation_id || data.conversationId || ''

  return {
    sender: data.sender || STOCK_BOT_NAME,
    senderId,
    recipientId,
    conversationId,
    isSelf: senderId === currentUserId,
    text: data.text || '',
    attachmentUrl: data.attachment_url || data.attachmentUrl || data.image_url || data.imageUrl || '',
    attachmentName: data.attachment_name || data.attachmentName || data.image_name || data.imageName || '',
    attachmentType: data.attachment_type || data.attachmentType || data.image_type || data.imageType || '',
    attachmentSize: data.attachment_size || data.attachmentSize || data.image_size || data.imageSize || 0,
    changePercent: resolveChangePercent(data),
    sentAt: data.sentAt || data.time || getCurrentTime(),
    readAt,
  }
}
const createFriendRoom = (currentUserId, friend, t) => ({
  id: friend.friend_id,
  name: friend.display_name,
  description: t('chat.friend'),
  initials: getInitials(friend.display_name),
  recipientId: friend.friend_id,
  conversationId: getConversationId(currentUserId, friend.friend_id),
  isFriend: true,
  online: Boolean(friend.online),
  lastSeen: friend.last_seen || '',
  lastMessage: '',
  lastMessageAt: '',
  lastMessageTimeMs: 0,
  lastMessageIsSelf: false,
  lastMessageReadAt: '',
  unreadCount: 0,
})
const createUserRoom = (currentUserId, user, description) => ({
  id: user.user_id,
  name: user.display_name,
  description,
  initials: getInitials(user.display_name),
  recipientId: user.user_id,
  conversationId: getConversationId(currentUserId, user.user_id),
  isFriend: false,
  online: Boolean(user.online),
  lastSeen: user.last_seen || '',
  lastMessage: '',
  lastMessageAt: '',
  lastMessageTimeMs: 0,
  lastMessageIsSelf: false,
  lastMessageReadAt: '',
  unreadCount: 0,
})

export const useChatViewModel = (currentUser) => {
  const { t } = useTranslation()
  const defaultRooms = useMemo(
    () => [
      {
        id: STOCK_BOT_ID,
        name: t('chat.stockBotName'),
        description: t('chat.stockBotDescription'),
        initials: t('chat.stockBotInitial'),
        recipientId: STOCK_BOT_ID,
        isFriend: false,
      },
    ],
    [t],
  )
  const initialRooms = useMemo(
    () =>
      defaultRooms.map((room) => ({
        ...room,
        conversationId: getConversationId(currentUser.id, room.recipientId),
        lastMessage: '',
        lastMessageAt: '',
        lastMessageTimeMs: 0,
        lastMessageIsSelf: false,
        lastMessageReadAt: '',
        unreadCount: 0,
      })),
    [currentUser.id, defaultRooms],
  )
  const [rooms, setRooms] = useState(initialRooms)
  const [activeRoomId, setActiveRoomId] = useState(STOCK_BOT_ID)
  const [availableUsers, setAvailableUsers] = useState([])
  const [messagesByConversation, setMessagesByConversation] = useState(
    Object.fromEntries(initialRooms.map((room) => [room.conversationId, []])),
  )
  const [userInput, setUserInput] = useState('')
  const [fileAttachment, setFileAttachment] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [roomError, setRoomError] = useState('')

  const roomsRef = useRef(rooms)
  const activeRoomIdRef = useRef(activeRoomId)
  const availableUsersRef = useRef(availableUsers)
  const socketRef = useRef(null)
  const handledRequestIdsRef = useRef(new Set())
  const loadedConversationIdsRef = useRef(new Set())
  const messageKeysByConversationRef = useRef(new Map())
  const conversationCacheAccessRef = useRef(new Map())

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) || rooms[0],
    [activeRoomId, rooms],
  )
  const messages = messagesByConversation[activeRoom?.conversationId] || []
  const canSend = userInput.trim().length > 0 || Boolean(fileAttachment)

  useEffect(() => {
    roomsRef.current = rooms
  }, [rooms])
  useEffect(() => {
    activeRoomIdRef.current = activeRoomId
  }, [activeRoomId])
  useEffect(() => {
    availableUsersRef.current = availableUsers
  }, [availableUsers])

  const getActiveRoom = useCallback(() => {
    return roomsRef.current.find((room) => room.id === activeRoomIdRef.current) || roomsRef.current[0]
  }, [])

  const touchConversationCache = useCallback((conversationId) => {
    if (!conversationId) return
    conversationCacheAccessRef.current.set(conversationId, Date.now())
  }, [])

  const pruneMessages = useCallback((nextMessages) => {
    const conversationIds = Object.keys(nextMessages)
    if (conversationIds.length <= MAX_CACHED_CONVERSATIONS) return nextMessages

    const protectedConversationIds = new Set([
      getActiveRoom()?.conversationId,
      getConversationId(currentUser.id, STOCK_BOT_ID),
    ])
    const candidates = conversationIds
      .filter((conversationId) => !protectedConversationIds.has(conversationId))
      .sort((a, b) => {
        return (
          (conversationCacheAccessRef.current.get(a) || 0) -
          (conversationCacheAccessRef.current.get(b) || 0)
        )
      })

    const prunedMessages = { ...nextMessages }
    while (Object.keys(prunedMessages).length > MAX_CACHED_CONVERSATIONS && candidates.length) {
      const conversationId = candidates.shift()
      delete prunedMessages[conversationId]
      loadedConversationIdsRef.current.delete(conversationId)
      messageKeysByConversationRef.current.delete(conversationId)
      conversationCacheAccessRef.current.delete(conversationId)
    }
    return prunedMessages
  }, [currentUser.id, getActiveRoom])

  const updateRoom = useCallback((updater) => {
    setRooms((currentRooms) => sortRooms(updater(currentRooms)))
  }, [])

  const appendRoom = useCallback((room) => {
    let resolvedRoom = room
    setRooms((currentRooms) => {
      const existingRoom = currentRooms.find((item) => item.id === room.id)
      if (existingRoom) {
        const isFriend = existingRoom.isFriend || room.isFriend || room.description === t('chat.friend')
        resolvedRoom = {
          ...existingRoom,
          ...room,
          description: isFriend ? t('chat.friend') : room.description || existingRoom.description,
          isFriend,
          lastMessage: room.lastMessage || existingRoom.lastMessage,
          lastMessageAt: room.lastMessageAt || existingRoom.lastMessageAt,
          lastMessageTimeMs: room.lastMessageTimeMs || existingRoom.lastMessageTimeMs,
          lastMessageIsSelf: room.lastMessage ? room.lastMessageIsSelf : existingRoom.lastMessageIsSelf,
          lastMessageReadAt: room.lastMessage ? room.lastMessageReadAt : existingRoom.lastMessageReadAt,
          unreadCount:
            room.lastMessage && typeof room.unreadCount === 'number'
              ? room.unreadCount
              : existingRoom.unreadCount || 0,
        }
        return sortRooms(currentRooms.map((item) => (item.id === room.id ? resolvedRoom : item)))
      }

      resolvedRoom = room
      return sortRooms([...currentRooms, room])
    })

    setMessagesByConversation((currentMessages) => {
      if (currentMessages[room.conversationId]) return currentMessages
      touchConversationCache(room.conversationId)
      return pruneMessages({
        ...currentMessages,
        [room.conversationId]: [],
      })
    })
    return resolvedRoom
  }, [pruneMessages, t, touchConversationCache])

  const updateRoomSummary = useCallback((conversationId, message, options = {}) => {
    updateRoom((currentRooms) =>
      currentRooms.map((room) => {
        if (room.conversationId !== conversationId) return room

        return {
          ...room,
          lastMessage: message.text || (message.attachmentUrl ? t('chat.sentAttachment') : ''),
          lastMessageAt: formatRoomTime(message.sentAt),
          lastMessageTimeMs: getTimeMs(message.sentAt),
          lastMessageIsSelf: message.isSelf,
          lastMessageReadAt: message.readAt || '',
          unreadCount:
            !options.isHistory && !message.isSelf && room.id !== activeRoomIdRef.current
              ? (room.unreadCount || 0) + 1
              : room.unreadCount || 0,
        }
      }),
    )
  }, [t, updateRoom])

  const appendMessage = useCallback((data, options = {}) => {
    const message = normalizeIncomingMessage(data, currentUser.id)
    const conversationId = message.conversationId || getActiveRoom().conversationId
    const otherUserId = message.isSelf ? message.recipientId : message.senderId
    const otherUserName = message.isSelf ? '' : message.sender
    const messageKey = getMessageKey(message)

    if (!messageKeysByConversationRef.current.has(conversationId)) {
      messageKeysByConversationRef.current.set(conversationId, new Set())
    }

    const keys = messageKeysByConversationRef.current.get(conversationId)
    if (keys.has(messageKey)) return
    keys.add(messageKey)

    if (otherUserId && otherUserId !== STOCK_BOT_ID) {
      const knownName =
        availableUsersRef.current.find((item) => item.user_id === otherUserId)?.display_name || ''
      appendRoom({
        id: otherUserId,
        name: knownName || otherUserName || otherUserId,
        description: t('chat.conversation'),
        initials: getInitials(knownName || otherUserName || otherUserId),
        recipientId: otherUserId,
        conversationId,
        isFriend: false,
      })
    }

    setMessagesByConversation((currentMessages) => {
      let conversationMessages = currentMessages[conversationId] || []
      if (message.senderId === STOCK_BOT_ID) {
        conversationMessages = conversationMessages.filter(
          (item) => item.pendingId !== STOCK_BOT_PENDING_ID,
        )
      }

      const nextConversationMessages = [...conversationMessages, message].slice(-MAX_MESSAGES_PER_CONVERSATION)
      if (nextConversationMessages.length !== conversationMessages.length + 1) {
        messageKeysByConversationRef.current.set(
          conversationId,
          new Set(nextConversationMessages.map((item) => getMessageKey(item))),
        )
      }

      touchConversationCache(conversationId)
      return pruneMessages({
        ...currentMessages,
        [conversationId]: nextConversationMessages,
      })
    })
    updateRoomSummary(conversationId, message, options)
  }, [appendRoom, currentUser.id, getActiveRoom, pruneMessages, t, touchConversationCache, updateRoomSummary])

  const addSystemMessage = useCallback((text) => {
    const conversationId = getActiveRoom().conversationId
    const message = {
      sender: 'System',
      senderId: 'system',
      conversationId,
      text,
      sentAt: getCurrentTime(),
    }
    setMessagesByConversation((currentMessages) => ({
      ...currentMessages,
      [conversationId]: [...(currentMessages[conversationId] || []), message].slice(
        -MAX_MESSAGES_PER_CONVERSATION,
      ),
    }))
  }, [getActiveRoom])

  const sendActiveConversation = useCallback(() => {
    const socket = socketRef.current
    if (!socket || socket.readyState === WebSocket.CLOSED) return
    if (socket.readyState !== WebSocket.OPEN) return

    socket.send(
      JSON.stringify({
        type: 'active_conversation',
        conversation_id: getActiveRoom().conversationId,
      }),
    )
  }, [getActiveRoom])

  const applyReadReceipt = useCallback((payload) => {
    const message = normalizeIncomingMessage(payload, currentUser.id)
    if (!message.conversationId || !message.readAt) return

    setMessagesByConversation((currentMessages) => ({
      ...currentMessages,
      [message.conversationId]: (currentMessages[message.conversationId] || []).map((item) => {
        const sameMessage =
          item.senderId === message.senderId &&
          item.recipientId === message.recipientId &&
          item.sentAt === message.sentAt &&
          item.text === message.text
        return sameMessage ? { ...item, readAt: message.readAt } : item
      }),
    }))

    updateRoom((currentRooms) =>
      currentRooms.map((room) => {
        if (room.conversationId !== message.conversationId) return room
        if (!room.lastMessageIsSelf || room.lastMessage !== message.text) return room
        return {
          ...room,
          lastMessageReadAt: message.readAt,
        }
      }),
    )
  }, [currentUser.id, updateRoom])

  const rememberHandledRequest = useCallback((requestId) => {
    const handledRequestIds = handledRequestIdsRef.current
    handledRequestIds.add(requestId)
    if (handledRequestIds.size <= MAX_HANDLED_REQUEST_IDS) return

    const oldestRequestId = handledRequestIds.values().next().value
    handledRequestIds.delete(oldestRequestId)
  }, [])

  const respondFriendRequest = useCallback(async (requestId, accept) => {
    const response = await fetch(`${API_URL}/friend-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: currentUser.id,
        request_id: requestId,
        accept,
      }),
    })

    if (!response.ok) throw new Error('respond friend request failed')
  }, [currentUser.id])

  const handleFriendRequest = useCallback(async (request) => {
    if (!request?.request_id || handledRequestIdsRef.current.has(request.request_id)) return

    rememberHandledRequest(request.request_id)
    const accepted = window.confirm(t('chat.confirmFriendRequest', { name: request.from_display_name }))
    await respondFriendRequest(request.request_id, accepted)
  }, [rememberHandledRequest, respondFriendRequest, t])

  const handleWebSocketEvent = useCallback(async (data) => {
    if (!data.type) {
      appendMessage(data)
      return
    }

    switch (data.type) {
      case 'message':
        appendMessage(data.payload)
        break
      case 'friend_request':
        await handleFriendRequest(data.payload)
        break
      case 'friend_added':
        appendRoom(createFriendRoom(currentUser.id, data.payload, t))
        break
      case 'read_receipt':
        applyReadReceipt(data.payload)
        break
      default:
        console.warn('Unknown WebSocket event:', data)
    }
  }, [appendMessage, appendRoom, applyReadReceipt, currentUser.id, handleFriendRequest, t])

  const disconnect = useCallback(() => {
    if (!socketRef.current) return

    socketRef.current.close()
    socketRef.current = null
  }, [])

  const connect = useCallback(() => {
    const url = new URL(WS_URL)
    url.searchParams.set('user_id', currentUser.id)
    url.searchParams.set('conversation_id', getActiveRoom().conversationId)
    const socket = new WebSocket(url)
    socketRef.current = socket

    socket.onopen = () => {
      setIsConnected(true)
      setConnectionError('')
      sendActiveConversation()
      console.log('Connected to Go backend')
    }

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handleWebSocketEvent(data).catch((error) => {
          console.error('WebSocket event handling failed:', error)
        })
      } catch (error) {
        console.error('Received an invalid WebSocket message:', error)
        addSystemMessage(t('chat.errors.invalidMessage'))
      }
    }

    socket.onerror = () => {
      setConnectionError(t('chat.errors.connectionFailed', { url: WS_URL }))
    }

    socket.onclose = () => {
      setIsConnected(false)
    }
  }, [addSystemMessage, currentUser.id, getActiveRoom, handleWebSocketEvent, sendActiveConversation, t])

  const reconnect = useCallback(() => {
    disconnect()
    connect()
  }, [connect, disconnect])

  const loadMessagesForRoom = useCallback(async (room) => {
    if (!room?.conversationId || loadedConversationIdsRef.current.has(room.conversationId)) return

    try {
      const url = new URL(`${API_URL}/messages`)
      url.searchParams.set('user_id', currentUser.id)
      url.searchParams.set('conversation_id', room.conversationId)
      const response = await fetch(url)
      if (!response.ok) throw new Error('load messages failed')

      const historyMessages = await response.json()
      historyMessages.forEach((message) => appendMessage(message, { isHistory: true }))
      updateRoom((currentRooms) =>
        currentRooms.map((item) =>
          item.conversationId === room.conversationId ? { ...item, unreadCount: 0 } : item,
        ),
      )
      loadedConversationIdsRef.current.add(room.conversationId)
      touchConversationCache(room.conversationId)
    } catch (error) {
      console.error('Message history load failed:', error)
      setRoomError(t('chat.errors.historyFailed'))
    }
  }, [appendMessage, currentUser.id, t, touchConversationCache, updateRoom])

  const loadUsers = useCallback(async () => {
    try {
      const url = new URL(`${API_URL}/users`)
      url.searchParams.set('user_id', currentUser.id)
      const response = await fetch(url)
      if (!response.ok) throw new Error('load users failed')

      const users = await response.json()
      availableUsersRef.current = users
      setAvailableUsers(users)
    } catch (error) {
      console.error('User list load failed:', error)
      setRoomError(t('chat.errors.usersFailed'))
    }
  }, [currentUser.id, t])

  const loadFriends = useCallback(async () => {
    setRoomError('')

    try {
      const url = new URL(`${API_URL}/friends`)
      url.searchParams.set('user_id', currentUser.id)
      const response = await fetch(url)
      if (!response.ok) throw new Error('load friends failed')

      const friends = await response.json()
      friends.forEach((friend) => {
        appendRoom(createFriendRoom(currentUser.id, friend, t))
      })
    } catch (error) {
      console.error('Friend list load failed:', error)
      setRoomError(t('chat.errors.friendsFailed'))
    }
  }, [appendRoom, currentUser.id, t])

  const loadConversations = useCallback(async () => {
    try {
      const url = new URL(`${API_URL}/conversations`)
      url.searchParams.set('user_id', currentUser.id)
      const response = await fetch(url)
      if (!response.ok) throw new Error('load conversations failed')

      const conversations = await response.json()
      conversations.forEach((conversation) => {
        const isStockBot = conversation.recipient_id === STOCK_BOT_ID
        const displayName = isStockBot ? t('chat.stockBotName') : conversation.display_name
        appendRoom({
          id: conversation.recipient_id,
          name: displayName,
          description: isStockBot
            ? t('chat.stockBotDescription')
            : conversation.is_friend
              ? t('chat.friend')
              : t('chat.conversation'),
          initials: isStockBot ? t('chat.stockBotInitial') : getInitials(displayName),
          recipientId: conversation.recipient_id,
          conversationId: conversation.conversation_id,
          isFriend: Boolean(conversation.is_friend),
          lastMessage: conversation.last_message || '',
          lastMessageAt: formatRoomTime(conversation.last_message_at),
          lastMessageTimeMs: getTimeMs(conversation.last_message_at),
          lastMessageIsSelf: conversation.last_message_sender_id === currentUser.id,
          lastMessageReadAt: conversation.last_message_read_at || '',
          unreadCount: conversation.unread_count || 0,
        })
      })
    } catch (error) {
      console.error('Conversation list load failed:', error)
      setRoomError(t('chat.errors.conversationsFailed'))
    }
  }, [appendRoom, currentUser.id, t])

  const loadFriendRequests = useCallback(async () => {
    try {
      const url = new URL(`${API_URL}/friend-requests`)
      url.searchParams.set('user_id', currentUser.id)
      const response = await fetch(url)
      if (!response.ok) throw new Error('load friend requests failed')

      const requests = await response.json()
      for (const request of requests) {
        if (handledRequestIdsRef.current.has(request.request_id)) continue
        rememberHandledRequest(request.request_id)

        const accepted = window.confirm(t('chat.confirmFriendRequest', { name: request.from_display_name }))
        await respondFriendRequest(request.request_id, accepted)
      }
    } catch (error) {
      console.error('Friend request load failed:', error)
    }
  }, [currentUser.id, rememberHandledRequest, respondFriendRequest, t])

  const selectRoom = useCallback((roomId) => {
    if (roomId === activeRoomIdRef.current) return

    const nextRoom = roomsRef.current.find((room) => room.id === roomId)
    if (!nextRoom) return

    activeRoomIdRef.current = roomId
    setActiveRoomId(roomId)
    setUserInput('')
    setFileAttachment(null)
    updateRoom((currentRooms) =>
      currentRooms.map((room) => (room.id === roomId ? { ...room, unreadCount: 0 } : room)),
    )
    touchConversationCache(nextRoom.conversationId)
    loadMessagesForRoom(nextRoom).catch((error) => {
      console.error('Room switch history load failed:', error)
    })

    window.setTimeout(sendActiveConversation, 0)
  }, [loadMessagesForRoom, sendActiveConversation, touchConversationCache, updateRoom])

  const startChatWithUser = useCallback((user) => {
    const room = createUserRoom(currentUser.id, user, t('chat.conversation'))
    appendRoom(room)
    roomsRef.current = sortRooms([...roomsRef.current.filter((item) => item.id !== room.id), room])
    activeRoomIdRef.current = room.id
    setActiveRoomId(room.id)
    setUserInput('')
    setFileAttachment(null)
    touchConversationCache(room.conversationId)
    loadMessagesForRoom(room).catch((error) => {
      console.error('Room switch history load failed:', error)
    })
    window.setTimeout(sendActiveConversation, 0)
  }, [appendRoom, currentUser.id, loadMessagesForRoom, sendActiveConversation, t, touchConversationCache])

  const addFriend = useCallback(async (displayName) => {
    const name = displayName.trim()
    if (!name) return

    setRoomError('')

    try {
      const response = await fetch(`${API_URL}/friends`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: currentUser.id,
          display_name: name,
        }),
      })
      if (!response.ok) throw new Error('create friend failed')

      await response.json()
      setRoomError(t('chat.errors.friendInviteSent'))
    } catch (error) {
      console.error('Add friend failed:', error)
      setRoomError(t('chat.errors.addFriendFailed'))
    }
  }, [currentUser.id, t])

  const attachFile = (file) => {
    setFileAttachment(file)
  }

  const clearFileAttachment = () => {
    setFileAttachment(null)
  }

  const showStockBotPending = useCallback((conversationId) => {
    setMessagesByConversation((currentMessages) => {
      const currentConversationMessages = currentMessages[conversationId] || []
      const nextConversationMessages = [
        ...currentConversationMessages.filter((message) => message.pendingId !== STOCK_BOT_PENDING_ID),
        {
          sender: STOCK_BOT_NAME,
          senderId: STOCK_BOT_ID,
          recipientId: currentUser.id,
          conversationId,
          text: '',
          sentAt: getCurrentTime(),
          isPending: true,
          pendingId: STOCK_BOT_PENDING_ID,
        },
      ]
      touchConversationCache(conversationId)
      return {
        ...currentMessages,
        [conversationId]: nextConversationMessages,
      }
    })
  }, [currentUser.id, touchConversationCache])

  const sendMessage = useCallback(() => {
    const text = userInput.trim()
    const attachment = fileAttachment
    if (!text && !attachment) return

    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setConnectionError(t('chat.errors.reconnecting'))
      reconnect()
      return
    }

    const room = getActiveRoom()
    socket.send(
      JSON.stringify({
        sender: currentUser.displayName,
        sender_id: currentUser.id,
        recipient_id: room.recipientId,
        conversation_id: room.conversationId,
        text,
        attachment_url: attachment?.url || '',
        attachment_name: attachment?.name || '',
        attachment_type: attachment?.type || '',
        attachment_size: attachment?.size || 0,
      }),
    )
    if (room.recipientId === STOCK_BOT_ID && text) {
      showStockBotPending(room.conversationId)
    }
    setUserInput('')
    setFileAttachment(null)
  }, [currentUser.displayName, currentUser.id, fileAttachment, getActiveRoom, reconnect, showStockBotPending, t, userInput])

  useEffect(() => {
    let isActive = true

    const initialLoad = async () => {
      await loadUsers()
      if (!isActive) return
      await loadFriends()
      if (!isActive) return
      await loadConversations()
      if (!isActive) return
      await loadFriendRequests()
      if (!isActive) return
      await loadMessagesForRoom(getActiveRoom())
      if (!isActive) return
      connect()
    }

    initialLoad()

    return () => {
      isActive = false
      disconnect()
    }
  }, [
    connect,
    disconnect,
    getActiveRoom,
    loadConversations,
    loadFriendRequests,
    loadFriends,
    loadMessagesForRoom,
    loadUsers,
  ])

  return {
    rooms,
    availableUsers,
    activeRoom,
    activeRoomId,
    messages,
    userInput,
    setUserInput,
    fileAttachment,
    isConnected,
    connectionError,
    roomError,
    canSend,
    selectRoom,
    startChatWithUser,
    addFriend,
    attachFile,
    clearFileAttachment,
    refreshFriends: loadFriends,
    sendMessage,
  }
}
