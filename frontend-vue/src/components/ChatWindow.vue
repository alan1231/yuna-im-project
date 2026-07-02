<template>
  <section class="chat-page">
    <div class="chat-shell">
      <aside class="chat-sidebar">
        <div class="chat-sidebar-top">
          <div>
            <p class="eyebrow">{{ t('brand') }}</p>
            <h2>{{ t('chatTitle') }}</h2>
          </div>
          <button class="ghost-button" type="button" @click="emit('logout')">
            {{ t('logout') }}
          </button>
        </div>

        <p v-if="actionError" class="account-message account-message-error">
          {{ actionError }}
        </p>

        <div class="sidebar-more">
          <button type="button" class="sidebar-more-summary" @click="moreOpen = !moreOpen">
            <span>{{ t('more') }}</span>
            <span class="sidebar-more-icon">☰</span>
          </button>

          <div v-if="moreOpen" class="sidebar-more-panel">
            <div class="sidebar-more-menu">
              <button
                type="button"
                class="sidebar-more-option"
                :class="{ active: morePanel === 'friends' }"
                @click="morePanel = 'friends'"
              >
                <span>{{ t('friends') }}</span>
                <small>{{ friends.length }}</small>
              </button>
              <button
                type="button"
                class="sidebar-more-option"
                :class="{ active: morePanel === 'friendRequests' }"
                @click="morePanel = 'friendRequests'"
              >
                <span>{{ t('friendRequests') }}</span>
                <small>{{ friendRequests.length }}</small>
              </button>
              <button
                type="button"
                class="sidebar-more-option"
                :class="{ active: morePanel === 'addFriend' }"
                @click="morePanel = 'addFriend'"
              >
                <span>{{ t('addFriend') }}</span>
                <small>+</small>
              </button>
              <button
                type="button"
                class="sidebar-more-option"
                :class="{ active: morePanel === 'groups' }"
                @click="morePanel = 'groups'"
              >
                <span>{{ t('groups') }}</span>
                <small>{{ groups.length }}</small>
              </button>
              <button
                type="button"
                class="sidebar-more-option"
                :class="{ active: morePanel === 'createGroup' }"
                @click="morePanel = 'createGroup'"
              >
                <span>{{ t('createGroup') }}</span>
                <small>+</small>
              </button>
            </div>

            <div class="sidebar-more-card">
              <template v-if="morePanel === 'friends'">
                <div class="sidebar-section-head">
                  <h3>{{ t('friends') }}</h3>
                  <span class="muted-pill">{{ friends.length }}</span>
                </div>
                <div class="chip-row">
                  <span v-if="!friends.length" class="sidebar-empty">{{ t('noData') }}</span>
                </div>
                <div class="contact-list sidebar-scroll-list">
                  <div v-for="friend in friends" :key="friend.friend_id" class="contact-row">
                    <button type="button" class="contact-row-main" @click="selectFriendConversation(friend.friend_id)">
                      <span class="contact-title">
                        <strong>{{ friend.display_name }}</strong>
                        <span class="contact-meta">{{ friend.online ? t('online') : t('offline') }}</span>
                      </span>
                    </button>
                    <button type="button" class="contact-danger" @click="removeFriend(friend.friend_id)">
                      {{ t('delete') }}
                    </button>
                  </div>
                </div>
              </template>

              <template v-else-if="morePanel === 'friendRequests'">
                <div class="sidebar-section-head">
                  <h3>{{ t('friendRequests') }}</h3>
                  <span class="muted-pill">{{ friendRequests.length }}</span>
                </div>
                <div class="contact-list sidebar-scroll-list">
                  <div v-for="request in friendRequests" :key="request.request_id" class="contact-row">
                    <div class="contact-row-main contact-row-static">
                      <span class="contact-title">
                        <strong>{{ request.from_display_name }}</strong>
                        <span class="contact-meta">{{ request.from_user_id }}</span>
                      </span>
                      <span class="contact-meta">{{ formatConversationTime(request.created_at) }}</span>
                    </div>
                    <div class="contact-actions">
                      <button type="button" class="ghost-button contact-action" @click="respondToRequest(request.request_id, true)">
                        {{ t('accept') }}
                      </button>
                      <button type="button" class="ghost-button contact-action" @click="respondToRequest(request.request_id, false)">
                        {{ t('reject') }}
                      </button>
                    </div>
                  </div>
                  <span v-if="!friendRequests.length" class="sidebar-empty">{{ t('noData') }}</span>
                </div>
              </template>

              <template v-else-if="morePanel === 'addFriend'">
                <div class="sidebar-section-head">
                  <h3>{{ t('addFriend') }}</h3>
                </div>
                <form class="inline-form" @submit.prevent="submitFriend">
                  <input v-model="friendName" :placeholder="t('addFriendPlaceholder')" :disabled="isActionPending" />
                  <button class="primary-button" type="submit" :disabled="isActionPending || !friendName.trim()">
                    {{ t('addFriendSubmit') }}
                  </button>
                </form>
              </template>

              <template v-else-if="morePanel === 'groups'">
                <div class="sidebar-section-head">
                  <h3>{{ t('groups') }}</h3>
                  <span class="muted-pill">{{ groups.length }}</span>
                </div>
                <div class="contact-list sidebar-scroll-list">
                  <div v-for="group in groups" :key="group.group_id" class="contact-row">
                    <button type="button" class="contact-row-main" @click="selectConversation(group.conversation_id)">
                      <span class="contact-title">
                        <strong>{{ group.name }}</strong>
                        <span class="contact-meta">{{ group.member_ids?.length ?? 0 }} members</span>
                      </span>
                      <span class="contact-meta">{{ group.group_id }}</span>
                    </button>
                    <button type="button" class="contact-danger" @click="leaveExistingGroup(group.group_id)">
                      {{ t('leave') }}
                    </button>
                  </div>
                  <span v-if="!groups.length" class="sidebar-empty">{{ t('noData') }}</span>
                </div>
              </template>

              <template v-else-if="morePanel === 'createGroup'">
                <div class="sidebar-section-head">
                  <h3>{{ t('createGroup') }}</h3>
                </div>
                <form class="stack-form" @submit.prevent="submitGroup">
                  <input v-model="groupName" :placeholder="t('groupNamePlaceholder')" :disabled="isActionPending" />
                  <div class="member-picker">
                    <label v-for="user in availableUsers" :key="user.user_id" class="member-option">
                      <input
                        :checked="selectedGroupMemberIds.includes(user.user_id)"
                        type="checkbox"
                        :disabled="isActionPending"
                        @change="toggleGroupMember(user.user_id)"
                      />
                      <span>{{ user.display_name }}</span>
                    </label>
                  </div>
                  <button class="primary-button" type="submit" :disabled="isActionPending || !groupName.trim() || !selectedGroupMemberIds.length">
                    {{ t('createGroupSubmit') }}
                  </button>
                </form>
              </template>
            </div>
          </div>
        </div>

        <div class="sidebar-section sidebar-section-scroll">
          <div class="sidebar-section-head">
            <h3>{{ t('conversations') }}</h3>
            <span class="connection-pill" :data-state="connectionState">{{ connectionLabel }}</span>
          </div>

          <div class="conversation-list sidebar-scroll-list">
            <button
              v-for="conversation in allConversations"
              :key="conversation.conversation_id"
              type="button"
              class="conversation-item"
              :class="{ active: conversation.conversation_id === selectedConversationId }"
              @click="selectConversation(conversation.conversation_id)"
            >
              <div class="conversation-avatar">
                {{ initials(conversation.display_name) }}
              </div>
              <div class="conversation-copy">
                <div class="conversation-title-row">
                  <strong>{{ conversation.display_name }}</strong>
                  <span>{{ formatConversationTime(conversation.last_message_at) }}</span>
                </div>
                <p>{{ conversation.last_message || t('emptyConversation') }}</p>
              </div>
              <span v-if="conversation.unread_count" class="unread-badge">{{ conversation.unread_count }}</span>
            </button>

            <p v-if="!conversations.length" class="sidebar-empty">{{ t('noData') }}</p>
          </div>
        </div>
      </aside>

      <main class="chat-main">
        <template v-if="selectedConversation">
          <header class="chat-header">
            <div>
              <p class="eyebrow">
                {{ selectedConversation.is_group ? t('groups') : t('chatTitle') }}
              </p>
              <h2>{{ selectedConversation.display_name }}</h2>
              <p class="chat-header-meta">{{ selectedConversation.last_message || t('emptyConversation') }}</p>
            </div>
            <div class="chat-header-actions">
              <span class="muted-pill">{{ selectedConversation.is_group ? 'Group' : 'Direct' }}</span>
              <button
                v-if="canStartVoiceCall(selectedConversation)"
                class="ghost-button"
                type="button"
                @click="startVoiceCall"
              >
                {{ t('voiceCall') }}
              </button>
              <button v-if="selectedConversation.is_group" class="ghost-button" type="button" @click="leaveCurrentGroup">
                {{ t('leave') }}
              </button>
              <button class="ghost-button" type="button" @click="refreshCurrentConversation">
                {{ t('refresh') }}
              </button>
            </div>
          </header>

          <div v-if="voiceCall.status !== 'idle'" class="voice-call-bar">
            <audio ref="remoteAudioElement" class="voice-call-audio" autoplay playsinline />
            <div class="voice-call-text">
              <span>{{ t('voiceCall') }}</span>
              <strong>{{ voiceStatusText }}</strong>
            </div>
            <div class="voice-call-actions">
              <template v-if="voiceCall.status === 'incoming'">
                <button type="button" class="voice-accept-button" @click="acceptVoiceCall">
                  {{ t('voiceAccept') }}
                </button>
                <button type="button" class="voice-end-button" @click="rejectVoiceCall">
                  {{ t('voiceReject') }}
                </button>
              </template>
              <template v-else>
                <button v-if="voiceCall.status === 'connected'" type="button" class="voice-secondary-button" @click="toggleVoiceMute">
                  {{ voiceCall.isMuted ? t('voiceUnmute') : t('voiceMute') }}
                </button>
                <button type="button" class="voice-end-button" @click="endVoiceCall">
                  {{ t('voiceEnd') }}
                </button>
              </template>
            </div>
          </div>

          <section ref="messagesViewport" class="message-list">
            <article
              v-for="message in messages"
              :key="message.time + message.sender_id + (message.text || '')"
              class="message-bubble"
              :class="{ self: message.sender_id === currentUser.id }"
            >
              <div class="message-meta">
                <strong>{{ displayNameFor(message.sender_id) }}</strong>
                <span>{{ formatMessageTime(message.time) }}</span>
              </div>
              <template v-if="messageAttachmentUrl(message)">
                <a
                  v-if="isImageAttachment(message)"
                  class="message-image-link"
                  :href="messageAttachmentUrl(message)"
                  target="_blank"
                  rel="noreferrer"
                  @click.prevent="openImagePreview(message)"
                >
                  <img class="message-image" :src="messageAttachmentUrl(message)" :alt="messageAttachmentLabel(message)" />
                </a>
                <a
                  v-else
                  class="message-file-link"
                  :href="messageAttachmentUrl(message)"
                  target="_blank"
                  rel="noreferrer"
                  :download="messageAttachmentLabel(message)"
                >
                  <span class="message-file-icon" aria-hidden="true">+</span>
                  <span>{{ messageAttachmentLabel(message) }}</span>
                </a>
              </template>
              <p v-if="message.text">{{ message.text }}</p>
              <p v-else-if="!messageAttachmentUrl(message)">...</p>
            </article>

            <div v-if="!messages.length" class="message-empty">
              {{ t('emptyConversation') }}
            </div>
          </section>

          <form
            class="composer"
            :class="{ 'composer-dragging': isDraggingFile }"
            @submit.prevent="sendMessage"
            @dragenter.prevent="handleDragEnter"
            @dragover.prevent="handleDragOver"
            @dragleave.prevent="handleDragLeave"
            @drop.prevent="handleDrop"
            >
            <div class="composer-input-stack">
              <div v-if="fileAttachment" class="file-attachment-preview">
                <img
                  v-if="fileAttachment.type.startsWith('image/')"
                  :src="fileAttachment.url"
                  :alt="fileAttachment.name || t('pendingImage')"
                />
                <span v-else class="file-attachment-icon" aria-hidden="true">+</span>
                <span class="file-attachment-copy">
                  <strong>{{ fileAttachment.name || t('file') }}</strong>
                  <small>{{ formatFileSize(fileAttachment.size) }}</small>
                </span>
                <button
                  type="button"
                  class="file-attachment-remove"
                  :aria-label="t('removeFile')"
                  :title="t('removeFile')"
                  @click="clearFileAttachment"
                >
                  ×
                </button>
              </div>

              <p v-if="fileError" class="composer-error">{{ fileError }}</p>
              <p v-else-if="isProcessingFile" class="composer-status">{{ t('processingFile') }}</p>

              <input
                v-model="draft"
                class="composer-input"
                :placeholder="t('messagePlaceholder')"
                :disabled="isSending || isProcessingFile"
                @keydown.enter.exact.prevent="sendMessage"
              />
            </div>
            <input ref="fileInput" class="composer-file-input" type="file" @change="handleFileChange" />
            <button
              type="button"
              class="ghost-button composer-file-button"
              :disabled="isSending || isProcessingFile"
              :aria-label="t('chooseFile')"
              :title="t('chooseFile')"
              @click="openFilePicker"
            >
              +
            </button>
            <button class="primary-button" type="submit" :disabled="isSending || isProcessingFile || (!draft.trim() && !fileAttachment)">
              {{ isSending ? t('working') : t('send') }}
            </button>
          </form>
        </template>

        <div v-else class="empty-state">
          <div class="empty-card">
            <p class="eyebrow">{{ t('brand') }}</p>
            <h2>{{ t('emptyConversation') }}</h2>
            <p>
              選擇左側任一對話，Vue 版會透過既有 WebSocket 與 `/messages` API 載入歷史與即時更新。
            </p>
          </div>
        </div>
      </main>
    </div>

    <div
      v-if="imagePreview"
      class="image-preview-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="imagePreview.label"
      tabindex="0"
      @click.self="closeImagePreview"
      @keydown.esc="closeImagePreview"
    >
      <button
        type="button"
        class="image-preview-close"
        :aria-label="t('close')"
        :title="t('close')"
        @click="closeImagePreview"
      >
        ×
      </button>
      <img class="image-preview-full" :src="imagePreview.url" :alt="imagePreview.label" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  addFriend,
  createGroup,
  deleteFriend,
  fetchConversations,
  fetchFriendRequests,
  fetchFriends,
  fetchGroups,
  fetchMessages,
  fetchUsers,
  leaveGroup,
  respondFriendRequest,
} from '../api'
import { getWsUrl } from '../config/api'
import { useI18n } from '../i18n'
import type {
  ApiUser,
  ChatMessage,
  ConversationRecord,
  CurrentUser,
  FriendRecord,
  FriendRequestRecord,
  GroupRecord,
} from '../types'

