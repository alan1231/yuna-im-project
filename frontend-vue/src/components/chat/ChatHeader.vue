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
</script>

<template>
  <header class="chat-header">
    <div>
      <p class="eyebrow">Direct Message</p>
      <h1>{{ room.name }}</h1>
    </div>
    <span class="status" :class="{ 'status-connected': isConnected }">
      {{ isConnected ? '已連線' : '未連線' }}
    </span>
  </header>
</template>
