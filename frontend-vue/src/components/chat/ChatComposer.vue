<script setup>
import { computed, ref } from 'vue'

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 1600
const MIN_IMAGE_QUALITY = 0.55

const props = defineProps({
  modelValue: {
    type: String,
    required: true,
  },
  fileAttachment: {
    type: Object,
    default: null,
  },
  allowAttachments: {
    type: Boolean,
    default: true,
  },
  canSend: {
    type: Boolean,
    required: true,
  },
  placeholder: {
    type: String,
    default: '輸入訊息...',
  },
  submitLabel: {
    type: String,
    default: '送出',
  },
})

const emit = defineEmits(['update:modelValue', 'attach-file', 'clear-file', 'send'])
const fileInput = ref(null)
const isDraggingFile = ref(false)
const fileError = ref('')
const isProcessingFile = ref(false)

const fileSizeLabel = computed(() => {
  if (!props.fileAttachment?.size) return ''
  const sizeKb = props.fileAttachment.size / 1024
  if (sizeKb < 1024) return `${Math.round(sizeKb)} KB`
  return `${(sizeKb / 1024).toFixed(1)} MB`
})

const isImageAttachment = computed(() => {
  return props.fileAttachment?.type?.startsWith('image/')
})

const openFilePicker = () => {
  fileError.value = ''
  fileInput.value?.click()
}

const blobToDataUrl = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const loadImage = (url) => {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = url
  })
}

const canvasToBlob = (canvas, type, quality) => {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }
      reject(new Error('canvas export failed'))
    }, type, quality)
  })
}

const compressedImageName = (name) => {
  const baseName = name.replace(/\.[^.]+$/, '') || 'image'
  return `${baseName}.jpg`
}

const compressImageFile = async (file) => {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))

    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas context unavailable')

    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    let quality = 0.86
    let blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    while (blob.size > MAX_FILE_SIZE_BYTES && quality > MIN_IMAGE_QUALITY) {
      quality -= 0.08
      blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    }

    return blob
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const attachBlob = async ({ blob, name, type, compressed = false }) => {
  const url = await blobToDataUrl(blob)
  fileError.value = compressed ? '圖片已自動壓縮。' : ''
  emit('attach-file', {
    url,
    name,
    type,
    size: blob.size,
  })
}

const readAttachmentFile = async (file) => {
  if (!props.allowAttachments) return
  if (!file) return

  isProcessingFile.value = true
  fileError.value = ''

  try {
    if (file.size <= MAX_FILE_SIZE_BYTES) {
      await attachBlob({
        blob: file,
        name: file.name,
        type: file.type,
      })
      return
    }

    if (!file.type.startsWith('image/')) {
      fileError.value = '檔案需小於 2 MB；目前只有圖片可自動壓縮。'
      return
    }

    const compressedBlob = await compressImageFile(file)
    if (compressedBlob.size > MAX_FILE_SIZE_BYTES) {
      fileError.value = '圖片已壓縮，但仍超過 2 MB。請改用較小的圖片。'
      return
    }

    await attachBlob({
      blob: compressedBlob,
      name: compressedImageName(file.name),
      type: compressedBlob.type || 'image/jpeg',
      compressed: true,
    })
  } catch (error) {
    console.error('檔案處理失敗:', error)
    fileError.value = '檔案處理失敗。'
  } finally {
    isProcessingFile.value = false
  }
}

const handleFileChange = (event) => {
  readAttachmentFile(event.target.files?.[0])
  event.target.value = ''
}

const handleDragEnter = (event) => {
  if (!props.allowAttachments) return
  if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return
  isDraggingFile.value = true
}

const handleDrop = (event) => {
  isDraggingFile.value = false
  readAttachmentFile(event.dataTransfer?.files?.[0])
}

const submit = () => {
  fileError.value = ''
  emit('send')
}
</script>

<template>
  <form
    class="composer"
    :class="{ 'composer-dragging': isDraggingFile && allowAttachments }"
    @submit.prevent="submit"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent="allowAttachments && (isDraggingFile = true)"
    @dragleave.prevent="isDraggingFile = false"
    @drop.prevent="handleDrop"
  >
    <div class="composer-input-stack">
      <div v-if="fileAttachment" class="file-attachment-preview">
        <img
          v-if="isImageAttachment"
          :src="fileAttachment.url"
          :alt="fileAttachment.name || '待傳送圖片'"
        />
        <span v-else class="file-attachment-icon" aria-hidden="true">檔</span>
        <span>
          <strong>{{ fileAttachment.name || '檔案' }}</strong>
          <small v-if="fileSizeLabel">{{ fileSizeLabel }}</small>
        </span>
        <button
          type="button"
          class="file-attachment-remove"
          aria-label="移除檔案"
          title="移除檔案"
          @click="emit('clear-file')"
        >
          ×
        </button>
      </div>

      <p v-if="fileError" class="composer-error">{{ fileError }}</p>
      <p v-else-if="isProcessingFile" class="composer-status">正在處理檔案...</p>

      <input
        :value="modelValue"
        type="text"
        :placeholder="placeholder"
        autocomplete="off"
        @input="emit('update:modelValue', $event.target.value)"
      />
    </div>

    <input
      ref="fileInput"
      class="composer-file-input"
      type="file"
      @change="handleFileChange"
    />

    <button
      v-if="allowAttachments"
      type="button"
      class="composer-file-button"
      aria-label="選擇檔案"
      title="選擇檔案"
      @click="openFilePicker"
    >
      檔案
    </button>

    <button type="submit" :disabled="!canSend || isProcessingFile">{{ submitLabel }}</button>
  </form>
</template>
