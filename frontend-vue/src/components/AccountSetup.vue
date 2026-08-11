<template>
  <section class="account-screen">
    <div class="account-entry">
      <div class="account-hero">
        <div class="account-brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" role="presentation">
            <path
              d="M6 5h12a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4h-7l-4.5 3.5c-.4.3-.9 0-.9-.5V17H6a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4z"
              fill="currentColor"
            />
          </svg>
        </div>
        <h1>{{ t('brand') }}</h1>
        <p class="account-hero-subtitle">{{ t('accountSubtitle') }}</p>
        <p class="account-hero-copy">
          {{ t('accountDescription') }}
        </p>
      </div>

      <div class="account-panel">
        <div class="account-panel-heading">
          <span>{{ modeLabel }}</span>
          <h2>{{ mode === 'create' ? t('createAccount') : t('signIn') }}</h2>
          <p class="account-copy">
            {{ mode === 'create' ? t('accountCreateCopy') : t('accountSignInCopy') }}
          </p>
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
              :placeholder="t('displayNameHintExample')"
              :disabled="isSubmitting"
            />
            <small>{{ t('displayNameHelper') }}</small>
          </label>

          <label class="account-field">
            <span>{{ t('password') }}</span>
            <input
              v-model="password"
              type="password"
              maxlength="72"
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
              :placeholder="t('passwordHint')"
              :disabled="isSubmitting"
            />
          </label>

          <p v-if="error" class="account-message account-message-error">
            {{ t('errorPrefix') }} {{ error }}
          </p>
          <p v-else-if="showWakeHint" class="account-message account-message-info">
            {{ t('wakingBackend') }}
          </p>

          <button class="account-submit" type="submit" :disabled="isSubmitting || !displayName.trim() || !passwordIsValid">
            {{ isSubmitting ? t('working') : actionLabel }}
          </button>

          <button type="button" class="account-email-link">
            {{ t('emailLogin') }}
          </button>
        </form>

        <div class="account-api-toggle">
          <div class="account-api-toggle-copy">
            <span>{{ t('environment') }}</span>
            <strong>{{ t('apiModeOnline') }}</strong>
            <small>{{ t('environmentHint') }}</small>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '../i18n'

const props = defineProps<{
  isSubmitting: boolean
  showWakeHint: boolean
  error: string
}>()

const emit = defineEmits<{
  (event: 'create', displayName: string, password: string): void
  (event: 'login', displayName: string, password: string): void
}>()

const { t } = useI18n()
const mode = ref<'create' | 'login'>('create')
const displayName = ref('')
const password = ref('')
const passwordIsValid = computed(() => {
  const bytes = new TextEncoder().encode(password.value).length
  return bytes >= 8 && bytes <= 72
})

const modeLabel = computed(() => (mode.value === 'create' ? t('createAccount') : t('signIn')))
const actionLabel = computed(() => (mode.value === 'create' ? t('continue') : t('signIn')))

const submit = () => {
  const name = displayName.value.trim()
  if (!name || !passwordIsValid.value || props.isSubmitting) return

  if (mode.value === 'create') {
    emit('create', name, password.value)
    return
  }

  emit('login', name, password.value)
}
</script>
