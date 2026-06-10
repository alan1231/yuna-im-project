export function conversationIdFor(leftUserId, rightUserId) {
  return `dm:${[leftUserId, rightUserId].sort().join(':')}`
}

export function createLocalUserId() {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function normalizeUser(rawUser) {
  return {
    id: String(rawUser.user_id || ''),
    displayName: String(rawUser.display_name || ''),
    online: rawUser.online === true,
    lastSeen: parseDate(rawUser.last_seen),
  }
}

export function normalizeFriend(rawFriend, profile) {
  const friendId = String(rawFriend.friend_id || '')
  return {
    id: friendId,
    name: String(rawFriend.display_name || friendId),
    recipientId: friendId,
    conversationId: conversationIdFor(profile.id, friendId),
    online: rawFriend.online === true,
    isFriend: true,
    lastMessage: '',
    unreadCount: 0,
    lastSeen: parseDate(rawFriend.last_seen),
  }
}

export function normalizeConversation(rawConversation, profile) {
  const recipientId = String(rawConversation.recipient_id || '')
  return {
    id: recipientId,
    name: String(rawConversation.display_name || recipientId),
    recipientId,
    conversationId: String(
      rawConversation.conversation_id ||
        conversationIdFor(profile.id, recipientId),
    ),
    lastMessage: String(rawConversation.last_message || ''),
    lastMessageAt: parseDate(rawConversation.last_message_at),
    lastMessageIsSelf: rawConversation.last_message_sender_id === profile.id,
    unreadCount: Number(rawConversation.unread_count || 0),
    isFriend: rawConversation.is_friend === true,
    isGroup: rawConversation.is_group === true,
  }
}

export function normalizeMessage(rawMessage) {
  const senderId = String(rawMessage.sender_id || '')
  const recipientId = String(rawMessage.recipient_id || '')
  return {
    sender: String(rawMessage.sender || 'Unknown'),
    senderId,
    recipientId,
    conversationId: String(
      rawMessage.conversation_id || conversationIdFor(senderId, recipientId),
    ),
    text: String(rawMessage.text || ''),
    sentAt: parseDate(rawMessage.time || rawMessage.sent_at) || new Date(),
  }
}

export function mergeRoom(existing, room) {
  if (!existing) return room
  return {
    ...existing,
    ...room,
    isFriend: existing.isFriend || room.isFriend,
    online: existing.online || room.online,
    lastMessage: room.lastMessage || existing.lastMessage,
    lastMessageAt: room.lastMessageAt || existing.lastMessageAt,
  }
}

export function upsertRoom(rooms, room) {
  const index = rooms.findIndex((item) => item.id === room.id)
  if (index === -1) return [...rooms, room]
  return rooms.map((item) => (item.id === room.id ? mergeRoom(item, room) : item))
}

export function sortRooms(rooms, stockBotId) {
  return [...rooms].sort((a, b) => {
    const aTime = a.lastMessageAt?.getTime?.() || 0
    const bTime = b.lastMessageAt?.getTime?.() || 0
    if (a.id === stockBotId && aTime === 0 && bTime === 0) return -1
    if (b.id === stockBotId && aTime === 0 && bTime === 0) return 1
    return bTime - aTime
  })
}

export function messageKey(message) {
  return [
    message.senderId,
    message.recipientId,
    message.sentAt.toISOString(),
    message.text,
  ].join('|')
}

export function formatTime(value) {
  return value.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRoomTime(value) {
  if (!value) return ''
  return value.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
