<template>
  <section class="chat-page chat-app">
    <LanguageSwitcher />
    <div
      class="chat-app-shell"
      :class="{
        'chat-app-mobile-list': isMobileViewport && mobileView === 'rooms',
        'chat-app-mobile-chat': isMobileViewport && mobileView === 'chat',
      }"
    >
      
      <aside class="chat-library">
        <header class="chat-library-header">
          <div>
            <p class="eyebrow">Conversations</p>
            <h2>{{ t('chatTitle') }}</h2>
          </div>
          <button class="chat-logout" type="button" @click="emit('logout')">{{ t('logout') }}</button>
        </header>

        <label class="chat-search">
          <span class="sr-only">{{ t('search') }}</span>
          <input
            v-model="searchQuery"
            type="search"
            :placeholder="t('adminSearchPlaceholder')"
          />
        </label>

        <p v-if="actionError" class="chat-alert">{{ actionError }}</p>

        <section class="chat-library-group">
          <div class="chat-section-head">
            <h3>Recent chats</h3>
            <span class="muted-pill">{{ directConversations.length }}</span>
          </div>

          <button
            v-for="conversation in directConversations"
            :key="conversation.conversation_id"
            type="button"
            class="chat-thread-item"
            :class="{ active: conversation.conversation_id === selectedConversationId }"
            @click="selectConversation(conversation.conversation_id)"
          >
            <div class="chat-thread-avatar">{{ initials(conversation.display_name) }}</div>
            <div class="chat-thread-copy">
              <div class="chat-thread-top">
                <strong>{{ conversation.display_name }}</strong>
                <span>{{ formatConversationTime(conversation.last_message_at) }}</span>
              </div>
              <p>{{ conversation.last_message || t('emptyConversation') }}</p>
            </div>
            <span v-if="conversation.unread_count" class="chat-thread-badge">{{ conversation.unread_count }}</span>
          </button>

          <p v-if="!directConversations.length" class="chat-empty-list">{{ t('noData') }}</p>
        </section>

        <section class="chat-library-group">
          <div class="chat-section-head">
            <h3>Group chats</h3>
            <span class="muted-pill">{{ groupConversations.length }}</span>
          </div>

          <button
            v-for="conversation in groupConversations"
            :key="conversation.conversation_id"
            type="button"
            class="chat-thread-item"
            :class="{ active: conversation.conversation_id === selectedConversationId }"
            @click="selectConversation(conversation.conversation_id)"
          >
            <div class="chat-thread-avatar chat-thread-avatar-group">{{ initials(conversation.display_name) }}</div>
            <div class="chat-thread-copy">
              <div class="chat-thread-top">
                <strong>{{ conversation.display_name }}</strong>
                <span>{{ formatConversationTime(conversation.last_message_at) }}</span>
              </div>
              <p>{{ conversation.member_ids?.length ?? 0 }} members</p>
            </div>
            <span v-if="conversation.unread_count" class="chat-thread-badge">{{ conversation.unread_count }}</span>
          </button>

          <p v-if="!groupConversations.length" class="chat-empty-list">{{ t('noData') }}</p>
        </section>
      </aside>

      <main class="chat-room">
        <template v-if="selectedConversation">
          <header class="chat-room-header">
            <div class="chat-room-title">
              <button
                v-if="isMobileViewport"
                type="button"
                class="chat-back-button"
                :aria-label="t('backToRooms')"
                @click="mobileView = 'rooms'"
              >
                ‹
              </button>
              <p class="eyebrow">Inbox</p>
              <h2>{{ selectedConversation.display_name }}</h2>
              <p class="chat-room-subtitle">{{ selectedConversation.last_message || t('emptyConversation') }}</p>
            </div>
            <div class="chat-room-actions">
              <button
                v-if="canStartVoiceCall(selectedConversation)"
                class="chat-icon-button"
                type="button"
                :aria-label="t('voiceCall')"
                @click="startVoiceCall"
              >
                ☎
              </button>
              <button
                v-if="selectedConversation.is_group"
                class="chat-icon-button"
                type="button"
                :aria-label="t('leave')"
                @click="leaveCurrentGroup"
              >
                ⌁
              </button>
              <button class="chat-icon-button" type="button" :aria-label="t('refresh')" @click="refreshCurrentConversation">↻</button>
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

          <section ref="messagesViewport" class="chat-timeline">
            <article
              v-for="message in messages"
              :key="message.time + message.sender_id + (message.text || '')"
              class="chat-message"
              :class="{ self: message.sender_id === currentUser.id }"
            >
              <div class="chat-message-avatar">{{ initials(displayNameFor(message.sender_id)) }}</div>
              <div class="chat-message-card">
                <div class="chat-message-meta">
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
              </div>
            </article>

            <div v-if="!messages.length" class="message-empty">
              {{ t('emptyConversation') }}
            </div>
          </section>

          <form
            class="chat-composer"
            :class="{ dragging: isDraggingFile }"
            @submit.prevent="sendMessage"
            @dragenter.prevent="handleDragEnter"
            @dragover.prevent="handleDragOver"
            @dragleave.prevent="handleDragLeave"
            @drop.prevent="handleDrop"
          >
            <div class="chat-composer-inner">
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
                class="chat-composer-input"
                :placeholder="t('messagePlaceholder')"
                :disabled="isSending || isProcessingFile"
                @keydown.enter.exact.prevent="sendMessage"
              />
            </div>

            <input ref="fileInput" class="composer-file-input" type="file" @change="handleFileChange" />
            <button
              type="button"
              class="chat-chip-button"
              :disabled="isSending || isProcessingFile"
              :aria-label="t('chooseFile')"
              :title="t('chooseFile')"
              @click="openFilePicker"
            >
              +
            </button>
            <button class="chat-send-button" type="submit" :disabled="isSending || isProcessingFile || (!draft.trim() && !fileAttachment)">
              {{ isSending ? t('working') : t('send') }}
            </button>
          </form>
        </template>

        <div v-else class="empty-state">
          <div class="empty-card">
            <p class="eyebrow">{{ t('brand') }}</p>
            <h2>{{ t('emptyConversation') }}</h2>
            <p>選擇左側任一對話，Vue 版會透過既有 WebSocket 與 `/messages` API 載入歷史與即時更新。</p>
          </div>
        </div>
      </main>

      <aside class="chat-profile">
        <button type="button" class="chat-profile-close" aria-label="Close">×</button>
        <div class="chat-profile-card">
          <div class="chat-profile-avatar">{{ initials(selectedConversation?.display_name || currentUser.displayName) }}</div>
          <h3>{{ selectedConversation?.display_name || currentUser.displayName }}</h3>
          <p class="chat-profile-status">
            <span class="chat-profile-dot"></span>
            {{ selectedConversation?.is_group ? 'Group' : 'Online' }}
          </p>
          <div class="chat-profile-actions">
            <button type="button" class="chat-profile-action">💬</button>
            <button type="button" class="chat-profile-action" @click="selectedConversation && canStartVoiceCall(selectedConversation) && startVoiceCall()">☎</button>
            <button type="button" class="chat-profile-action">◴</button>
          </div>
        </div>

        <dl class="chat-profile-meta">
          <div>
            <dt>Role</dt>
            <dd>{{ selectedConversation?.is_group ? 'Group chat' : 'Direct chat' }}</dd>
          </div>
          <div>
            <dt>Peer</dt>
            <dd>{{ selectedConversation?.recipient_id || selectedConversation?.conversation_id || '—' }}</dd>
          </div>
          <div>
            <dt>Last message</dt>
            <dd>{{ selectedConversation?.last_message_at ? formatConversationTime(selectedConversation.last_message_at) : '—' }}</dd>
          </div>
          <div>
            <dt>Local time</dt>
            <dd>{{ localTimeLabel }}</dd>
          </div>
        </dl>
      </aside>
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
  createWebSocketTicket,
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
import LanguageSwitcher from './LanguageSwitcher.vue'

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
const mobileView = ref<'rooms' | 'chat'>('rooms')
const isMobileViewport = ref(false)
let mobileQuery: MediaQueryList | null = null
let hasSyncedMobileViewport = false
const syncMobileViewport = () => {
  const nextIsMobile = mobileQuery?.matches ?? false
  if (nextIsMobile && hasSyncedMobileViewport && !isMobileViewport.value) {
    mobileView.value = 'chat'
  }
  if (!nextIsMobile) {
    mobileView.value = 'rooms'
  }
  isMobileViewport.value = nextIsMobile
  hasSyncedMobileViewport = true
}
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
let connectionGeneration = 0

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
const searchQuery = ref('')

