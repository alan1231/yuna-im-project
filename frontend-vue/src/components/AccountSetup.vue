<template>
  <section class="account-screen">
    <div class="account-entry">
      <aside class="account-brand">
        <p class="eyebrow">{{ t('brand') }}</p>
        <h1>{{ t('tagline') }}</h1>
        <p>
          Vue 3 版本的前端，保留登入、聊天室與管理頁的核心結構，並直接接到現有 Go 後端。
        </p>
        <div class="account-feature-list">
          <span>Vue 3</span>
          <span>Vite</span>
          <span>WebSocket</span>
          <span>Admin console</span>
        </div>
      </aside>

      <div class="account-panel">
        <div class="account-panel-heading">
          <span>{{ modeLabel }}</span>
          <h2>{{ mode === 'create' ? t('createAccount') : t('signIn') }}</h2>
          <p class="account-copy">
            {{ mode === 'create' ? '建立新的顯示名稱後即可進入聊天室。' : '輸入既有顯示名稱直接登入。' }}
          </p>
        </div>

        <div class="account-api-toggle">
          <div class="account-api-toggle-copy">
            <span>{{ t('apiEnvironment') }}</span>
            <strong>{{ apiMode === 'local' ? t('apiModeLocal') : t('apiModeOnline') }}</strong>
          </div>
          <button
            type="button"
            class="account-api-toggle-button"
            @click="toggleApiMode"
          >
            {{ t('switchApiMode') }}
          </button>
        </div>

        <div class="account-mode-switch">
          <button
            type="button"
            :class="{ 'account-mode-active': mode === 'create' }"
            @click="mode = 'create'"
          >
            {{ t('createAccount') }}
          </button>
          <button
            type="button"
            :class="{ 'account-mode-active': mode === 'login' }"
            @click="mode = 'login'"
          >
            {{ t('signIn') }}
          </button>
        </div>

        <form class="account-form" @submit.prevent="submit">
          <label class="account-field">
            <span>{{ t('displayName') }}</span>
            <input
              v-model="displayName"
              autocomplete="nickname"
              :placeholder="t('displayNameHint')"
              :disabled="isSubmitting"
            />
          </label>

          <p v-if="error" class="account-message account-message-error">
            {{ t('errorPrefix') }} {{ error }}
          </p>
          <p v-else-if="showWakeHint" class="account-message account-message-info">
            {{ t('wakingBackend') }}
          </p>

          <button class="account-submit" type="submit" :disabled="isSubmitting || !displayName.trim()">
            {{ isSubmitting ? t('working') : actionLabel }}
          </button>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { apiMode, toggleApiMode } from '../config/api'
import { useI18n } from '../i18n'

const props = defineProps<{
  isSubmitting: boolean
  showWakeHint: boolean
  error: string
}>()

const emit = defineEmits<{
  (event: 'create', displayName: string): void
  (event: 'login', displayName: string): void
}>()

const { t } = useI18n()
const mode = ref<'create' | 'login'>('create')
const displayName = ref('')

const modeLabel = computed(() => (mode.value === 'create' ? t('createAccount') : t('signIn')))
const actionLabel = computed(() => (mode.value === 'create' ? t('submitCreate') : t('submitSignIn')))

const submit = () => {
  const name = displayName.value.trim()
  if (!name || props.isSubmitting) return

  if (mode.value === 'create') {
    emit('create', name)
    return
  }

  emit('login', name)
}
</script>
