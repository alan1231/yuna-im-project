<template>
  <RouterView />
  <LanguageSwitcher />
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
import LanguageSwitcher from './components/LanguageSwitcher.vue'
</script>
