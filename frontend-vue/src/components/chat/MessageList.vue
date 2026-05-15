<script setup>
import { computed, nextTick, ref, watch } from 'vue'
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

const parseMessageDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

const dateKey = (value) => {
  const date = parseMessageDate(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

const formatDateLabel = (value) => {
  const date = parseMessageDate(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (dateKey(value) === dateKey(today)) return '今天'
  if (dateKey(value) === dateKey(yesterday)) return '昨天'

  const sameYear = date.getFullYear() === today.getFullYear()
  return date.toLocaleDateString('zh-TW', {
    year: sameYear ? undefined : 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const messageItems = computed(() => {
  const items = []
  let previousDateKey = ''

  props.messages.forEach((message, index) => {
    const currentDateKey = dateKey(message.sentAt)
    if (currentDateKey !== previousDateKey) {
      items.push({
        type: 'date',
        key: `date-${currentDateKey}-${index}`,
        label: formatDateLabel(message.sentAt),
      })
      previousDateKey = currentDateKey
    }

    items.push({
      type: 'message',
      key: `${message.sender}-${message.sentAt}-${index}`,
      message,
    })
  })

  return items
})

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

    <template v-for="item in messageItems" :key="item.key">
      <div v-if="item.type === 'date'" class="message-date-divider">
        {{ item.label }}
      </div>
      <MessageBubble v-else :message="item.message" />
    </template>

    <div ref="messageEnd" class="message-end" aria-hidden="true"></div>
  </section>
</template>
