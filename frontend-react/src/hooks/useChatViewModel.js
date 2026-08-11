import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addFriend as addFriendApi,
  chatQueryKeys,
  createGroup as createGroupApi,
  createWebSocketTicket,
  deleteFriend as deleteFriendApi,
  fetchConversations,
  fetchFriendRequests,
  fetchFriends,
  fetchGroups,
  fetchMessages,
  fetchUsers,
  leaveGroup as leaveGroupApi,
  respondFriendRequest as respondFriendRequestApi,
  wakeBackend as wakeBackendApi,
} from '../api/chatApi'
import { WS_URL } from '../config/api'
const MAX_MESSAGES_PER_CONVERSATION = 200
const MAX_CACHED_CONVERSATIONS = 30
const MAX_HANDLED_REQUEST_IDS = 100
const VOICE_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

const getConversationId = (userId, recipientId) => {
  const [firstId, secondId] = [userId, recipientId].sort()
  return `dm:${firstId}:${secondId}`
}
const isGroupConversation = (conversationId = '') => conversationId.startsWith('group:')
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
const sortRooms = (rooms) => [...rooms].sort((a, b) => (b.lastMessageTimeMs || 0) - (a.lastMessageTimeMs || 0))
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
  const rawConversationId = data.conversation_id || data.conversationId || ''
  const conversationId =
    isGroupConversation(rawConversationId)
      ? rawConversationId
      : senderId && recipientId
      ? getConversationId(senderId, recipientId)
      : rawConversationId

  return {
    sender: data.sender || '',
    senderId,
    recipientId,
    conversationId,
    isSelf: senderId === currentUserId,
    text: data.text || '',
    attachmentUrl: data.attachment_url || data.attachmentUrl || data.image_url || data.imageUrl || '',
    attachmentName: data.attachment_name || data.attachmentName || data.image_name || data.imageName || '',
    attachmentType: data.attachment_type || data.attachmentType || data.image_type || data.imageType || '',
    attachmentSize: data.attachment_size || data.attachmentSize || data.image_size || data.imageSize || 0,
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
const createGroupRoom = (group, t) => ({
  id: group.group_id,
  name: group.name,
  description: t('chat.group'),
  initials: getInitials(group.name),
  recipientId: group.group_id,
  conversationId: group.conversation_id,
  isFriend: false,
  isGroup: true,
  memberIds: group.member_ids || [],
  lastMessage: '',
  lastMessageAt: '',
  lastMessageTimeMs: 0,
  lastMessageIsSelf: false,
  lastMessageReadAt: '',
  unreadCount: 0,
})

export const useChatViewModel = (currentUser) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const initialRooms = useMemo(() => [], [])
  const [rooms, setRooms] = useState(initialRooms)
  const [activeRoomId, setActiveRoomId] = useState('')
  const [availableUsers, setAvailableUsers] = useState([])
  const [messagesByConversation, setMessagesByConversation] = useState(
    Object.fromEntries(initialRooms.map((room) => [room.conversationId, []])),
  )
  const [userInput, setUserInput] = useState('')
  const [fileAttachment, setFileAttachment] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [isWakingBackend, setIsWakingBackend] = useState(false)
  const [roomError, setRoomError] = useState('')
  const [voiceCall, setVoiceCall] = useState({
    status: 'idle',
    roomId: '',
    peerId: '',
    peerName: '',
    isMuted: false,
  })

  const roomsRef = useRef(rooms)
  const activeRoomIdRef = useRef(activeRoomId)
  const availableUsersRef = useRef(availableUsers)
  const socketRef = useRef(null)
  const connectRef = useRef(null)
  const reloadChatDataRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const shouldReconnectRef = useRef(false)
  const isConnectingRef = useRef(false)
  const hasConnectedRef = useRef(false)
  const peerConnectionRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const ringtoneRef = useRef(null)
  const pendingOfferRef = useRef(null)
  const handledRequestIdsRef = useRef(new Set())
  const handledGroupIdsRef = useRef(new Set())
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
        const isGroup = existingRoom.isGroup || room.isGroup
        const isFriend = !isGroup && (existingRoom.isFriend || room.isFriend || room.description === t('chat.friend'))
        resolvedRoom = {
          ...existingRoom,
          ...room,
          description: isGroup
            ? room.description || existingRoom.description
            : isFriend
              ? t('chat.friend')
              : room.description || existingRoom.description,
          isFriend,
          isGroup,
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
    const isGroupMessage = isGroupConversation(conversationId)
    const otherUserId = message.isSelf ? message.recipientId : message.senderId
    const otherUserName = message.isSelf ? '' : message.sender
    const messageKey = getMessageKey(message)

    if (!messageKeysByConversationRef.current.has(conversationId)) {
      messageKeysByConversationRef.current.set(conversationId, new Set())
    }

    const keys = messageKeysByConversationRef.current.get(conversationId)
    if (keys.has(messageKey)) return
    keys.add(messageKey)

    if (!isGroupMessage && otherUserId) {
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
      const conversationMessages = currentMessages[conversationId] || []

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
    await respondFriendRequestApi({
      userId: currentUser.id,
      requestId,
      accept,
    })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.friendRequests(currentUser.id) }),
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.friends(currentUser.id) }),
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(currentUser.id) }),
    ])
  }, [currentUser.id, queryClient])

  const handleFriendRequest = useCallback(async (request) => {
    if (!request?.request_id || handledRequestIdsRef.current.has(request.request_id)) return

    rememberHandledRequest(request.request_id)
    const accepted = window.confirm(t('chat.confirmFriendRequest', { name: request.from_display_name }))
    await respondFriendRequest(request.request_id, accepted)
  }, [rememberHandledRequest, respondFriendRequest, t])

  const activateRoom = useCallback((room) => {
    appendRoom(room)
    roomsRef.current = sortRooms([...roomsRef.current.filter((item) => item.id !== room.id), room])
    activeRoomIdRef.current = room.id
    setActiveRoomId(room.id)
    setUserInput('')
    setFileAttachment(null)
    touchConversationCache(room.conversationId)
    window.setTimeout(sendActiveConversation, 0)
  }, [appendRoom, sendActiveConversation, touchConversationCache])

  const handleGroupAdded = useCallback((group) => {
    if (!group?.group_id || handledGroupIdsRef.current.has(group.group_id)) return

    handledGroupIdsRef.current.add(group.group_id)
    const room = createGroupRoom(group, t)
    appendRoom(room)
    roomsRef.current = sortRooms([...roomsRef.current.filter((item) => item.id !== room.id), room])

    if (group.created_by === currentUser.id) return

    const shouldOpen = window.confirm(t('chat.confirmGroupInvite', { name: group.name }))
    if (shouldOpen) {
      activateRoom(room)
    }
  }, [activateRoom, appendRoom, currentUser.id, t])

  const sendVoiceSignal = useCallback((type, room, payload = {}) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || !room?.recipientId || !room?.conversationId) {
      setConnectionError(t('chat.errors.reconnecting'))
      return false
    }

    socket.send(
      JSON.stringify({
        type,
        sender_id: currentUser.id,
        recipient_id: room.recipientId,
        conversation_id: room.conversationId,
        ...payload,
      }),
    )
    return true
  }, [currentUser.id, t])

  const stopIncomingRingtone = useCallback(() => {
    const ringtone = ringtoneRef.current
    if (!ringtone) return

    window.clearInterval(ringtone.intervalId)
    ringtone.nodes.forEach((node) => {
      try {
        node.stop()
      } catch {
        // The oscillator may already be stopped by its scheduled end time.
      }
      node.disconnect()
    })
    ringtone.gain?.disconnect()
    ringtone.audioContext?.close().catch(() => {})
    ringtoneRef.current = null
  }, [])

  const startIncomingRingtone = useCallback(() => {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
    if (ringtoneRef.current || !AudioContextConstructor) return

    const audioContext = new AudioContextConstructor()
    const gain = audioContext.createGain()
    gain.gain.value = 0.05
    gain.connect(audioContext.destination)

    const playTone = () => {
      const now = audioContext.currentTime
      const nodes = []

      ;[0, 0.38].forEach((offset) => {
        const oscillator = audioContext.createOscillator()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(660, now + offset)
        oscillator.frequency.exponentialRampToValueAtTime(880, now + offset + 0.18)
        oscillator.connect(gain)
        oscillator.start(now + offset)
        oscillator.stop(now + offset + 0.28)
        nodes.push(oscillator)
      })

      ringtoneRef.current = {
        ...ringtoneRef.current,
        nodes,
      }
    }

    ringtoneRef.current = {
      audioContext,
      intervalId: window.setInterval(playTone, 1600),
      gain,
      nodes: [],
    }

    audioContext.resume().then(playTone).catch(() => {
      stopIncomingRingtone()
    })
  }, [stopIncomingRingtone])

  const cleanupVoiceCall = useCallback(() => {
    stopIncomingRingtone()
    peerConnectionRef.current?.close()
    peerConnectionRef.current = null
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    pendingOfferRef.current = null
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
    }
  }, [stopIncomingRingtone])

  const setRemoteAudioElement = useCallback((element) => {
    remoteAudioRef.current = element
  }, [])

  const createPeerConnection = useCallback((room) => {
    const peer = new RTCPeerConnection({ iceServers: VOICE_ICE_SERVERS })
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        sendVoiceSignal('voice_ice', room, { candidate: event.candidate.toJSON() })
      }
    }
    peer.ontrack = (event) => {
      const [stream] = event.streams
      if (remoteAudioRef.current && stream) {
        remoteAudioRef.current.srcObject = stream
        remoteAudioRef.current.play().catch(() => {})
      }
    }
    peer.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) {
        cleanupVoiceCall()
        setVoiceCall({ status: 'idle', roomId: '', peerId: '', peerName: '', isMuted: false })
      }
    }
    peerConnectionRef.current = peer
    return peer
  }, [cleanupVoiceCall, sendVoiceSignal])

  const ensureLocalAudioStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current
    const stream = await window.navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    localStreamRef.current = stream
    return stream
  }, [])

  const findRoomForVoiceSignal = useCallback((payload) => {
    return roomsRef.current.find((room) => {
      return room.conversationId === payload.conversation_id || room.recipientId === payload.sender_id
    })
  }, [])

  const handleVoiceOffer = useCallback((payload) => {
    const room = findRoomForVoiceSignal(payload)
    if (!room || room.isGroup) return

    pendingOfferRef.current = payload
    startIncomingRingtone()
    setVoiceCall({
      status: 'incoming',
      roomId: room.id,
      peerId: payload.sender_id,
      peerName: room.name,
      isMuted: false,
    })
  }, [findRoomForVoiceSignal, startIncomingRingtone])

  const handleVoiceAnswer = useCallback(async (payload) => {
    const peer = peerConnectionRef.current
    if (!peer || !payload.answer) return

    await peer.setRemoteDescription(new RTCSessionDescription(payload.answer))
    setVoiceCall((current) => ({ ...current, status: 'connected' }))
  }, [])

  const handleVoiceIce = useCallback(async (payload) => {
    const peer = peerConnectionRef.current
    if (!peer || !payload.candidate) return

    try {
      await peer.addIceCandidate(new RTCIceCandidate(payload.candidate))
    } catch (error) {
      console.error('Failed to add voice ICE candidate:', error)
    }
  }, [])

  const handleVoiceEnd = useCallback(() => {
    cleanupVoiceCall()
    setVoiceCall({ status: 'idle', roomId: '', peerId: '', peerName: '', isMuted: false })
  }, [cleanupVoiceCall])

  const startVoiceCall = useCallback(async () => {
    const room = getActiveRoom()
    if (!room || room.isGroup) return

    try {
      cleanupVoiceCall()
      const stream = await ensureLocalAudioStream()
      const peer = createPeerConnection(room)
      stream.getTracks().forEach((track) => peer.addTrack(track, stream))
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      if (!sendVoiceSignal('voice_offer', room, { offer })) return

      setVoiceCall({
        status: 'calling',
        roomId: room.id,
        peerId: room.recipientId,
        peerName: room.name,
        isMuted: false,
      })
    } catch (error) {
      console.error('Start voice call failed:', error)
      cleanupVoiceCall()
      setRoomError(t('chat.errors.voiceStartFailed'))
    }
  }, [cleanupVoiceCall, createPeerConnection, ensureLocalAudioStream, getActiveRoom, sendVoiceSignal, t])

  const acceptVoiceCall = useCallback(async () => {
    const offer = pendingOfferRef.current
    const room = offer ? findRoomForVoiceSignal(offer) : null
    if (!offer || !room) return

    try {
      cleanupVoiceCall()
      const stream = await ensureLocalAudioStream()
      const peer = createPeerConnection(room)
      stream.getTracks().forEach((track) => peer.addTrack(track, stream))
      await peer.setRemoteDescription(new RTCSessionDescription(offer.offer))
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      sendVoiceSignal('voice_answer', room, { answer })
      pendingOfferRef.current = null
      setVoiceCall({
        status: 'connected',
        roomId: room.id,
        peerId: room.recipientId,
        peerName: room.name,
        isMuted: false,
      })
    } catch (error) {
      console.error('Accept voice call failed:', error)
      cleanupVoiceCall()
      setRoomError(t('chat.errors.voiceStartFailed'))
    }
  }, [cleanupVoiceCall, createPeerConnection, ensureLocalAudioStream, findRoomForVoiceSignal, sendVoiceSignal, t])

  const rejectVoiceCall = useCallback(() => {
    const offer = pendingOfferRef.current
    const room = offer ? findRoomForVoiceSignal(offer) : null
    if (room) {
      sendVoiceSignal('voice_reject', room)
    }
    cleanupVoiceCall()
    setVoiceCall({ status: 'idle', roomId: '', peerId: '', peerName: '', isMuted: false })
  }, [cleanupVoiceCall, findRoomForVoiceSignal, sendVoiceSignal])

  const endVoiceCall = useCallback(() => {
    const room = roomsRef.current.find((item) => item.id === voiceCall.roomId)
    if (room) {
      sendVoiceSignal('voice_end', room)
    }
    cleanupVoiceCall()
    setVoiceCall({ status: 'idle', roomId: '', peerId: '', peerName: '', isMuted: false })
  }, [cleanupVoiceCall, sendVoiceSignal, voiceCall.roomId])

  const toggleVoiceMute = useCallback(() => {
    const nextMuted = !voiceCall.isMuted
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted
    })
    setVoiceCall((current) => ({ ...current, isMuted: nextMuted }))
  }, [voiceCall.isMuted])

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
      case 'group_added':
        handleGroupAdded(data.payload)
        break
      case 'read_receipt':
        applyReadReceipt(data.payload)
        break
      case 'voice_offer':
        handleVoiceOffer(data.payload)
        break
      case 'voice_answer':
        await handleVoiceAnswer(data.payload)
        break
      case 'voice_ice':
        await handleVoiceIce(data.payload)
        break
      case 'voice_reject':
      case 'voice_end':
        handleVoiceEnd()
        break
      default:
        console.warn('Unknown WebSocket event:', data)
    }
  }, [
    appendMessage,
    appendRoom,
    applyReadReceipt,
    currentUser.id,
    handleFriendRequest,
    handleGroupAdded,
    handleVoiceAnswer,
    handleVoiceEnd,
    handleVoiceIce,
    handleVoiceOffer,
    t,
  ])

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }

    const socket = socketRef.current
    socketRef.current = null
    socket?.close()
    cleanupVoiceCall()
  }, [cleanupVoiceCall])

  const connect = useCallback(async () => {
    if (
      isConnectingRef.current ||
      socketRef.current?.readyState === WebSocket.OPEN ||
      socketRef.current?.readyState === WebSocket.CONNECTING
    ) return

    shouldReconnectRef.current = true
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }

    isConnectingRef.current = true
    let socket
    try {
      const { ticket } = await createWebSocketTicket()
      if (!shouldReconnectRef.current) return

      const url = new URL(WS_URL)
      url.searchParams.set('ticket', ticket)
      url.searchParams.set('conversation_id', getActiveRoom().conversationId)
      socket = new WebSocket(url)
      socketRef.current = socket
    } catch (error) {
      console.error('WebSocket ticket failed:', error)
      setConnectionError(t('chat.errors.connectionFailed', { url: WS_URL }))
      if (shouldReconnectRef.current) {
        reconnectTimerRef.current = window.setTimeout(() => connectRef.current?.(), 2000)
      }
      return
    } finally {
      isConnectingRef.current = false
    }

    socket.onopen = () => {
      setIsConnected(true)
      setConnectionError('')
      sendActiveConversation()
      if (hasConnectedRef.current) {
        reloadChatDataRef.current?.().catch((error) => {
          console.error('Chat resync after reconnect failed:', error)
        })
      }
      hasConnectedRef.current = true
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
      if (socketRef.current !== socket) return
      socketRef.current = null
      setIsConnected(false)
      if (shouldReconnectRef.current) {
        reconnectTimerRef.current = window.setTimeout(() => connectRef.current?.(), 2000)
      }
    }
  }, [addSystemMessage, getActiveRoom, handleWebSocketEvent, sendActiveConversation, t])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  const reconnect = useCallback(() => {
    disconnect()
    connect()
  }, [connect, disconnect])

  const loadMessagesForRoom = useCallback(async (room) => {
    if (!room?.conversationId || loadedConversationIdsRef.current.has(room.conversationId)) return

    try {
      const historyMessages = await queryClient.fetchQuery({
        queryKey: chatQueryKeys.messages(currentUser.id, room.conversationId),
        queryFn: () => fetchMessages({ userId: currentUser.id, conversationId: room.conversationId }),
        staleTime: 10_000,
      })
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
  }, [appendMessage, currentUser.id, queryClient, t, touchConversationCache, updateRoom])

  const loadUsers = useCallback(async () => {
    try {
      const users = await queryClient.fetchQuery({
        queryKey: chatQueryKeys.users(currentUser.id),
        queryFn: () => fetchUsers(currentUser.id),
      })
      availableUsersRef.current = users
      setAvailableUsers(users)
    } catch (error) {
      console.error('User list load failed:', error)
      setRoomError(t('chat.errors.usersFailed'))
    }
  }, [currentUser.id, queryClient, t])

  const loadFriends = useCallback(async () => {
    setRoomError('')

    try {
      const friends = await queryClient.fetchQuery({
        queryKey: chatQueryKeys.friends(currentUser.id),
        queryFn: () => fetchFriends(currentUser.id),
      })
      friends.forEach((friend) => {
        appendRoom(createFriendRoom(currentUser.id, friend, t))
      })
    } catch (error) {
      console.error('Friend list load failed:', error)
      setRoomError(t('chat.errors.friendsFailed'))
    }
  }, [appendRoom, currentUser.id, queryClient, t])

  const loadGroups = useCallback(async () => {
    try {
      const groups = await queryClient.fetchQuery({
        queryKey: chatQueryKeys.groups(currentUser.id),
        queryFn: () => fetchGroups(currentUser.id),
      })
      groups.forEach((group) => appendRoom(createGroupRoom(group, t)))
    } catch (error) {
      console.error('Group list load failed:', error)
      setRoomError(t('chat.errors.groupsFailed'))
    }
  }, [appendRoom, currentUser.id, queryClient, t])

  const loadConversations = useCallback(async () => {
    try {
      const conversations = await queryClient.fetchQuery({
        queryKey: chatQueryKeys.conversations(currentUser.id),
        queryFn: () => fetchConversations(currentUser.id),
      })
      conversations.forEach((conversation) => {
        const isGroup = Boolean(conversation.is_group)
        const displayName = conversation.display_name
        appendRoom({
          id: conversation.recipient_id,
          name: displayName,
          description: isGroup
            ? t('chat.group')
            : conversation.is_friend
            ? t('chat.friend')
            : t('chat.conversation'),
          initials: getInitials(displayName),
          recipientId: conversation.recipient_id,
          conversationId: conversation.conversation_id,
          isFriend: Boolean(conversation.is_friend),
          isGroup,
          memberIds: conversation.member_ids || [],
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
  }, [appendRoom, currentUser.id, queryClient, t])

  const createGroup = useCallback(async ({ name, memberIds }) => {
    const groupName = name.trim()
    const selectedMemberIds = [...new Set(memberIds)].filter(Boolean)
    if (!groupName || !selectedMemberIds.length) return

    setRoomError('')
    try {
      const group = await createGroupApi({
        userId: currentUser.id,
        name: groupName,
        memberIds: selectedMemberIds,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.groups(currentUser.id) }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(currentUser.id) }),
      ])
      const room = createGroupRoom(group, t)
      handledGroupIdsRef.current.add(group.group_id)
      activateRoom(room)
      await loadGroups()
      await loadConversations()
    } catch (error) {
      console.error('Create group failed:', error)
      setRoomError(t('chat.errors.createGroupFailed'))
    }
  }, [activateRoom, currentUser.id, loadConversations, loadGroups, queryClient, t])

  const leaveGroup = useCallback(async (roomId) => {
    const room = roomsRef.current.find((item) => item.id === roomId)
    if (!room?.isGroup) return
    if (!window.confirm(t('chat.confirmLeaveGroup', { name: room.name }))) return

    setRoomError('')
    try {
      await leaveGroupApi({
        userId: currentUser.id,
        groupId: room.recipientId,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.groups(currentUser.id) }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(currentUser.id) }),
      ])

      const nextRooms = roomsRef.current.filter((item) => item.id !== room.id)
      roomsRef.current = sortRooms(nextRooms)
      setRooms(roomsRef.current)
      setMessagesByConversation((currentMessages) => {
        const nextMessages = { ...currentMessages }
        delete nextMessages[room.conversationId]
        return nextMessages
      })
      loadedConversationIdsRef.current.delete(room.conversationId)
      messageKeysByConversationRef.current.delete(room.conversationId)
      conversationCacheAccessRef.current.delete(room.conversationId)

      const fallbackRoom = roomsRef.current[0] || initialRooms[0]
      activeRoomIdRef.current = fallbackRoom.id
      setActiveRoomId(fallbackRoom.id)
      setUserInput('')
      setFileAttachment(null)
      touchConversationCache(fallbackRoom.conversationId)
      await loadGroups()
      await loadConversations()
      window.setTimeout(sendActiveConversation, 0)
    } catch (error) {
      console.error('Leave group failed:', error)
      setRoomError(t('chat.errors.leaveGroupFailed'))
    }
  }, [currentUser.id, initialRooms, loadConversations, loadGroups, queryClient, sendActiveConversation, t, touchConversationCache])

  const loadFriendRequests = useCallback(async () => {
    try {
      const requests = await queryClient.fetchQuery({
        queryKey: chatQueryKeys.friendRequests(currentUser.id),
        queryFn: () => fetchFriendRequests(currentUser.id),
      })
      for (const request of requests) {
        if (handledRequestIdsRef.current.has(request.request_id)) continue
        rememberHandledRequest(request.request_id)

        const accepted = window.confirm(t('chat.confirmFriendRequest', { name: request.from_display_name }))
        await respondFriendRequest(request.request_id, accepted)
      }
    } catch (error) {
      console.error('Friend request load failed:', error)
    }
  }, [currentUser.id, queryClient, rememberHandledRequest, respondFriendRequest, t])

  const reloadChatData = useCallback(async () => {
    await loadUsers()
    await loadFriends()
    await loadGroups()
    await loadConversations()
    await loadFriendRequests()
    await loadMessagesForRoom(getActiveRoom())
  }, [
    getActiveRoom,
    loadConversations,
    loadFriendRequests,
    loadFriends,
    loadGroups,
    loadMessagesForRoom,
    loadUsers,
  ])

  useEffect(() => {
    reloadChatDataRef.current = reloadChatData
  }, [reloadChatData])

  const wakeBackend = useCallback(async () => {
    if (isWakingBackend) return

    setIsWakingBackend(true)
    setConnectionError(t('chat.wakeInProgress'))
    try {
      await wakeBackendApi()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.users(currentUser.id) }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.friends(currentUser.id) }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.groups(currentUser.id) }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(currentUser.id) }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.friendRequests(currentUser.id) }),
      ])
      await reloadChatData()
      reconnect()
      setConnectionError('')
    } catch (error) {
      console.error('Backend wake failed:', error)
      setConnectionError(t('chat.errors.wakeFailed'))
    } finally {
      setIsWakingBackend(false)
    }
  }, [currentUser.id, isWakingBackend, queryClient, reconnect, reloadChatData, t])

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
      await addFriendApi({
        userId: currentUser.id,
        displayName: name,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.friends(currentUser.id) }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(currentUser.id) }),
      ])
      setRoomError(t('chat.errors.friendInviteSent'))
    } catch (error) {
      console.error('Add friend failed:', error)
      setRoomError(t('chat.errors.addFriendFailed'))
    }
  }, [currentUser.id, queryClient, t])

  const deleteFriend = useCallback(async (roomId) => {
    const room = roomsRef.current.find((item) => item.id === roomId)
    if (!room?.isFriend) return
    if (!window.confirm(t('chat.confirmDeleteFriend', { name: room.name }))) return

    setRoomError('')
    try {
      await deleteFriendApi({
        userId: currentUser.id,
        friendId: room.recipientId,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.friends(currentUser.id) }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(currentUser.id) }),
      ])

      const nextRooms = roomsRef.current.map((item) =>
        item.id === room.id ? { ...item, isFriend: false, description: t('chat.conversation') } : item,
      )
      roomsRef.current = sortRooms(nextRooms)
      setRooms(roomsRef.current)
      await loadFriends()
      await loadConversations()
    } catch (error) {
      console.error('Delete friend failed:', error)
      setRoomError(t('chat.errors.deleteFriendFailed'))
    }
  }, [currentUser.id, loadConversations, loadFriends, queryClient, t])

  const attachFile = (file) => {
    setFileAttachment(file)
  }

  const clearFileAttachment = () => {
    setFileAttachment(null)
  }

  const sendMessage = useCallback((presetText = '') => {
    const text = String(presetText || userInput).trim()
    const attachment = presetText ? null : fileAttachment
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
    setUserInput('')
    setFileAttachment(null)
  }, [currentUser.displayName, currentUser.id, fileAttachment, getActiveRoom, reconnect, t, userInput])

  useEffect(() => {
    let isActive = true

    const initialLoad = async () => {
      await loadUsers()
      if (!isActive) return
      await loadFriends()
      if (!isActive) return
      await loadGroups()
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
    loadGroups,
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
    isWakingBackend,
    roomError,
    canSend,
    voiceCall,
    setRemoteAudioElement,
    selectRoom,
    startChatWithUser,
    addFriend,
    deleteFriend,
    createGroup,
    leaveGroup,
    attachFile,
    clearFileAttachment,
    refreshFriends: loadFriends,
    wakeBackend,
    sendMessage,
    startVoiceCall,
    acceptVoiceCall,
    rejectVoiceCall,
    endVoiceCall,
    toggleVoiceMute,
  }
}
