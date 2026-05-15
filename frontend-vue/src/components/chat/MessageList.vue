<script setup>
import { nextTick, ref, watch } from 'vue'
import MessageBubble from './MessageBubble.vue'

const props = defineProps({
  messages: {
    type: Array,
    required: true,
  },
  activeRoom: {
    type: Object,
    required: true,
  },
})

const messageList = ref(null)
const messageEnd = ref(null)

const scrollToLatest = async () => {
  await nextTick()

  requestAnimationFrame(() => {
    messageEnd.value?.scrollIntoView({ block: 'end' })

    if (messageList.value) {
      messageList.value.scrollTop = messageList.value.scrollHeight
    }
  })
}

watch(
  () => props.messages.length,
  () => {
    scrollToLatest()
  },
  { flush: 'post' },
)
</script>

<template>
  <section ref="messageList" class="message-list" aria-live="polite">
    <p v-if="messages.length === 0" class="empty-state">
      {{ activeRoom.description }}
    </p>

    <MessageBubble
      v-for="(message, index) in messages"
      :key="`${message.sender}-${message.sentAt}-${index}`"
      :message="message"
    />

    <div ref="messageEnd" class="message-end" aria-hidden="true"></div>
  </section>
</template>