const VOICE_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

const props = defineProps<{
  currentUser: CurrentUser
}>()

const emit = defineEmits<{
  (event: 'logout'): void
}>()

const { t } = useI18n()
const conversations = ref<ConversationRecord[]>([])
const friends = ref<FriendRecord[]>([])
const groups = ref<GroupRecord[]>([])
const users = ref<ApiUser[]>([])
const messages = ref<ChatMessage[]>([])
const friendRequests = ref<FriendRequestRecord[]>([])
const draft = ref('')
const friendName = ref('')
const groupName = ref('')
const selectedGroupMemberIds = ref<string[]>([])
const selectedConversationId = ref('')
const pendingDirectConversation = ref<ConversationRecord | null>(null)
const fileAttachment = ref<{
  url: string
  name: string
  type: string
  size: number
} | null>(null)
const imagePreview = ref<{ url: string; label: string } | null>(null)
const isLoading = ref(true)
const isSending = ref(false)
const isActionPending = ref(false)
const isProcessingFile = ref(false)
const connectionState = ref<'idle' | 'connecting' | 'open' | 'error'>('idle')
const moreOpen = ref(false)
const morePanel = ref<'friends' | 'friendRequests' | 'addFriend' | 'groups' | 'createGroup'>('friends')
const messagesViewport = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const remoteAudioElement = ref<HTMLAudioElement | null>(null)
const actionError = ref('')
const fileError = ref('')
const isDraggingFile = ref(false)
const voiceCall = ref({
  status: 'idle' as 'idle' | 'incoming' | 'calling' | 'connected',
  roomId: '',
  peerId: '',
  peerName: '',
  isMuted: false,
})
const ringtoneRef = ref<{
  audioContext: AudioContext | null
  intervalId: number | null
  gain: GainNode | null
  nodes: OscillatorNode[]
}>({
  audioContext: null,
  intervalId: null,
  gain: null,
  nodes: [],
})
const peerConnectionRef = ref<RTCPeerConnection | null>(null)
const localStreamRef = ref<MediaStream | null>(null)
const pendingOfferRef = ref<any | null>(null)
let socket: WebSocket | null = null

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 1600
const MIN_IMAGE_QUALITY = 0.55

