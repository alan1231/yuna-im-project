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
</script>

<template>
  <article class="message" :class="{ 'message-self': isSelf }">
    <div class="message-meta">
      <span>{{ message.sender }}</span>
      <time v-if="message.sentAt">{{ message.sentAt }}</time>
    </div>
    <p :class="changeClass">{{ message.text }}</p>
  </article>
</template>