const filteredConversations = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return allConversations.value

  return allConversations.value.filter((conversation) => {
    return [
      conversation.display_name,
      conversation.last_message,
      conversation.conversation_id,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
  })
})

const directConversations = computed(() => filteredConversations.value.filter((conversation) => !conversation.is_group))
const groupConversations = computed(() => filteredConversations.value.filter((conversation) => conversation.is_group))
const localTimeLabel = computed(() =>
  new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date()),
)

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
  connectionGeneration += 1
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

const connectSocket = async (conversation: ConversationRecord) => {
  closeSocket()
  const generation = connectionGeneration
  connectionState.value = 'connecting'
  let ticket: string
  try {
    ticket = (await createWebSocketTicket()).ticket
  } catch (cause) {
    if (generation !== connectionGeneration) return
    console.error('WebSocket ticket failed:', cause)
    connectionState.value = 'error'
    return
  }
  if (generation !== connectionGeneration || selectedConversationId.value !== conversation.conversation_id) return
  const url = new URL(`${getWsUrl()}/ws`)
  url.searchParams.set('ticket', ticket)
  url.searchParams.set('conversation_id', conversation.conversation_id)

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
  if (isMobileViewport.value) {
    mobileView.value = 'chat'
  }
}

const selectFriendConversation = (friendId: string) => {
  moreOpen.value = false
  const conversationId = findConversationIdForFriend(friendId) || conversationIdFor(props.currentUser.id, friendId)
  const friend = friends.value.find((item) => item.friend_id === friendId)
  const user = users.value.find((item) => item.user_id === friendId)
  pendingDirectConversation.value = buildDirectConversation(friendId, friend?.display_name || user?.display_name || friendId)
  selectedConversationId.value = conversationId
  clearFileAttachment()
  if (isMobileViewport.value) {
    mobileView.value = 'chat'
  }
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
  mobileQuery = window.matchMedia('(max-width: 760px)')
  syncMobileViewport()
  mobileQuery.addEventListener('change', syncMobileViewport)

  await refreshAll()
})

onBeforeUnmount(() => {
  mobileQuery?.removeEventListener('change', syncMobileViewport)
  closeSocket()
})
</script>
