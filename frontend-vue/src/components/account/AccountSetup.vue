<script setup>
import { ref } from 'vue'

const props = defineProps({
  isSubmitting: {
    type: Boolean,
    required: true,
  },
  error: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['create'])
const displayName = ref('')

const submit = () => {
  emit('create', displayName.value.trim())
}
</script>

<template>
  <main class="account-screen">
    <form class="account-panel" @submit.prevent="submit">
      <p class="eyebrow">Create Account</p>
      <h1>建立你的帳號</h1>
      <p class="account-copy">
        輸入一個顯示名稱後，就可以開始使用一對一聊天與股票機器人。
      </p>

      <label class="account-field">
        <span>顯示名稱</span>
        <input
          v-model="displayName"
          type="text"
          maxlength="32"
          placeholder="例如 Yuna"
          autocomplete="nickname"
        />
      </label>

      <p v-if="props.error" class="account-error">{{ props.error }}</p>

      <button type="submit" :disabled="props.isSubmitting || !displayName.trim()">
        {{ props.isSubmitting ? '建立中' : '建立帳號' }}
      </button>
    </form>
  </main>
</template>
