import { computed, onMounted, onUnmounted, ref } from 'vue'
import { API_URL, WS_URL } from '../config/api'
import { resolveChangePercent } from '../utils/stockChange'

const STOCK_BOT_ID = 'stock_bot'
const STOCK_BOT_NAME = 'Stock_Bot'
const MAX_MESSAGES_PER_CONVERSATION = 200
const MAX_CACHED_CONVERSATIONS = 30
const MAX_HANDLED_REQUEST_IDS = 100
const ATTACHMENT_MESSAGE_FALLBACK = '已傳送檔案'
const DEFAULT_ROOMS = [
  {
    id: STOCK_BOT_ID,
    name: '股票機器人',
    description: '台股、美股與股利查詢',
    initials: '股',
    recipientId: STOCK_BOT_ID,
    isFriend: false,
  },
]

const getConversationId = (userId, recipientId) => {
  const [firstId, secondId] = [userId, recipientId].sort()
  return `dm:${firstId}:${secondId}`
}
const getInitials = (name) => name.trim().slice(0, 1).toUpperCase() || '?'
const createFriendRoom = (currentUserId, friend) => ({
  id: friend.friend_id,
  name: friend.display_name,
  description: '朋友',
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
const createUserRoom = (currentUserId, user, description = '使用者') => ({
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

const getCurrentTime = () => {
  return new Date().toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
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

// useChatViewModel owns the chat screen state: room list, message cache,
// WebSocket lifecycle, friend requests, read receipts, and history loading.
export const useChatViewModel = (currentUser) => {
  const rooms = ref(DEFAULT_ROOMS.map((room) => ({
    ...room,
    conversationId: getConversationId(currentUser.id, room.recipientId),
    lastMessage: '',
    lastMessageAt: '',
    lastMessageTimeMs: 0,
    lastMessageIsSelf: false,
    lastMessageReadAt: '',
    unreadCount: 0,
  })))
  const activeRoomId = ref(STOCK_BOT_ID)
  const availableUsers = ref([])
  const messagesByConversation = ref(
    Object.fromEntries(rooms.value.map((room) => [room.conversationId, []])),
  )
  const userInput = ref('')
  const fileAttachment = ref(null)
  const isConnected = ref(false)
  const connectionError = ref('')
  const roomError = ref('')
  const handledRequestIds = new Set()
  const loadedConversationIds = new Set()
  const messageKeysByConversation = new Map()
  const conversationCacheAccess = new Map()

  let socket = null

  const activeRoom = computed(() => {
    return rooms.value.find((room) => room.id === activeRoomId.value) || rooms.value[0]
  })

  const messages = computed(() => {
    return messagesByConversation.value[activeRoom.value.conversationId] || []
  })

  const canSend = computed(() => {
    return userInput.value.trim().length > 0 || Boolean(fileAttachment.value)
  })

  const addSystemMessage = (text) => {
    const conversationId = activeRoom.value.conversationId
    messagesByConversation.value[conversationId].push({
      sender: 'System',
      senderId: 'system',
      conversationId,
      text,
      sentAt: getCurrentTime(),
    })
    trimConversationMessages(conversationId)
  }

  // Every message can arrive from history, live WebSocket events, or the Python
  // stock bot. This path normalizes and de-duplicates before touching UI state.
  const appendMessage = (data, options = {}) => {
    const message = normalizeIncomingMessage(data, currentUser.id)
    const conversationId = message.conversationId || activeRoom.value.conversationId
    const otherUserId = message.isSelf ? message.recipientId : message.senderId
    const otherUserName = message.isSelf ? '' : message.sender
    const messageKey = getMessageKey(message)

    if (!messagesByConversation.value[conversationId]) {
      messagesByConversation.value[conversationId] = []
    }

    if (!messageKeysByConversation.has(conversationId)) {
      messageKeysByConversation.set(conversationId, new Set())
    }

    const keys = messageKeysByConversation.get(conversationId)
    if (keys.has(messageKey)) return
    keys.add(messageKey)

    if (otherUserId && otherUserId !== STOCK_BOT_ID) {
      appendRoom({
        id: otherUserId,
        name:
          findKnownUserName(otherUserId) ||
          otherUserName ||
          otherUserId,
        description: '聊天',
        initials: getInitials(findKnownUserName(otherUserId) || otherUserName || otherUserId),
        recipientId: otherUserId,
        conversationId,
        isFriend: false,
      })
    }

    messagesByConversation.value[conversationId].push(message)
    trimConversationMessages(conversationId)
    touchConversationCache(conversationId)
    updateRoomSummary(conversationId, message, options)
  }

  const updateRoomSummary = (conversationId, message, options = {}) => {
    const room = rooms.value.find((item) => item.conversationId === conversationId)
    if (!room) return

    room.lastMessage = message.text || (message.attachmentUrl ? ATTACHMENT_MESSAGE_FALLBACK : '')
    room.lastMessageAt = formatRoomTime(message.sentAt)
    room.lastMessageTimeMs = getTimeMs(message.sentAt)
    room.lastMessageIsSelf = message.isSelf
    room.lastMessageReadAt = message.readAt || ''

    if (!options.isHistory && !message.isSelf && room.id !== activeRoomId.value) {
      room.unreadCount += 1
    }

    sortRooms()
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

  const sortRooms = () => {
    rooms.value.sort((a, b) => {
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

  const touchConversationCache = (conversationId) => {
    if (!conversationId) return

    conversationCacheAccess.set(conversationId, Date.now())
    pruneCachedConversations()
  }

  const trimConversationMessages = (conversationId) => {
    const conversationMessages = messagesByConversation.value[conversationId]
    if (!conversationMessages || conversationMessages.length <= MAX_MESSAGES_PER_CONVERSATION) return

    messagesByConversation.value[conversationId] = conversationMessages.slice(-MAX_MESSAGES_PER_CONVERSATION)
    rebuildMessageKeys(conversationId)
  }

  const rebuildMessageKeys = (conversationId) => {
    const keys = new Set()
    const conversationMessages = messagesByConversation.value[conversationId] || []
    conversationMessages.forEach((message) => {
      keys.add(getMessageKey(message))
    })
    messageKeysByConversation.set(conversationId, keys)
  }

  const pruneCachedConversations = () => {
    const conversationIds = Object.keys(messagesByConversation.value)
    if (conversationIds.length <= MAX_CACHED_CONVERSATIONS) return

    const protectedConversationIds = new Set([
      activeRoom.value?.conversationId,
      getConversationId(currentUser.id, STOCK_BOT_ID),
    ])
    const candidates = conversationIds
      .filter((conversationId) => !protectedConversationIds.has(conversationId))
      .sort((a, b) => {
        return (conversationCacheAccess.get(a) || 0) - (conversationCacheAccess.get(b) || 0)
      })

    const nextMessagesByConversation = { ...messagesByConversation.value }
    while (Object.keys(nextMessagesByConversation).length > MAX_CACHED_CONVERSATIONS && candidates.length) {
      const conversationId = candidates.shift()
      delete nextMessagesByConversation[conversationId]
      loadedConversationIds.delete(conversationId)
      messageKeysByConversation.delete(conversationId)
      conversationCacheAccess.delete(conversationId)
    }
    messagesByConversation.value = nextMessagesByConversation
  }

  const rememberHandledRequest = (requestId) => {
    handledRequestIds.add(requestId)
    if (handledRequestIds.size <= MAX_HANDLED_REQUEST_IDS) return

    const oldestRequestId = handledRequestIds.values().next().value
    handledRequestIds.delete(oldestRequestId)
  }

  const handleFriendRequest = async (request) => {
    if (!request?.request_id || handledRequestIds.has(request.request_id)) return

    rememberHandledRequest(request.request_id)
    const accepted = window.confirm(`${request.from_display_name} 想加你為好友，是否同意？`)
    await respondFriendRequest(request.request_id, accepted)
  }

  const handleFriendAdded = (friend) => {
    appendRoom(createFriendRoom(currentUser.id, friend))
  }

  const handleWebSocketEvent = async (data) => {
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
        handleFriendAdded(data.payload)
        break
      case 'read_receipt':
        applyReadReceipt(data.payload)
        break
      default:
        console.warn('收到未知 WebSocket 事件:', data)
    }
  }

  // Keep one WebSocket per user and send active-room changes as control events.
  // That lets the backend share one Mongo Change Stream across all clients.
  const connect = () => {
    const url = new URL(WS_URL)
    url.searchParams.set('user_id', currentUser.id)
    url.searchParams.set('conversation_id', activeRoom.value.conversationId)
    socket = new WebSocket(url)

    socket.onopen = () => {
      isConnected.value = true
      connectionError.value = ''
      sendActiveConversation()
      console.log('已連線至 Go 後端')
    }

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handleWebSocketEvent(data).catch((error) => {
          console.error('處理 WebSocket 事件失敗:', error)
        })
      } catch (error) {
        console.error('收到無法解析的 WebSocket 訊息:', error)
        addSystemMessage('收到的訊息格式不正確')
      }
    }

    socket.onerror = () => {
      connectionError.value = `無法連線到 Go 後端，請確認 ${WS_URL} 已啟動`
    }

    socket.onclose = () => {
      isConnected.value = false
    }
  }

  const disconnect = () => {
    if (!socket) return

    socket.close()
    socket = null
  }

  const reconnect = () => {
    disconnect()
    connect()
  }

  const sendActiveConversation = () => {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      connect()
      return
    }
    if (socket.readyState !== WebSocket.OPEN) return

    socket.send(
      JSON.stringify({
        type: 'active_conversation',
        conversation_id: activeRoom.value.conversationId,
      }),
    )
  }

  const appendRoom = (room) => {
    const existingRoom = rooms.value.find((item) => item.id === room.id)
    if (existingRoom) {
      const isFriend = existingRoom.isFriend || room.isFriend || room.description === '朋友'
      Object.assign(existingRoom, {
        ...room,
        description: isFriend ? '朋友' : room.description || existingRoom.description,
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
      })
      sortRooms()
      return existingRoom
    }

    rooms.value.push(room)

    if (!messagesByConversation.value[room.conversationId]) {
      messagesByConversation.value[room.conversationId] = []
    }

    touchConversationCache(room.conversationId)
    sortRooms()
    return room
  }

  const applyReadReceipt = (payload) => {
    const message = normalizeIncomingMessage(payload, currentUser.id)
    if (!message.conversationId || !message.readAt) return

    const messages = messagesByConversation.value[message.conversationId] || []
    messages.forEach((item) => {
      const sameMessage =
        item.senderId === message.senderId &&
        item.recipientId === message.recipientId &&
        item.sentAt === message.sentAt &&
        item.text === message.text
      if (sameMessage) {
        item.readAt = message.readAt
      }
    })

    const room = rooms.value.find((item) => item.conversationId === message.conversationId)
    if (room?.lastMessageIsSelf && room.lastMessage === message.text) {
      room.lastMessageReadAt = message.readAt
    }
  }

  const loadMessagesForRoom = async (room) => {
    if (!room?.conversationId || loadedConversationIds.has(room.conversationId)) return

    try {
      const url = new URL(`${API_URL}/messages`)
      url.searchParams.set('user_id', currentUser.id)
      url.searchParams.set('conversation_id', room.conversationId)
      const response = await fetch(url)
      if (!response.ok) throw new Error('load messages failed')

      const messages = await response.json()
      messages.forEach((message) => appendMessage(message, { isHistory: true }))
      room.unreadCount = 0
      loadedConversationIds.add(room.conversationId)
      touchConversationCache(room.conversationId)
    } catch (error) {
      console.error('載入歷史訊息失敗:', error)
      roomError.value = '歷史訊息載入失敗'
    }
  }

  const findKnownUserName = (userId) => {
    const user = availableUsers.value.find((item) => item.user_id === userId)
    return user?.display_name || ''
  }

  const loadUsers = async () => {
    try {
      const url = new URL(`${API_URL}/users`)
      url.searchParams.set('user_id', currentUser.id)
      const response = await fetch(url)
      if (!response.ok) throw new Error('load users failed')

      availableUsers.value = await response.json()
    } catch (error) {
      console.error('載入使用者清單失敗:', error)
      roomError.value = '使用者清單載入失敗'
    }
  }

  const loadFriends = async () => {
    roomError.value = ''

    try {
      const url = new URL(`${API_URL}/friends`)
      url.searchParams.set('user_id', currentUser.id)
      const response = await fetch(url)
      if (!response.ok) throw new Error('load friends failed')

      const friends = await response.json()
      friends.forEach((friend) => {
        appendRoom(createFriendRoom(currentUser.id, friend))
      })
    } catch (error) {
      console.error('載入朋友清單失敗:', error)
      roomError.value = '朋友清單載入失敗'
    }
  }

  const loadConversations = async () => {
    try {
      const url = new URL(`${API_URL}/conversations`)
      url.searchParams.set('user_id', currentUser.id)
      const response = await fetch(url)
      if (!response.ok) throw new Error('load conversations failed')

      const conversations = await response.json()
      conversations.forEach((conversation) => {
        appendRoom({
          id: conversation.recipient_id,
          name: conversation.display_name,
          description: conversation.is_friend ? '朋友' : '聊天',
          initials: getInitials(conversation.display_name),
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
      sortRooms()
    } catch (error) {
      console.error('載入聊天列表失敗:', error)
      roomError.value = '聊天列表載入失敗'
    }
  }

  const loadFriendRequests = async () => {
    try {
      const url = new URL(`${API_URL}/friend-requests`)
      url.searchParams.set('user_id', currentUser.id)
      const response = await fetch(url)
      if (!response.ok) throw new Error('load friend requests failed')

      const requests = await response.json()
      for (const request of requests) {
        if (handledRequestIds.has(request.request_id)) continue
        rememberHandledRequest(request.request_id)

        const accepted = window.confirm(`${request.from_display_name} 想加你為好友，是否同意？`)
        await respondFriendRequest(request.request_id, accepted)
      }
    } catch (error) {
      console.error('載入好友邀請失敗:', error)
    }
  }

  const respondFriendRequest = async (requestId, accept) => {
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
  }

  const selectRoom = (roomId) => {
    if (roomId === activeRoomId.value) return

    activeRoomId.value = roomId
    userInput.value = ''
    fileAttachment.value = null
    activeRoom.value.unreadCount = 0
    touchConversationCache(activeRoom.value.conversationId)
    loadMessagesForRoom(activeRoom.value).catch((error) => {
      console.error('切換聊天室載入歷史訊息失敗:', error)
    })
    sendActiveConversation()
  }

  const startChatWithUser = (user) => {
    const room = createUserRoom(currentUser.id, user, '聊天')
    appendRoom(room)
    selectRoom(room.id)
  }

  const addFriend = async (displayName) => {
    const name = displayName.trim()
    if (!name) return

    roomError.value = ''

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
      roomError.value = '好友邀請已送出，等待對方同意。'
    } catch (error) {
      console.error('新增朋友失敗:', error)
      roomError.value = '新增朋友失敗，請確認朋友名稱是否存在。'
    }
  }

  const attachFile = (file) => {
    fileAttachment.value = file
  }

  const clearFileAttachment = () => {
    fileAttachment.value = null
  }

  // The server trusts the WebSocket query user_id as the sender and recomputes
  // conversation_id, so the client only supplies the intended recipient/text.
  const sendMessage = () => {
    const text = userInput.value.trim()
    const attachment = fileAttachment.value
    if (!text && !attachment) return
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      connectionError.value = '目前尚未連線，正在重新連線。'
      reconnect()
      return
    }

    socket.send(
      JSON.stringify({
        sender: currentUser.displayName,
        sender_id: currentUser.id,
        recipient_id: activeRoom.value.recipientId,
        conversation_id: activeRoom.value.conversationId,
        text,
        attachment_url: attachment?.url || '',
        attachment_name: attachment?.name || '',
        attachment_type: attachment?.type || '',
        attachment_size: attachment?.size || 0,
      }),
    )
    userInput.value = ''
    fileAttachment.value = null
  }

  // Initial load intentionally fetches reference data before opening the socket
  // so live events can merge into known rooms instead of creating duplicates.
  onMounted(async () => {
    await loadUsers()
    await loadFriends()
    await loadConversations()
    await loadFriendRequests()
    await loadMessagesForRoom(activeRoom.value)
    connect()
  })
  onUnmounted(() => {
    disconnect()
  })

  return {
    rooms,
    availableUsers,
    activeRoom,
    activeRoomId,
    messages,
    userInput,
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
