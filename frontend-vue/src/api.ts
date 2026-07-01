import { API_URL } from './config/api'
import type {
  AdminStats,
  AdminUser,
  ApiUser,
  ChatMessage,
  ConversationRecord,
  FriendRequestRecord,
  FriendRecord,
  GroupRecord,
} from './types'

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

const withUser = (path: string, userId?: string) => {
  const url = new URL(`${API_URL}${path}`)
  if (userId) {
    url.searchParams.set('user_id', userId)
  }
  return url
}

const adminHeaders = (token?: string) => {
  if (!token) return undefined
  return {
    'X-Admin-Token': token,
  }
}

export const fetchUsers = (userId = '') => requestJson<ApiUser[]>(withUser('/users', userId))

export const createUser = (payload: { userId: string; displayName: string }) =>
  requestJson<ApiUser>(`${API_URL}/users`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      user_id: payload.userId,
      display_name: payload.displayName,
    }),
  })

export const fetchFriends = (userId: string) => requestJson<FriendRecord[]>(withUser('/friends', userId))

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

export const fetchFriendRequests = (userId: string) =>
  requestJson<FriendRequestRecord[]>(withUser('/friend-requests', userId))

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

export const fetchGroups = (userId: string) => requestJson<GroupRecord[]>(withUser('/groups', userId))

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
  requestJson<ConversationRecord[]>(withUser('/conversations', userId))

export const fetchMessages = (payload: { userId: string; conversationId: string }) => {
  const url = withUser('/messages', payload.userId)
  url.searchParams.set('conversation_id', payload.conversationId)
  return requestJson<ChatMessage[]>(url)
}

export const wakeBackend = () =>
  requestJson<{ status: string; time: string }>(`${API_URL}/health`, {
    method: 'GET',
  })

export const fetchAdminStats = (token?: string) =>
  requestJson<AdminStats>(`${API_URL}/admin/stats`, {
    headers: adminHeaders(token),
  })

export const fetchAdminUsers = (payload: { token?: string; q?: string; online?: boolean; limit?: number }) => {
  const url = new URL(`${API_URL}/admin/users`)
  if (payload.limit) url.searchParams.set('limit', String(payload.limit))
  if (payload.q) url.searchParams.set('q', payload.q)
  if (payload.online) url.searchParams.set('online', 'true')

  return requestJson<AdminUser[]>(url, {
    headers: adminHeaders(payload.token),
  })
}
