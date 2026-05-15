<script setup>
import { computed } from 'vue'
import { getChangeClass } from '../../utils/stockChange'

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
})

const isSelf = computed(() => props.message.isSelf)
const changeClass = computed(() => getChangeClass(props.message))
const sentTime = computed(() => {
  const date = new Date(props.message.sentAt)
  if (Number.isNaN(date.getTime())) return props.message.sentAt || ''

  return date.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
})
const readStatusLabel = computed(() => {
  if (!isSelf.value) return ''
  return props.message.readAt ? '已讀' : '未讀'
})
</script>

<template>
  <article class="message" :class="{ 'message-self': isSelf }">
    <p :class="changeClass">{{ message.text }}</p>
    <footer class="message-footer">
      <time v-if="sentTime">{{ sentTime }}</time>
      <span
        v-if="isSelf"
        class="message-read-status"
        :class="{ 'message-read-status-read': message.readAt }"
        :aria-label="readStatusLabel"
        :title="readStatusLabel"
      >
        <span />
        <span v-if="message.readAt" />
      </span>
    </footer>
  </article>
</template>
