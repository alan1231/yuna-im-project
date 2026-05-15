<script setup>
defineProps({
  isConnected: {
    type: Boolean,
    required: true,
  },
  room: {
    type: Object,
    required: true,
  },
})

defineEmits(['back'])
</script>

<template>
  <header class="chat-header">
    <div class="chat-header-main">
      <button type="button" class="chat-back-button" aria-label="返回聊天列表" @click="$emit('back')">
        ‹
      </button>
      <div>
        <p class="eyebrow">Direct Message</p>
        <h1>{{ room.name }}</h1>
      </div>
    </div>
    <span class="status" :class="{ 'status-connected': isConnected }">
      {{ isConnected ? '已連線' : '未連線' }}
    </span>
  </header>
</template>