const connectionLabel = computed(() => {
  switch (connectionState.value) {
    case 'connecting':
      return 'Connecting'
    case 'open':
      return 'Live'
    case 'error':
      return 'Offline'
    default:
      return 'Idle'
  }
})

const allConversations = computed(() => conversations.value)

const selectedConversation = computed(
  () =>
    allConversations.value.find((conversation) => conversation.conversation_id === selectedConversationId.value) ??
    pendingDirectConversation.value ??
    null,
)

const usersById = computed(() => {
  const map = new Map<string, string>()
  map.set(props.currentUser.id, props.currentUser.displayName)
  users.value.forEach((user) => map.set(user.user_id, user.display_name))
  friends.value.forEach((friend) => map.set(friend.friend_id, friend.display_name))
  groups.value.forEach((group) => map.set(group.group_id, group.name))
  return map
})

const availableUsers = computed(() => users.value)

const canStartVoiceCall = (room: ConversationRecord | null) =>
  Boolean(room && !room.is_group && voiceCall.value.status === 'idle')

const voiceStatusText = computed(() => {
  switch (voiceCall.value.status) {
    case 'incoming':
      return t('voiceIncoming', { name: voiceCall.value.peerName })
    case 'calling':
      return t('voiceCalling', { name: voiceCall.value.peerName })
    case 'connected':
      return t('voiceConnected', { name: voiceCall.value.peerName })
    default:
      return ''
  }
})

