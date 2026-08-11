import { getAdminApiUrl, getApiUrl } from './config/api'
import { currentUser } from './session'
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

const withAuth = (init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: {
    ...(currentUser.value?.token ? { Authorization: `Bearer ${currentUser.value.token}` } : {}),
    ...init.headers,
  },
})

const requestJson = async <T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, withAuth(init))
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

const requestOk = async (input: RequestInfo | URL, init?: RequestInit): Promise<void> => {
  const response = await fetch(input, withAuth(init))
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
}

const withUser = (path: string, userId?: string) => {
  const url = new URL(`${getApiUrl()}${path}`)
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

export type AuthResponse = {
  token: string
  user: ApiUser
}

const authenticate = (path: '/auth/register' | '/auth/login', displayName: string, password: string) =>
  requestJson<AuthResponse>(`${getApiUrl()}${path}`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ display_name: displayName, password }),
  })

export const registerAccount = (displayName: string, password: string) =>
  authenticate('/auth/register', displayName, password)

export const loginAccount = (displayName: string, password: string) =>
  authenticate('/auth/login', displayName, password)

export const fetchCurrentUser = () => requestJson<ApiUser>(`${getApiUrl()}/auth/me`)

export const logoutAccount = () => requestOk(`${getApiUrl()}/auth/logout`, { method: 'POST' })

export const createWebSocketTicket = () =>
  requestJson<{ ticket: string }>(`${getApiUrl()}/auth/ws-ticket`, { method: 'POST' })

export const fetchUsers = (userId = '') => requestJson<ApiUser[]>(withUser('/users', userId))

export const fetchFriends = (userId: string) => requestJson<FriendRecord[]>(withUser('/friends', userId))

export const addFriend = (payload: { userId: string; displayName: string }) =>
  requestJson<unknown>(`${getApiUrl()}/friends`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      user_id: payload.userId,
      display_name: payload.displayName,
    }),
  })

export const deleteFriend = (payload: { userId: string; friendId: string }) =>
  requestOk(`${getApiUrl()}/friends/delete`, {
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
  requestOk(`${getApiUrl()}/friend-requests`, {
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
  requestJson<GroupRecord>(`${getApiUrl()}/groups`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      user_id: payload.userId,
      name: payload.name,
      member_ids: payload.memberIds,
    }),
  })

export const leaveGroup = (payload: { userId: string; groupId: string }) =>
  requestOk(`${getApiUrl()}/groups/leave`, {
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
  requestJson<{ status: string; time: string }>(`${getApiUrl()}/health`, {
    method: 'GET',
  })

export const fetchAdminStats = (token?: string) =>
  requestJson<AdminStats>(`${getAdminApiUrl()}/admin/stats`, {
    headers: adminHeaders(token),
  })

export const fetchAdminUsers = (payload: { token?: string; q?: string; online?: boolean; limit?: number }) => {
  const url = new URL(`${getAdminApiUrl()}/admin/users`)
  if (payload.limit) url.searchParams.set('limit', String(payload.limit))
  if (payload.q) url.searchParams.set('q', payload.q)
  if (payload.online) url.searchParams.set('online', 'true')

  return requestJson<AdminUser[]>(url, {
    headers: adminHeaders(payload.token),
  })
}

export const deleteAdminUser = (payload: { token?: string; userId: string }) => {
  const url = new URL(`${getAdminApiUrl()}/admin/users`)
  url.searchParams.set('user_id', payload.userId)

  return requestOk(url, {
    method: 'DELETE',
    headers: adminHeaders(payload.token),
  })
}
