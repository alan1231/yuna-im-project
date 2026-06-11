import { wsBaseUrl } from '../config/runtime'

export function connectRealtime({ profile, room, onEvent, onOpen, onClose, onError }) {
  const url = `${wsBaseUrl}?user_id=${encodeURIComponent(
    profile.id,
  )}&conversation_id=${encodeURIComponent(room.conversationId)}`
  const socket = new WebSocket(url)

  socket.onopen = () => onOpen?.({ url })
  socket.onclose = (event) =>
    onClose?.({
      url,
      code: event?.code,
      reason: event?.reason || '',
      wasClean: Boolean(event?.wasClean),
    })
  socket.onerror = (event) => onError?.({ url, event })
  socket.onmessage = (event) => {
    try {
      const socketEvent = JSON.parse(event.data)
      onEvent(socketEvent, profile.id)
    } catch {
      onError?.({ url, event, reason: 'invalid_message' })
    }
  }

  return socket
}

export function sendActiveConversation(socket, conversationId) {
  socket.send(JSON.stringify({ type: 'active_conversation', conversation_id: conversationId }))
}

export function sendRealtimeMessage(socket, { profile, room, text, attachment }) {
  socket.send(
    JSON.stringify({
      sender: profile.displayName,
      sender_id: profile.id,
      recipient_id: room.recipientId,
      conversation_id: room.conversationId,
      text,
      attachment_url: attachment?.url || '',
      attachment_name: attachment?.name || '',
      attachment_type: attachment?.type || '',
      attachment_size: attachment?.size || 0,
    }),
  )
}

export function closeRealtime(socketRef) {
  if (socketRef.current) {
    socketRef.current.onclose = null
    socketRef.current.onerror = null
    socketRef.current.onmessage = null
    socketRef.current.onopen = null
    socketRef.current.close()
    socketRef.current = null
  }
}