const conversationIdFor = (a: string, b: string) => {
  return `dm:${[a, b].map((value) => value.trim()).sort().join(':')}`
}

const findConversationIdForFriend = (friendId: string) =>
  allConversations.value.find((conversation) => conversation.conversation_id === conversationIdFor(props.currentUser.id, friendId))?.conversation_id || ''

const buildDirectConversation = (friendId: string, displayName: string) => {
  const conversationId = conversationIdFor(props.currentUser.id, friendId)
  return {
    conversation_id: conversationId,
    recipient_id: friendId,
    display_name: displayName,
    last_message: '',
    is_friend: true,
    is_group: false,
  } satisfies ConversationRecord
}

const conversationForId = (conversationId: string) => {
  const existing = allConversations.value.find((conversation) => conversation.conversation_id === conversationId)
  if (existing) return existing
  if (pendingDirectConversation.value?.conversation_id === conversationId) return pendingDirectConversation.value

  if (conversationId.startsWith('dm:')) {
    const [a, b] = conversationId.slice(3).split(':')
    const otherId = a === props.currentUser.id ? b : a
    const friend = friends.value.find((item) => item.friend_id === otherId)
    const user = users.value.find((item) => item.user_id === otherId)
    const displayName = friend?.display_name || user?.display_name || otherId || t('emptyConversation')
    return buildDirectConversation(otherId || '', displayName)
  }

  return null
}

const initials = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/)
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : trimmed.slice(0, 2).toUpperCase()
}

const formatTime = (value?: string, options?: Intl.DateTimeFormatOptions) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, options).format(date)
}

const formatConversationTime = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const sameDay = new Date().toDateString() === date.toDateString()
  return sameDay
    ? formatTime(value, { hour: '2-digit', minute: '2-digit' })
    : formatTime(value, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const formatMessageTime = (value?: string) => formatTime(value, { hour: '2-digit', minute: '2-digit' })

const displayNameFor = (userId: string) => usersById.value.get(userId) || userId

const formatFileSize = (size?: number) => {
  if (!size) return ''
  const sizeKb = size / 1024
  if (sizeKb < 1024) return `${Math.round(sizeKb)} KB`
  return `${(sizeKb / 1024).toFixed(1)} MB`
}

const messageAttachmentUrl = (message: ChatMessage) => message.attachment_url || message.image_url || ''
const messageAttachmentType = (message: ChatMessage) => message.attachment_type || message.image_type || ''
const messageAttachmentLabel = (message: ChatMessage) => message.attachment_name || message.image_name || t('file')
const isImageAttachment = (message: ChatMessage) => messageAttachmentType(message).startsWith('image/')

const openImagePreview = (message: ChatMessage) => {
  const url = messageAttachmentUrl(message)
  if (!url) return
  imagePreview.value = {
    url,
    label: messageAttachmentLabel(message),
  }
}

const closeImagePreview = () => {
  imagePreview.value = null
}

const sendVoiceSignal = (type: 'voice_offer' | 'voice_answer' | 'voice_ice' | 'voice_reject' | 'voice_end', payload: Record<string, unknown>) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false
  socket.send(
    JSON.stringify({
      type,
      sender: props.currentUser.displayName,
      sender_id: props.currentUser.id,
      ...payload,
    }),
  )
  return true
}

