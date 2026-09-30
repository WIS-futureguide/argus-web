import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createRouter, createMemoryHistory } from 'vue-router'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { useAuthStore } from '@/stores/auth'
import AdminsPage from '@/pages/AdminsPage.vue'

const mockList = vi.fn()

vi.mock('@/lib/api-admins', () => ({
  adminsApi: {
    list: (...args: unknown[]) => mockList(...args),
    create: vi.fn().mockResolvedValue({ message: 'Admin created', id: 'x', email: 'x', role: 'admin', must_change_password: true }),
    update: vi.fn().mockResolvedValue({ message: 'Admin updated' }),
    updateMe: vi.fn().mockResolvedValue({ message: 'Profile updated' }),
    delete: vi.fn().mockResolvedValue({ message: 'Admin deleted' }),
    resetPassword: vi.fn().mockResolvedValue({ message: 'Password reset', must_change_password: true }),
  },
}))

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  return `${header}.${body}.fake-signature`
}

const adminsData = {
  admins: [
    { id: 'a1', email: 'super@futureguide.id', full_name: 'Super Admin', role: 'superadmin', must_change_password: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-05-10T08:00:00Z' },
    { id: 'a2', email: 'admin@futureguide.id', full_name: 'Regular Admin', role: 'admin', must_change_password: true, created_at: '2026-03-01T00:00:00Z', updated_at: '2026-05-10T08:00:00Z' },
  ],
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/admins', name: 'admins', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } },
    ],
  })
}

function mountPage(role: 'admin' | 'superadmin' = 'superadmin') {
  const router = createTestRouter()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const token = makeJwt({ sub: 'a1', email: 'a@test.com', role, must_change_password: false, exp: 9999999999 })
  localStorage.setItem('token', token)
  const wrapper = mount(AdminsPage, {
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: false }), router, [VueQueryPlugin, { queryClient }]],
      stubs: { Modal: { props: ['open'], template: '<div v-if="open"><slot /></div>' } },
    },
  })
  const auth = useAuthStore()
  auth.setToken(token)
  return { wrapper, router, auth }
}

describe('AdminsPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows loading state', () => {
    mockList.mockReturnValue(new Promise(() => {}))
    const { wrapper } = mountPage()
    expect(wrapper.text()).toContain('LOADING ADMINS')
  })

  it('renders admin list', async () => {
    mockList.mockResolvedValue(adminsData)
    const { wrapper } = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('Super Admin')
    expect(wrapper.text()).toContain('super@futureguide.id')
    expect(wrapper.text()).toContain('SUPERADMIN')
    expect(wrapper.text()).toContain('Regular Admin')
    expect(wrapper.text()).toContain('ADMIN')
  })

  it('shows MUST CHANGE PW badge', async () => {
    mockList.mockResolvedValue(adminsData)
    const { wrapper } = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('MUST CHANGE PW')
  })

  it('shows NEW ADMIN button for superadmin', async () => {
    mockList.mockResolvedValue(adminsData)
    const { wrapper } = mountPage('superadmin')
    await flushPromises()
    expect(wrapper.text()).toContain('[ NEW ADMIN ]')
  })

  it('hides NEW ADMIN button for regular admin', async () => {
    mockList.mockResolvedValue(adminsData)
    const { wrapper } = mountPage('admin')
    await flushPromises()
    expect(wrapper.text()).not.toContain('[ NEW ADMIN ]')
  })

  it('shows action buttons for superadmin', async () => {
    mockList.mockResolvedValue(adminsData)
    const { wrapper } = mountPage('superadmin')
    await flushPromises()
    expect(wrapper.text()).toContain('EDIT')
    expect(wrapper.text()).toContain('RESET PW')
    expect(wrapper.text()).toContain('DELETE')
  })

  it('hides action buttons for regular admin', async () => {
    mockList.mockResolvedValue(adminsData)
    const { wrapper } = mountPage('admin')
    await flushPromises()
    const editButtons = wrapper.findAll('button').filter(b => b.text() === 'EDIT')
    expect(editButtons.length).toBe(0)
  })

  it('shows empty state', async () => {
    mockList.mockResolvedValue({ admins: [] })
    const { wrapper } = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('NO ADMIN USERS')
  })

  it('logs out and redirects to login after self password changes', async () => {
    mockList.mockResolvedValue(adminsData)
    const { wrapper, router, auth } = mountPage()
    await flushPromises()

    await wrapper.findAll('button').find(button => button.text().includes('MY PROFILE'))!.trigger('click')
    const passwords = wrapper.findAll('input[type="password"]')
    await passwords[0]!.setValue('OldP@ss123')
    await passwords[1]!.setValue('NewP@ss456!')
    await wrapper.findAll('button').find(button => button.text().trim() === '[ SAVE ]')!.trigger('click')
    await flushPromises()

    expect(auth.logout).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.name).toBe('login')
  })
})
