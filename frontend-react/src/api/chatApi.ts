import { API_URL } from '../config/api'
import type { ApiUser } from '../types/chat'

export const chatQueryKeys = {
  users: (userId = '') => ['users', userId] as const,
  friends: (userId: string) => ['friends', userId] as const,
  groups: (userId: string) => ['groups', userId] as const,
  conversations: (userId: string) => ['conversations', userId] as const,
  friendRequests: (userId: string) => ['friend-requests', userId] as const,
  messages: (userId: string, conversationId: string) => ['messages', userId, conversationId] as const,
}

const jsonHeaders = {
  'Content-Type': 'application/json',
}

const requestJson = async <T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init)
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

const requestOk = async (input: RequestInfo | URL, init?: RequestInit): Promise<void> => {
  const response = await fetch(input, init)
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
}

const urlWithUser = (path: string, userId?: string) => {
  const url = new URL(`${API_URL}${path}`)
  if (userId) {
    url.searchParams.set('user_id', userId)
  }
  return url
}

export type FriendRecord = {
  friend_id: string
  display_name: string
  online?: boolean
  last_seen?: string
}

export type GroupRecord = {
  group_id: string
  name: string
  conversation_id: string
  member_ids?: string[]
  created_by?: string
}

export type ConversationRecord = {
  recipient_id: string
  display_name: string
  conversation_id: string
  is_friend?: boolean
  is_group?: boolean
  member_ids?: string[]
  last_message?: string
  last_message_at?: string
  last_message_sender_id?: string
  last_message_read_at?: string
  unread_count?: number
}

export type FriendRequestRecord = {
  request_id: string
  from_display_name: string
}

export const fetchUsers = (userId = '') => requestJson<ApiUser[]>(urlWithUser('/users', userId))

export const createUser = (payload: { userId: string; displayName: string }) =>
  requestJson<ApiUser>(`${API_URL}/users`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      user_id: payload.userId,
      display_name: payload.displayName,
    }),
  })

export const fetchFriends = (userId: string) => requestJson<FriendRecord[]>(urlWithUser('/friends', userId))

export const addFriend = (payload: { userId: string; displayName: string }) =>
  requestJson<unknown>(`${API_URL}/friends`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      user_id: payload.userId,
      display_name: payload.displayName,
    }),
  })

export const deleteFriend = (payload: { userId: string; friendId: string }) =>
  requestOk(`${API_URL}/friends/delete`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      user_id: payload.userId,
      friend_id: payload.friendId,
    }),
  })

export const fetchGroups = (userId: string) => requestJson<GroupRecord[]>(urlWithUser('/groups', userId))

export const createGroup = (payload: { userId: string; name: string; memberIds: string[] }) =>
  requestJson<GroupRecord>(`${API_URL}/groups`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      user_id: payload.userId,
      name: payload.name,
      member_ids: payload.memberIds,
    }),
  })

export const leaveGroup = (payload: { userId: string; groupId: string }) =>
  requestOk(`${API_URL}/groups/leave`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      user_id: payload.userId,
      group_id: payload.groupId,
    }),
  })

export const fetchConversations = (userId: string) =>
  requestJson<ConversationRecord[]>(urlWithUser('/conversations', userId))

export const fetchMessages = (payload: { userId: string; conversationId: string }) => {
  const url = urlWithUser('/messages', payload.userId)
  url.searchParams.set('conversation_id', payload.conversationId)
  return requestJson<unknown[]>(url)
}

export const fetchFriendRequests = (userId: string) =>
  requestJson<FriendRequestRecord[]>(urlWithUser('/friend-requests', userId))

export const respondFriendRequest = (payload: { userId: string; requestId: string; accept: boolean }) =>
  requestOk(`${API_URL}/friend-requests`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      user_id: payload.userId,
      request_id: payload.requestId,
      accept: payload.accept,
    }),
  })

export const wakeBackend = () =>
  requestJson<{ status: string; time: string }>(`${API_URL}/health`, {
    method: 'GET',
  })
