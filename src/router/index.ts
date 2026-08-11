import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: () => import('@/views/FantasyView.vue'), meta: { dataFile: 'PBathletes.json' } },
    { path: '/2025', component: () => import('@/views/FantasyView.vue'), meta: { dataFile: '2025.json' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
