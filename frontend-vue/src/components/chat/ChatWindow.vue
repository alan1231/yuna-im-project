<script setup>
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

const {
  rooms,
  activeRoom,
  activeRoomId,
  messages,
  userInput,
  isConnected,
  connectionError,
  roomError,
  canSend,
  selectRoom,
  addFriend,
  sendMessage,
} = useChatViewModel(props.currentUser)
</script>

<template>
  <main class="chat-shell">
    <RoomList
      :rooms="rooms"
      :active-room-id="activeRoomId"
      :error="roomError"
      :current-user="props.currentUser"
      @select="selectRoom"
      @add-friend="addFriend"
      @logout="emit('logout')"
    />

    <section class="chat-panel">
      <ChatHeader :is-connected="isConnected" :room="activeRoom" />

      <p v-if="connectionError" class="connection-error">
        {{ connectionError }}
      </p>

      <MessageList :messages="messages" :active-room="activeRoom" />

      <ChatComposer
        v-model="userInput"
        :can-send="canSend"
        :placeholder="
          activeRoom.id === 'stock_bot'
            ? '輸入股票代號，例如 2330、$TSM...'
            : `傳訊息給 ${activeRoom.name}...`
        "
        :submit-label="activeRoom.id === 'stock_bot' ? '分析' : '送出'"
        @send="sendMessage"
      />
    </section>
  </main>
</template>
