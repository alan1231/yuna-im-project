import { apiBaseUrl } from '../config/runtime'
import {
  createLocalUserId,
  normalizeConversation,
  normalizeFriend,
  normalizeMessage,
  normalizeUser,
} from '../models/chat'

export async function createUser(displayName) {
  const response = await fetch(`${apiBaseUrl}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const response = await fetch(url.toString())
  if (!response.ok) throw new Error('載入使用者失敗。')
  const users = await response.json()
  return users.map(normalizeUser).filter((user) => user.id && user.displayName)
}

export async function loadFriends(profile) {
  const url = new URL(`${apiBaseUrl}/friends`)
  url.searchParams.set('user_id', profile.id)
  const response = await fetch(url.toString())
  if (!response.ok) throw new Error('載入好友失敗。')
  const friends = await response.json()
  return friends.map((friend) => normalizeFriend(friend, profile))
}

export async function loadConversations(profile) {
  const url = new URL(`${apiBaseUrl}/conversations`)
  url.searchParams.set('user_id', profile.id)
  const response = await fetch(url.toString())
  if (!response.ok) throw new Error('載入聊天室失敗。')
  const conversations = await response.json()
  return conversations.map((conversation) =>
    normalizeConversation(conversation, profile),
  )
}

export async function loadMessages(profile, room) {
  const url = new URL(`${apiBaseUrl}/messages`)
  url.searchParams.set('user_id', profile.id)
  url.searchParams.set('conversation_id', room.conversationId)
  const response = await fetch(url.toString())
  if (!response.ok) throw new Error('載入訊息失敗。')
  const messages = await response.json()
  return messages.map(normalizeMessage)
}
