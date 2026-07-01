import { createRouter, createWebHistory } from 'vue-router'
import AdminView from './views/AdminView.vue'
import HomeView from './views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/admin', component: AdminView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