const stopIncomingRingtone = () => {
  const ringtone = ringtoneRef.value
  if (ringtone.intervalId) {
    window.clearInterval(ringtone.intervalId)
  }
  ringtone.nodes.forEach((node) => {
    try {
      node.stop()
    } catch {
      // Ignore stop errors when nodes are already finished.
    }
  })
  ringtone.audioContext?.close().catch(() => {})
  ringtoneRef.value = {
    audioContext: null,
    intervalId: null,
    gain: null,
    nodes: [],
  }
}

const startIncomingRingtone = () => {
  if (ringtoneRef.value.intervalId) return
  const AudioContextCtor =
    window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) return

  const audioContext = new AudioContextCtor()
  const gain = audioContext.createGain()
  gain.gain.value = 0.035
  gain.connect(audioContext.destination)

  const playTone = () => {
    const now = audioContext.currentTime
    const nodes: OscillatorNode[] = []

    ;[0, 0.38].forEach((offset) => {
      const oscillator = audioContext.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(660, now + offset)
      oscillator.frequency.exponentialRampToValueAtTime(880, now + offset + 0.18)
      oscillator.connect(gain)
      oscillator.start(now + offset)
      oscillator.stop(now + offset + 0.28)
      nodes.push(oscillator)
    })

    ringtoneRef.value.nodes = nodes
  }

  ringtoneRef.value = {
    audioContext,
    intervalId: window.setInterval(playTone, 1600),
    gain,
    nodes: [],
  }

  audioContext.resume().then(playTone).catch(() => {
    stopIncomingRingtone()
  })
}

const cleanupVoiceCall = () => {
  stopIncomingRingtone()
  peerConnectionRef.value?.close()
  peerConnectionRef.value = null
  localStreamRef.value?.getTracks().forEach((track) => track.stop())
  localStreamRef.value = null
  pendingOfferRef.value = null
  if (remoteAudioElement.value) {
    remoteAudioElement.value.srcObject = null
  }
}

const createPeerConnection = (room: ConversationRecord) => {
  const peer = new RTCPeerConnection({ iceServers: VOICE_ICE_SERVERS })
  peer.onicecandidate = (event) => {
    if (event.candidate) {
      sendVoiceSignal('voice_ice', {
        recipient_id: room.recipient_id,
        conversation_id: room.conversation_id,
        candidate: event.candidate.toJSON(),
      })
    }
  }
  peer.ontrack = (event) => {
    const [stream] = event.streams
    if (remoteAudioElement.value && stream) {
      remoteAudioElement.value.srcObject = stream
      remoteAudioElement.value.play().catch(() => {})
    }
  }
  peer.onconnectionstatechange = () => {
    if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) {
      cleanupVoiceCall()
      voiceCall.value = {
        status: 'idle',
        roomId: '',
        peerId: '',
        peerName: '',
        isMuted: false,
      }
    }
  }
  peerConnectionRef.value = peer
  return peer
}

const ensureLocalAudioStream = async () => {
  if (localStreamRef.value) return localStreamRef.value
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  localStreamRef.value = stream
  return stream
}

const findRoomForVoiceSignal = (payload: { conversation_id?: string; sender_id?: string }) => {
  return allConversations.value.find((room) => room.conversation_id === payload.conversation_id || room.recipient_id === payload.sender_id) || null
}

const handleVoiceOffer = (payload: { conversation_id?: string; sender_id?: string; offer?: RTCSessionDescriptionInit }) => {
  const room = findRoomForVoiceSignal(payload)
  if (!room || room.is_group) return
  if (voiceCall.value.status !== 'idle') return

  pendingOfferRef.value = payload
  startIncomingRingtone()
  voiceCall.value = {
    status: 'incoming',
    roomId: room.conversation_id,
    peerId: payload.sender_id || room.recipient_id,
    peerName: room.display_name,
    isMuted: false,
  }
}

const handleVoiceAnswer = async (payload: { answer?: RTCSessionDescriptionInit }) => {
  const peer = peerConnectionRef.value
  if (!peer || !payload.answer) return

  await peer.setRemoteDescription(new RTCSessionDescription(payload.answer))
  voiceCall.value = {
    ...voiceCall.value,
    status: 'connected',
  }
}

const handleVoiceIce = async (payload: { candidate?: RTCIceCandidateInit }) => {
  const peer = peerConnectionRef.value
  if (!peer || !payload.candidate) return

  try {
    await peer.addIceCandidate(new RTCIceCandidate(payload.candidate))
  } catch (error) {
    console.error('Failed to add voice ICE candidate:', error)
  }
}

const handleVoiceEnd = () => {
  cleanupVoiceCall()
  voiceCall.value = {
    status: 'idle',
    roomId: '',
    peerId: '',
    peerName: '',
    isMuted: false,
  }
}

