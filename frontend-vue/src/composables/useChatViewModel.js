import { computed, onMounted, onUnmounted, ref } from 'vue'
import { resolveChangePercent } from '../utils/stockChange'

const WS_URL = 'ws://localhost:8080/ws'
const API_URL = 'http://localhost:8080'
const STOCK_BOT_ID = 'stock_bot'
const STOCK_BOT_NAME = 'Stock_Bot'
const DEFAULT_ROOMS = [
  {
    id: STOCK_BOT_ID,
    name: '股票機器人',
    description: '台股、美股與股利查詢',
    initials: '股',
    recipientId: STOCK_BOT_ID,
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
})

const getCurrentTime = () => {
  return new Date().toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const normalizeIncomingMessage = (data, currentUserId) => {
  const senderId = data.sender_id || data.senderId || ''
  const recipientId = data.recipient_id || data.recipientId || ''
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
    changePercent: resolveChangePercent(data),
    sentAt: data.sentAt || getCurrentTime(),
  }
}

export const useChatViewModel = (currentUser) => {
  const rooms = ref(DEFAULT_ROOMS.map((room) => ({
    ...room,
    conversationId: getConversationId(currentUser.id, room.recipientId),
  })))
  const activeRoomId = ref(STOCK_BOT_ID)
  const messagesByConversation = ref(
    Object.fromEntries(rooms.value.map((room) => [room.conversationId, []])),
  )
  const userInput = ref('')
  const isConnected = ref(false)
  const connectionError = ref('')
  const roomError = ref('')
  const handledRequestIds = new Set()

  let socket = null

  const activeRoom = computed(() => {
    return rooms.value.find((room) => room.id === activeRoomId.value) || rooms.value[0]
  })

  const messages = computed(() => {
    return messagesByConversation.value[activeRoom.value.conversationId] || []
  })

  const canSend = computed(() => {
    return isConnected.value && userInput.value.trim().length > 0
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
  }

  const appendMessage = (data) => {
    const message = normalizeIncomingMessage(data, currentUser.id)
    const conversationId = message.conversationId || activeRoom.value.conversationId

    if (!messagesByConversation.value[conversationId]) {
      messagesByConversation.value[conversationId] = []
    }

    messagesByConversation.value[conversationId].push(message)
  }

  const handleFriendRequest = async (request) => {
    if (!request?.request_id || handledRequestIds.has(request.request_id)) return

    handledRequestIds.add(request.request_id)
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
      default:
        console.warn('收到未知 WebSocket 事件:', data)
    }
  }

  const connect = () => {
    const url = new URL(WS_URL)
    url.searchParams.set('user_id', currentUser.id)
    url.searchParams.set('conversation_id', activeRoom.value.conversationId)
    socket = new WebSocket(url)

    socket.onopen = () => {
      isConnected.value = true
      connectionError.value = ''
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

  const appendRoom = (room) => {
    const exists = rooms.value.some((existingRoom) => existingRoom.id === room.id)
    if (exists) return

    rooms.value.push(room)

    if (!messagesByConversation.value[room.conversationId]) {
      messagesByConversation.value[room.conversationId] = []
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

  const loadFriendRequests = async () => {
    try {
      const url = new URL(`${API_URL}/friend-requests`)
      url.searchParams.set('user_id', currentUser.id)
      const response = await fetch(url)
      if (!response.ok) throw new Error('load friend requests failed')

      const requests = await response.json()
      for (const request of requests) {
        if (handledRequestIds.has(request.request_id)) continue
        handledRequestIds.add(request.request_id)

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
    reconnect()
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

  const sendMessage = () => {
    const text = userInput.value.trim()
    if (!text || !socket || socket.readyState !== WebSocket.OPEN) return

    socket.send(
      JSON.stringify({
        sender: currentUser.displayName,
        sender_id: currentUser.id,
        recipient_id: activeRoom.value.recipientId,
        conversation_id: activeRoom.value.conversationId,
        text,
      }),
    )
    userInput.value = ''
  }

  onMounted(async () => {
    await loadFriends()
    await loadFriendRequests()
    connect()
  })
  onUnmounted(() => {
    disconnect()
  })

  return {
    rooms,
    activeRoom,
    activeRoomId,
    messages,
    userInput,
    isConnected,
    connectionError,
    roomError,
    canSend,
    selectRoom,
    addFriend,
    sendMessage,
  }
}
