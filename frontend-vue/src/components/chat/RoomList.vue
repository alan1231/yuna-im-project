<script setup>
import { ref } from 'vue'

defineProps({
  rooms: {
    type: Array,
    required: true,
  },
  activeRoomId: {
    type: String,
    required: true,
  },
  error: {
    type: String,
    default: '',
  },
  currentUser: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['select', 'add-friend', 'logout'])
const friendName = ref('')

const submitFriend = () => {
  const name = friendName.value.trim()
  if (!name) return

  emit('add-friend', name)
  friendName.value = ''
}
</script>

<template>
  <aside class="room-sidebar" aria-label="聊天清單">
    <div class="room-sidebar-header">
      <div>
        <p class="eyebrow">Messages</p>
        <h2>聊天室</h2>
      </div>
      <button type="button" class="logout-button" @click="emit('logout')">
        登出
      </button>
    </div>

    <div class="current-user">
      <span class="room-avatar">{{ currentUser.displayName.slice(0, 1).toUpperCase() }}</span>
      <span class="room-content">
        <span class="room-name">{{ currentUser.displayName }}</span>
        <span class="room-preview">目前使用者</span>
      </span>
    </div>

    <nav class="room-list">
      <button
        v-for="room in rooms"
        :key="room.id"
        type="button"
        class="room-item"
        :class="{ 'room-item-active': room.id === activeRoomId }"
        @click="emit('select', room.id)"
      >
        <span class="room-avatar">{{ room.initials }}</span>
        <span class="room-content">
          <span class="room-name">{{ room.name }}</span>
          <span class="room-preview">{{ room.description }}</span>
        </span>
      </button>
    </nav>

    <form class="add-friend" @submit.prevent="submitFriend">
      <label>
        <span>新增朋友</span>
        <input
          v-model="friendName"
          type="text"
          maxlength="32"
          placeholder="輸入朋友名稱"
          autocomplete="off"
        />
      </label>
      <p v-if="error" class="room-error">{{ error }}</p>
      <button type="submit" :disabled="!friendName.trim()">新增</button>
    </form>
  </aside>
</template>
