import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const AuthLayout = () => import('@/layouts/AuthLayout.vue')
const DashboardLayout = () => import('@/layouts/DashboardLayout.vue')
const LoginPage = () => import('@/pages/LoginPage.vue')
const ChangePasswordPage = () => import('@/pages/ChangePasswordPage.vue')
const OverviewPage = () => import('@/pages/OverviewPage.vue')

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      component: AuthLayout,
      children: [
        { path: '', name: 'login', component: LoginPage },
      ],
    },
    {
      path: '/change-password',
      component: AuthLayout,
      children: [
        { path: '', name: 'change-password', component: ChangePasswordPage },
      ],
    },
    {
      path: '/app',
      component: DashboardLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/app/overview' },
        { path: 'overview', name: 'overview', component: OverviewPage },
        { path: 'monitoring', name: 'monitoring', component: () => import('@/pages/MonitoringPage.vue') },
        { path: 'users', name: 'users', component: () => import('@/pages/UsersPage.vue') },
        { path: 'users/:id', name: 'user-detail', component: () => import('@/pages/UserDetailPage.vue') },
        { path: 'assessments', name: 'assessments', component: () => import('@/pages/AssessmentsPage.vue') },
        { path: 'assessments/compare', name: 'assessment-compare', component: () => import('@/pages/AssessmentComparePage.vue') },
        { path: 'assessments/:id', name: 'assessment-detail', component: () => import('@/pages/AssessmentDetailPage.vue') },
        { path: 'assessments/:id/chat', name: 'assessment-chat', component: () => import('@/pages/AssessmentChatPage.vue') },
        { path: 'prompts', name: 'prompts', component: () => import('@/pages/PromptsPage.vue') },
        { path: 'prompts/:id', name: 'prompt-detail', component: () => import('@/pages/PromptDetailPage.vue') },
        { path: 'potensi', name: 'potensi', component: () => import('@/pages/PotensiPage.vue') },
        { path: 'potensi/:id', name: 'potensi-detail', component: () => import('@/pages/PotensiDetailPage.vue') },
        { path: 'config', name: 'config', component: () => import('@/pages/ConfigPage.vue') },
        { path: 'ledger', name: 'ledger', component: () => import('@/pages/LedgerPage.vue') },
        { path: 'admins', name: 'admins', component: () => import('@/pages/AdminsPage.vue') },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/login',
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.meta.requiresAuth && auth.isExpired) {
    auth.logout()
    return { name: 'login' }
  }

  if (to.meta.requiresAuth && auth.mustChangePassword && to.name !== 'change-password') {
    return { name: 'change-password' }
  }

  if (to.meta.requiresSuperadmin && !auth.isSuperadmin) {
    return { name: 'overview' }
  }

  if (to.name === 'login' && auth.isAuthenticated && !auth.isExpired) {
    return { name: 'overview' }
  }
})
