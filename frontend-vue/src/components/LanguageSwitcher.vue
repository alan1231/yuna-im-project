<template>
  <div class="language-switcher" :aria-label="t('language')">
    <button
      type="button"
      :class="{ 'language-switcher-active': locale === 'zh' }"
      @click="setLocale('zh')"
    >
      中文
    </button>
    <button
      type="button"
      :class="{ 'language-switcher-active': locale === 'en' }"
      @click="setLocale('en')"
    >
      EN
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '../i18n'

const { locale, setLocale, t } = useI18n()
</script>
