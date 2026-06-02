<script setup>
import { computed, nextTick, ref } from 'vue'
import { getChangeClass } from '../../utils/stockChange'

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
})

const isSelf = computed(() => props.message.isSelf)
const changeClass = computed(() => getChangeClass(props.message))
const isPending = computed(() => Boolean(props.message.isPending))
const hasText = computed(() => Boolean(props.message.text))
const hasAttachment = computed(() => Boolean(props.message.attachmentUrl))
const isImageAttachment = computed(() => props.message.attachmentType?.startsWith('image/'))
const attachmentLabel = computed(() => props.message.attachmentName || '檔案')
const isImagePreviewOpen = ref(false)
const imagePreviewModal = ref(null)
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

const openImagePreview = async () => {
  isImagePreviewOpen.value = true
  await nextTick()
  imagePreviewModal.value?.focus()
}

const closeImagePreview = () => {
  isImagePreviewOpen.value = false
}
</script>

<template>
  <article class="message" :class="{ 'message-self': isSelf, 'message-pending': isPending }">
    <a
      v-if="hasAttachment && isImageAttachment"
      class="message-image-link"
      :href="message.attachmentUrl"
      :aria-label="attachmentLabel"
      @click.prevent="openImagePreview"
    >
      <img
        class="message-image"
        :src="message.attachmentUrl"
        :alt="attachmentLabel"
        loading="lazy"
      />
    </a>
    <a
      v-else-if="hasAttachment"
      class="message-file-link"
      :href="message.attachmentUrl"
      target="_blank"
      rel="noreferrer"
      :download="attachmentLabel"
    >
      <span class="message-file-icon" aria-hidden="true">檔</span>
      <span>{{ attachmentLabel }}</span>
    </a>
    <div v-if="isPending" class="typing-indicator" aria-label="股票機器人正在回覆">
      <span />
      <span />
      <span />
    </div>
    <p v-else-if="hasText" :class="changeClass">{{ message.text }}</p>
    <footer v-if="!isPending" class="message-footer">
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

  <Teleport to="body">
    <div
      v-if="isImagePreviewOpen"
      ref="imagePreviewModal"
      class="image-preview-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="attachmentLabel"
      tabindex="0"
      @click.self="closeImagePreview"
      @keydown.esc="closeImagePreview"
    >
      <button
        type="button"
        class="image-preview-close"
        aria-label="關閉圖片預覽"
        title="關閉圖片預覽"
        @click="closeImagePreview"
      >
        ×
      </button>
      <img
        class="image-preview-full"
        :src="message.attachmentUrl"
        :alt="attachmentLabel"
      />
    </div>
  </Teleport>
</template>
