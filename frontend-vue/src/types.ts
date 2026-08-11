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

export type FriendRecord = {
  friend_id: string
  display_name: string
  online?: boolean
  last_seen?: string
}

export type FriendRequestRecord = {
  request_id: string
  from_user_id: string
  from_display_name: string
  to_user_id: string
  to_display_name: string
  status: string
  created_at: string
}

export type GroupRecord = {
  group_id: string
  name: string
  conversation_id: string
  member_ids?: string[]
  created_by?: string
  created_at?: string
}

export type ConversationRecord = {
  conversation_id: string
  recipient_id: string
  display_name: string
  last_message: string
  last_message_at?: string
  last_message_sender_id?: string
  last_message_read_at?: string
  is_friend?: boolean
  is_group?: boolean
  member_ids?: string[]
  unread_count?: number
}

export type ChatMessage = {
  sender?: string
  sender_id: string
  recipient_id: string
  conversation_id: string
  text?: string
  time?: string
  read_at?: string | null
  is_pending?: boolean
  pending_id?: string
  attachment_name?: string
  attachment_url?: string
  attachment_type?: string
  attachment_size?: number
  image_name?: string
  image_type?: string
  image_size?: number
  image_url?: string
  participant_ids?: string[]
  read_by?: string[]
}

export type AdminStats = {
  users_total: number
  users_online: number
  messages_total: number
  friend_requests_pending: number
  friends_total: number
  redis_online_keys: number
  checked_at: string
}

export type AdminUser = {
  user_id: string
  display_name: string
  created_at: string
  online: boolean
  last_seen: string
}
