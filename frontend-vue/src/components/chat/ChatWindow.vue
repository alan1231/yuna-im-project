<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useChatViewModel } from '../../composables/useChatViewModel'
import ChatComposer from './ChatComposer.vue'
import ChatHeader from './ChatHeader.vue'
import MessageList from './MessageList.vue'
import RoomList from './RoomList.vue'

const props = defineProps({
  currentUser: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['logout'])
const mobileView = ref('rooms')
let wasMobile = false

const {
  rooms,
  availableUsers,
  activeRoom,
  activeRoomId,
  messages,
  userInput,
  fileAttachment,
  isConnected,
  connectionError,
  roomError,
  canSend,
  selectRoom,
  startChatWithUser,
  addFriend,
  attachFile,
  clearFileAttachment,
  refreshFriends,
  sendMessage,
} = useChatViewModel(props.currentUser)

const openRoom = (roomId) => {
  selectRoom(roomId)
  mobileView.value = 'chat'
}

const openUserChat = (user) => {
  startChatWithUser(user)
  mobileView.value = 'chat'
}

const syncMobileView = () => {
  const isMobile = window.matchMedia('(max-width: 768px)').matches
  if (isMobile && !wasMobile) {
    mobileView.value = 'chat'
  }
  wasMobile = isMobile
}

onMounted(() => {
  wasMobile = window.matchMedia('(max-width: 768px)').matches
  window.addEventListener('resize', syncMobileView)
})

onUnmounted(() => {
  window.removeEventListener('resize', syncMobileView)
})
</script>

<template>
  <main
    class="chat-shell"
    :class="{
      'chat-shell-mobile-list': mobileView === 'rooms',
      'chat-shell-mobile-chat': mobileView === 'chat',
    }"
  >
    <RoomList
      :rooms="rooms"
      :available-users="availableUsers"
      :active-room-id="activeRoomId"
      :error="roomError"
      :current-user="props.currentUser"
      @select="openRoom"
      @start-chat="openUserChat"
      @add-friend="addFriend"
      @refresh-friends="refreshFriends"
      @logout="emit('logout')"
    />

    <section class="chat-panel">
      <ChatHeader
        :is-connected="isConnected"
        :room="activeRoom"
        @back="mobileView = 'rooms'"
      />

      <p v-if="connectionError" class="connection-error">
        {{ connectionError }}
      </p>

      <MessageList :messages="messages" :active-room="activeRoom" />

      <ChatComposer
        v-model="userInput"
        :file-attachment="fileAttachment"
        :allow-attachments="activeRoom.id !== 'stock_bot'"
        :can-send="canSend"
        :placeholder="
          activeRoom.id === 'stock_bot'
            ? '輸入股票代號，例如 2330、$TSM...'
            : `傳訊息給 ${activeRoom.name}...`
        "
        :submit-label="activeRoom.id === 'stock_bot' ? '分析' : '送出'"
        @attach-file="attachFile"
        @clear-file="clearFileAttachment"
        @send="sendMessage"
      />
    </section>
  </main>
</template>
