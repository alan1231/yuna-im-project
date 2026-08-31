export type CurrentUser = {
  id: string
  displayName: string
  token: string
}

export type ApiUser = {
  user_id: string
  display_name: string
  online?: boolean
  last_seen?: string
}

export type ChatRoom = {
  id: string
  name: string
  description?: string
  initials: string
  recipientId: string
  conversationId: string
  isFriend?: boolean
  isGroup?: boolean
  memberIds?: string[]
  online?: boolean
  lastSeen?: string
  lastMessage?: string
  lastMessageAt?: string
  lastMessageTimeMs?: number
  lastMessageIsSelf?: boolean
  lastMessageReadAt?: string
  unreadCount?: number
}

export type ChatMessage = {
  sender: string
  senderId: string
  recipientId: string
  conversationId: string
  isSelf: boolean
  text: string
  attachmentUrl?: string
  attachmentName?: string
  attachmentType?: string
  attachmentSize?: number
  changePercent?: number | null
  sentAt: string
  readAt?: string
  isPending?: boolean
  gameType?: string
  gameId?: string
  gameAction?: string
  gameResponse?: string
}

export type VoiceCallState = {
  status: 'idle' | 'incoming' | 'calling' | 'connected'
  roomId: string
  peerId: string
  peerName: string
  isMuted: boolean
}
