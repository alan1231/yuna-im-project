<script setup>
defineProps({
  modelValue: {
    type: String,
    required: true,
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

const emit = defineEmits(['update:modelValue', 'send'])
</script>

<template>
  <form class="composer" @submit.prevent="emit('send')">
    <input
      :value="modelValue"
      type="text"
      :placeholder="placeholder"
      autocomplete="off"
      @input="emit('update:modelValue', $event.target.value)"
    />
    <button type="submit" :disabled="!canSend">{{ submitLabel }}</button>
  </form>
</template>
