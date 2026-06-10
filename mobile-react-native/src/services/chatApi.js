import { apiBaseUrl } from '../config/runtime'
import {
  createLocalUserId,
  normalizeConversation,
  normalizeFriend,
  normalizeFriendRequest,
  normalizeGroup,
  normalizeMessage,
  normalizeUser,
} from '../models/chat'

const jsonHeaders = {
  'Content-Type': 'application/json',
}

async function requestJson(input, init) {
  const response = await fetch(input, init)
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response.json()
}

async function requestOk(input, init) {
  const response = await fetch(input, init)
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
}

export async function createUser(displayName) {
  const response = await fetch(`${apiBaseUrl}/users`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      user_id: createLocalUserId(),
      display_name: displayName,
    }),
  })

  if (response.status === 409) throw new Error('這個顯示名稱已被使用。')
  if (!response.ok) throw new Error('建立帳號失敗。')
  const user = await response.json()
  return { id: user.user_id, displayName: user.display_name }
}

export async function loginByDisplayName(displayName) {
  const users = await loadUsers('')
  const user = users.find(
    (item) => item.displayName.toLowerCase() === displayName.toLowerCase(),
  )
  if (!user) throw new Error('找不到這個帳號。')
  return { id: user.id, displayName: user.displayName }
}

export async function loadUsers(currentUserId) {
  const url = new URL(`${apiBaseUrl}/users`)
  if (currentUserId) url.searchParams.set('user_id', currentUserId)
  const users = await requestJson(url.toString())
  return users.map(normalizeUser).filter((user) => user.id && user.displayName)
}

export async function loadFriends(profile) {
  const url = new URL(`${apiBaseUrl}/friends`)
  url.searchParams.set('user_id', profile.id)
  const friends = await requestJson(url.toString())
  return friends.map((friend) => normalizeFriend(friend, profile))
}

export async function addFriend(profile, displayName) {
  return requestJson(`${apiBaseUrl}/friends`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      user_id: profile.id,
      display_name: displayName,
    }),
  })
}

export async function deleteFriend(profile, friendId) {
  return requestOk(`${apiBaseUrl}/friends/delete`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      user_id: profile.id,
      friend_id: friendId,
    }),
  })
}

export async function loadGroups(profile) {
  const url = new URL(`${apiBaseUrl}/groups`)
  url.searchParams.set('user_id', profile.id)
  const groups = await requestJson(url.toString())
  return groups.map(normalizeGroup)
}

export async function createGroup(profile, payload) {
  const group = await requestJson(`${apiBaseUrl}/groups`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      user_id: profile.id,
      name: payload.name,
      member_ids: payload.memberIds,
    }),
  })
  return normalizeGroup(group)
}

export async function leaveGroup(profile, groupId) {
  return requestOk(`${apiBaseUrl}/groups/leave`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      user_id: profile.id,
      group_id: groupId,
    }),
  })
}

export async function loadConversations(profile) {
  const url = new URL(`${apiBaseUrl}/conversations`)
  url.searchParams.set('user_id', profile.id)
  const conversations = await requestJson(url.toString())
  return conversations.map((conversation) =>
    normalizeConversation(conversation, profile),
  )
}

export async function loadFriendRequests(profile) {
  const url = new URL(`${apiBaseUrl}/friend-requests`)
  url.searchParams.set('user_id', profile.id)
  const requests = await requestJson(url.toString())
  return requests.map(normalizeFriendRequest)
}

export async function respondFriendRequest(profile, requestId, accept) {
  return requestOk(`${apiBaseUrl}/friend-requests`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      user_id: profile.id,
      request_id: requestId,
      accept,
    }),
  })
}

export async function loadMessages(profile, room) {
  const url = new URL(`${apiBaseUrl}/messages`)
  url.searchParams.set('user_id', profile.id)
  url.searchParams.set('conversation_id', room.conversationId)
  const messages = await requestJson(url.toString())
  return messages.map(normalizeMessage)
}

export async function wakeBackend() {
  return requestJson(`${apiBaseUrl}/health`)
}
