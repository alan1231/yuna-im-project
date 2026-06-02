<script setup>
import { ref } from 'vue'

const props = defineProps({
  isSubmitting: {
    type: Boolean,
    required: true,
  },
  showWakeHint: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['create', 'login'])
const displayName = ref('')
const mode = ref('login')

const submit = () => {
  emit(mode.value === 'login' ? 'login' : 'create', displayName.value.trim())
}
</script>

<template>
  <main class="account-screen">
    <form class="account-panel" @submit.prevent="submit">
      <p class="eyebrow">Account</p>
      <h1>{{ mode === 'login' ? '登入帳號' : '建立你的帳號' }}</h1>
      <p class="account-copy">
        {{ mode === 'login'
          ? '輸入既有顯示名稱，回到你的聊天與股票機器人。'
          : '輸入一個尚未使用的顯示名稱後，就可以開始聊天。' }}
      </p>

      <div class="account-mode-switch" role="tablist" aria-label="帳號模式">
        <button
          type="button"
          :class="{ 'account-mode-active': mode === 'login' }"
          @click="mode = 'login'"
        >
          登入
        </button>
        <button
          type="button"
          :class="{ 'account-mode-active': mode === 'create' }"
          @click="mode = 'create'"
        >
          建立
        </button>
      </div>

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
      <p v-else-if="props.showWakeHint" class="account-wake-hint">
        免費雲端服務正在喚醒，第一次連線可能需要稍等。
      </p>

      <button type="submit" :disabled="props.isSubmitting || !displayName.trim()">
        {{ props.isSubmitting ? '處理中' : mode === 'login' ? '登入' : '建立帳號' }}
      </button>
    </form>
  </main>
</template>
