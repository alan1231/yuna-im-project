import { wsBaseUrl } from '../config/runtime'

export function connectRealtime({ profile, room, onEvent, onDisconnected }) {
  const url = `${wsBaseUrl}?user_id=${encodeURIComponent(
    profile.id,
  )}&conversation_id=${encodeURIComponent(room.conversationId)}`
  const socket = new WebSocket(url)

  socket.onopen = () => {
    sendActiveConversation(socket, room.conversationId)
  }
  socket.onclose = onDisconnected
  socket.onerror = onDisconnected
  socket.onmessage = (event) => {
    const socketEvent = JSON.parse(event.data)
    onEvent(socketEvent, profile.id)
  }

  return socket
}

export function sendActiveConversation(socket, conversationId) {
  socket.send(JSON.stringify({ type: 'active_conversation', conversation_id: conversationId }))
}

export function sendRealtimeMessage(socket, { profile, room, text }) {
  socket.send(
    JSON.stringify({
      sender: profile.displayName,
      sender_id: profile.id,
      recipient_id: room.recipientId,
      conversation_id: room.conversationId,
      text,
      attachment_url: '',
      attachment_name: '',
      attachment_type: '',
      attachment_size: 0,
    }),
  )
}

export function closeRealtime(socketRef) {
  if (socketRef.current) {
    socketRef.current.close()
    socketRef.current = null
  }
}