const startVoiceCall = async () => {
  const room = selectedConversation.value
  if (!room || room.is_group || voiceCall.value.status !== 'idle') return

  try {
    cleanupVoiceCall()
    const stream = await ensureLocalAudioStream()
    const peer = createPeerConnection(room)
    stream.getTracks().forEach((track) => peer.addTrack(track, stream))
    const offer = await peer.createOffer()
    await peer.setLocalDescription(offer)
    const sent = sendVoiceSignal('voice_offer', {
      recipient_id: room.recipient_id,
      conversation_id: room.conversation_id,
      offer,
    })
    if (!sent) {
      cleanupVoiceCall()
      return
    }

    voiceCall.value = {
      status: 'calling',
      roomId: room.conversation_id,
      peerId: room.recipient_id,
      peerName: room.display_name,
      isMuted: false,
    }
  } catch (error) {
    console.error('Start voice call failed:', error)
    cleanupVoiceCall()
    actionError.value = t('voiceStartFailed')
  }
}

const acceptVoiceCall = async () => {
  const offer = pendingOfferRef.value as { conversation_id?: string; sender_id?: string; offer?: RTCSessionDescriptionInit } | null
  const room = offer ? findRoomForVoiceSignal(offer) : null
  if (!offer || !room || !offer.offer) return

  try {
    cleanupVoiceCall()
    const stream = await ensureLocalAudioStream()
    const peer = createPeerConnection(room)
    stream.getTracks().forEach((track) => peer.addTrack(track, stream))
    await peer.setRemoteDescription(new RTCSessionDescription(offer.offer))
    const answer = await peer.createAnswer()
    await peer.setLocalDescription(answer)
    const sent = sendVoiceSignal('voice_answer', {
      recipient_id: room.recipient_id,
      conversation_id: room.conversation_id,
      answer,
    })
    if (!sent) {
      cleanupVoiceCall()
      actionError.value = t('voiceStartFailed')
      return
    }
    pendingOfferRef.value = null
    voiceCall.value = {
      status: 'connected',
      roomId: room.conversation_id,
      peerId: room.recipient_id,
      peerName: room.display_name,
      isMuted: false,
    }
  } catch (error) {
    console.error('Accept voice call failed:', error)
    cleanupVoiceCall()
    actionError.value = t('voiceStartFailed')
  }
}

const rejectVoiceCall = () => {
  const offer = pendingOfferRef.value as { conversation_id?: string; sender_id?: string } | null
  const room = offer ? findRoomForVoiceSignal(offer) : null
  if (room) {
    sendVoiceSignal('voice_reject', {
      recipient_id: room.recipient_id,
      conversation_id: room.conversation_id,
    })
  }
  handleVoiceEnd()
}

const endVoiceCall = () => {
  const room = allConversations.value.find((item) => item.conversation_id === voiceCall.value.roomId)
  if (room) {
    sendVoiceSignal('voice_end', {
      recipient_id: room.recipient_id,
      conversation_id: room.conversation_id,
    })
  }
  handleVoiceEnd()
}

const toggleVoiceMute = () => {
  const nextMuted = !voiceCall.value.isMuted
  localStreamRef.value?.getAudioTracks().forEach((track) => {
    track.enabled = !nextMuted
  })
  voiceCall.value = {
    ...voiceCall.value,
    isMuted: nextMuted,
  }
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('file read failed'))
    reader.readAsDataURL(blob)
  })

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image load failed'))
    image.src = url
  })

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }
      reject(new Error('canvas export failed'))
    }, type, quality)
  })

const compressedImageName = (name: string) => {
  const baseName = name.replace(/\.[^.]+$/, '') || 'image'
  return `${baseName}.jpg`
}

const openFilePicker = () => {
  fileError.value = ''
  fileInput.value?.click()
}

const isFileDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types || []).includes('Files')

const handleDragEnter = (event: DragEvent) => {
  if (!isFileDrag(event)) return
  isDraggingFile.value = true
}

const handleDragOver = (event: DragEvent) => {
  if (!isFileDrag(event)) return
  isDraggingFile.value = true
}

const handleDragLeave = (event: DragEvent) => {
  if (!isFileDrag(event)) return
  isDraggingFile.value = false
}

const handleDrop = (event: DragEvent) => {
  isDraggingFile.value = false
  void readAttachmentFile(event.dataTransfer?.files?.[0])
}

const clearFileAttachment = () => {
  fileAttachment.value = null
  fileError.value = ''
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const attachBlob = async (blob: Blob, name: string, type: string, compressed = false) => {
  const url = await blobToDataUrl(blob)
  fileError.value = compressed ? t('imageCompressed') : ''
  fileAttachment.value = {
    url,
    name,
    type,
    size: blob.size,
  }
}

const compressImageFile = async (file: File) => {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))

    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas context unavailable')

    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    let quality = 0.86
    let blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    while (blob.size > MAX_FILE_SIZE_BYTES && quality > MIN_IMAGE_QUALITY) {
      quality -= 0.08
      blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    }

    return blob
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const readAttachmentFile = async (file?: File) => {
  if (!file) return
  isProcessingFile.value = true
  fileError.value = ''

  try {
    if (file.size <= MAX_FILE_SIZE_BYTES) {
      await attachBlob(file, file.name, file.type)
      return
    }

    if (!file.type.startsWith('image/')) {
      fileError.value = t('fileTooLarge')
      return
    }

    const compressedBlob = await compressImageFile(file)
    if (compressedBlob.size > MAX_FILE_SIZE_BYTES) {
      fileError.value = t('imageStillTooLarge')
      return
    }

    await attachBlob(compressedBlob, compressedImageName(file.name), compressedBlob.type || 'image/jpeg', true)
  } catch (error) {
    console.error('File processing failed:', error)
    fileError.value = t('fileProcessFailed')
  } finally {
    isProcessingFile.value = false
  }
}

const handleFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  void readAttachmentFile(input.files?.[0])
  input.value = ''
}

const setActionError = (message: string) => {
  actionError.value = message
}

const clearActionState = () => {
  actionError.value = ''
}

const closeSocket = () => {
  if (!socket) return
  socket.onopen = null
  socket.onclose = null
  socket.onerror = null
  socket.onmessage = null
  socket.close()
  socket = null
  if (connectionState.value !== 'error') {
    connectionState.value = 'idle'
  }
}

const loadMessages = async (conversationId: string) => {
  const records = await fetchMessages({
    userId: props.currentUser.id,
    conversationId,
  })
  messages.value = records
  await nextTick()
  if (messagesViewport.value) {
    messagesViewport.value.scrollTop = messagesViewport.value.scrollHeight
  }
}

const connectSocket = (conversation: ConversationRecord) => {
  closeSocket()
  const url = new URL(`${getWsUrl()}/ws`)
  url.searchParams.set('user_id', props.currentUser.id)
  url.searchParams.set('conversation_id', conversation.conversation_id)

  connectionState.value = 'connecting'
  socket = new WebSocket(url.toString())

  socket.onopen = () => {
    connectionState.value = 'open'
    socket?.send(
      JSON.stringify({
        type: 'active_conversation',
        conversation_id: conversation.conversation_id,
      }),
    )
  }

  socket.onerror = () => {
    connectionState.value = 'error'
  }

  socket.onclose = () => {
    if (connectionState.value !== 'error') {
      connectionState.value = 'idle'
    }
  }

  socket.onmessage = async (event) => {
    try {
      const payload = JSON.parse(event.data) as { type?: string; payload?: { conversation_id?: string } }
      const eventPayload = (payload.payload || {}) as {
        conversation_id?: string
        sender_id?: string
        offer?: RTCSessionDescriptionInit
        answer?: RTCSessionDescriptionInit
        candidate?: RTCIceCandidateInit
      }
      if (
        payload.type === 'message' ||
        payload.type === 'read_receipt' ||
        payload.type === 'friend_added' ||
        payload.type === 'group_added' ||
        payload.type === 'friend_request'
      ) {
        await refreshAll()
        if (eventPayload.conversation_id === conversation.conversation_id || payload.type === 'message') {
          await loadMessages(conversation.conversation_id)
        }
      } else if (payload.type === 'voice_offer') {
        handleVoiceOffer(eventPayload)
      } else if (payload.type === 'voice_answer') {
        await handleVoiceAnswer(eventPayload)
      } else if (payload.type === 'voice_ice') {
        await handleVoiceIce(eventPayload)
      } else if (payload.type === 'voice_reject' || payload.type === 'voice_end') {
        handleVoiceEnd()
      }
    } catch {
      await refreshAll()
    }
  }
}

const refreshAll = async () => {
  try {
    const [usersResult, friendsResult, friendRequestsResult, groupsResult, conversationsResult] = await Promise.allSettled([
      fetchUsers(props.currentUser.id),
      fetchFriends(props.currentUser.id),
      fetchFriendRequests(props.currentUser.id),
      fetchGroups(props.currentUser.id),
      fetchConversations(props.currentUser.id),
    ])

    if (usersResult.status === 'fulfilled') users.value = usersResult.value
    if (friendsResult.status === 'fulfilled') friends.value = friendsResult.value
    if (friendRequestsResult.status === 'fulfilled') friendRequests.value = friendRequestsResult.value
    if (groupsResult.status === 'fulfilled') groups.value = groupsResult.value
    if (conversationsResult.status === 'fulfilled') conversations.value = conversationsResult.value

    if (!selectedConversationId.value && conversations.value.length > 0) {
      selectedConversationId.value = conversations.value[0].conversation_id
    }
    if (!selectedConversationId.value) {
      selectedConversationId.value = ''
    }
    if (pendingDirectConversation.value && !conversations.value.some((item) => item.conversation_id === pendingDirectConversation.value?.conversation_id)) {
      const recipientId = pendingDirectConversation.value.recipient_id
      const friend = friends.value.find((item) => item.friend_id === recipientId)
      const user = users.value.find((item) => item.user_id === recipientId)
      const displayName = friend?.display_name || user?.display_name || recipientId
      pendingDirectConversation.value = buildDirectConversation(recipientId, displayName)
    }
  } finally {
    isLoading.value = false
  }
}

const refreshCurrentConversation = async () => {
  await refreshAll()
  if (selectedConversationId.value) {
    await loadMessages(selectedConversationId.value)
  }
}

const selectConversation = (conversationId: string) => {
  if (!conversationId) return
  moreOpen.value = false
  pendingDirectConversation.value = null
  selectedConversationId.value = conversationId
  clearFileAttachment()
}

const selectFriendConversation = (friendId: string) => {
  moreOpen.value = false
  const conversationId = findConversationIdForFriend(friendId) || conversationIdFor(props.currentUser.id, friendId)
  const friend = friends.value.find((item) => item.friend_id === friendId)
  const user = users.value.find((item) => item.user_id === friendId)
  pendingDirectConversation.value = buildDirectConversation(friendId, friend?.display_name || user?.display_name || friendId)
  selectedConversationId.value = conversationId
  clearFileAttachment()
}

const submitFriend = async () => {
  const name = friendName.value.trim()
  if (!name || isActionPending.value) return

  isActionPending.value = true
  clearActionState()
  try {
    await addFriend({
      userId: props.currentUser.id,
      displayName: name,
    })
    friendName.value = ''
    moreOpen.value = false
    await refreshAll()
  } catch (error) {
    console.error('Add friend failed:', error)
    setActionError(t('errorAddFriend'))
  } finally {
    isActionPending.value = false
  }
}

const removeFriend = async (friendId: string) => {
  if (!friendId || isActionPending.value) return

  isActionPending.value = true
  clearActionState()
  try {
    await deleteFriend({
      userId: props.currentUser.id,
      friendId,
    })
    await refreshAll()
  } catch (error) {
    console.error('Delete friend failed:', error)
    setActionError(t('errorDeleteFriend'))
  } finally {
    isActionPending.value = false
  }
}

const respondToRequest = async (requestId: string, accept: boolean) => {
  if (!requestId || isActionPending.value) return

  isActionPending.value = true
  clearActionState()
  try {
    await respondFriendRequest({
      userId: props.currentUser.id,
      requestId,
      accept,
    })
    await refreshAll()
  } catch (error) {
    console.error('Respond friend request failed:', error)
    setActionError(t('errorFriendRequest'))
  } finally {
    isActionPending.value = false
  }
}

const toggleGroupMember = (memberId: string) => {
  const next = new Set(selectedGroupMemberIds.value)
  if (next.has(memberId)) {
    next.delete(memberId)
  } else {
    next.add(memberId)
  }
  selectedGroupMemberIds.value = [...next]
}

const submitGroup = async () => {
  const name = groupName.value.trim()
  const memberIds = [...new Set(selectedGroupMemberIds.value.map((value) => value.trim()).filter(Boolean))]
  if (!name || !memberIds.length || isActionPending.value) return

  isActionPending.value = true
  clearActionState()
  try {
    await createGroup({
      userId: props.currentUser.id,
      name,
      memberIds,
    })
    groupName.value = ''
    selectedGroupMemberIds.value = []
    moreOpen.value = false
    await refreshAll()
  } catch (error) {
    console.error('Create group failed:', error)
    setActionError(t('errorCreateGroup'))
  } finally {
    isActionPending.value = false
  }
}

const leaveCurrentGroup = async () => {
  if (!selectedConversation.value?.is_group || !selectedConversationId.value || isActionPending.value) return
  const group = groups.value.find((item) => item.conversation_id === selectedConversationId.value)
  if (!group) return

  isActionPending.value = true
  clearActionState()
  try {
    await leaveGroup({
      userId: props.currentUser.id,
      groupId: group.group_id,
    })
    selectedConversationId.value = ''
    pendingDirectConversation.value = null
    await refreshAll()
  } catch (error) {
    console.error('Leave group failed:', error)
    setActionError(t('errorLeaveGroup'))
  } finally {
    isActionPending.value = false
  }
}

const leaveExistingGroup = async (groupId: string) => {
  if (!groupId || isActionPending.value) return

  isActionPending.value = true
  clearActionState()
  try {
    await leaveGroup({
      userId: props.currentUser.id,
      groupId,
    })
    if (selectedConversationId.value === groups.value.find((item) => item.group_id === groupId)?.conversation_id) {
      selectedConversationId.value = ''
    }
    pendingDirectConversation.value = null
    await refreshAll()
  } catch (error) {
    console.error('Leave group failed:', error)
    setActionError(t('errorLeaveGroup'))
  } finally {
    isActionPending.value = false
  }
}

const sendMessage = async () => {
  const text = draft.value.trim()
  const attachment = fileAttachment.value
  if (!text && !attachment) return
  if (!selectedConversation.value) return
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    connectionState.value = 'error'
    return
  }

  isSending.value = true
  try {
    socket.send(
      JSON.stringify({
        sender: props.currentUser.displayName,
        sender_id: props.currentUser.id,
        text,
        recipient_id: selectedConversation.value.recipient_id,
        conversation_id: selectedConversation.value.conversation_id,
        attachment_url: attachment?.url || '',
        attachment_name: attachment?.name || '',
        attachment_type: attachment?.type || '',
        attachment_size: attachment?.size || 0,
      }),
    )
    draft.value = ''
    clearFileAttachment()
    window.setTimeout(() => {
      if (selectedConversation.value) {
        loadMessages(selectedConversation.value.conversation_id).catch((error) => {
          console.error('Reload messages failed:', error)
        })
      }
    }, 300)
  } finally {
    isSending.value = false
  }
}

watch(selectedConversationId, async (conversationId) => {
  if (!conversationId) {
    messages.value = []
    closeSocket()
    return
  }

  const conversation = conversationForId(conversationId)
  if (!conversation) return

  try {
    await loadMessages(conversationId)
    connectSocket(conversation)
  } catch (error) {
    console.error('Load messages failed:', error)
  }
})

onMounted(async () => {
  await refreshAll()
})

onBeforeUnmount(() => {
  closeSocket()
})
</script>
