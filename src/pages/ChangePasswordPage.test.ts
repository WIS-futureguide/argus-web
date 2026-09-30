import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import ChangePasswordPage from '@/pages/ChangePasswordPage.vue'

const mockPut = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    put: (...args: unknown[]) => mockPut(...args),
  },
}))

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/change-password', name: 'change-password', component: { template: '<div />' } },
      { path: '/app/overview', name: 'overview', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } },
    ],
  })
}

function mountPage() {
  const router = createTestRouter()
  const wrapper = mount(ChangePasswordPage, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            auth: {
              token: 'fake-token',
              payload: { sub: '1', email: 'a@b.c', role: 'admin', must_change_password: true, exp: 9999999999 },
            },
          },
        }),
        router,
      ],
    },
  })
  return { wrapper, router, auth: useAuthStore() }
}

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders password change form with three fields', () => {
    const { wrapper } = mountPage()

    const inputs = wrapper.findAll('input[type="password"]')
    expect(inputs).toHaveLength(3)
    expect(wrapper.text()).toContain('CHANGE PASSWORD')
  })

  it('shows error when new passwords do not match', async () => {
    const { wrapper } = mountPage()

    const inputs = wrapper.findAll('input[type="password"]')
    await inputs[0]!.setValue('OldP@ss123')
    await inputs[1]!.setValue('NewP@ss456')
    await inputs[2]!.setValue('DifferentP@ss789')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Password baru tidak cocok')
    expect(mockPut).not.toHaveBeenCalled()
  })

  it('calls API with correct payload when passwords match', async () => {
    mockPut.mockResolvedValue({ message: 'Profile updated' })

    const { wrapper } = mountPage()

    const inputs = wrapper.findAll('input[type="password"]')
    await inputs[0]!.setValue('OldP@ss123')
    await inputs[1]!.setValue('NewP@ss456!')
    await inputs[2]!.setValue('NewP@ss456!')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mockPut).toHaveBeenCalledWith('/admin/admins/me', {
      current_password: 'OldP@ss123',
      new_password: 'NewP@ss456!',
    })
  })

  it('displays API error message on failure', async () => {
    mockPut.mockRejectedValue({ message: 'current password is incorrect', status: 401 })

    const { wrapper } = mountPage()

    const inputs = wrapper.findAll('input[type="password"]')
    await inputs[0]!.setValue('WrongP@ss')
    await inputs[1]!.setValue('NewP@ss456!')
    await inputs[2]!.setValue('NewP@ss456!')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('current password is incorrect')
  })

  it('logs out and redirects to login after password changes', async () => {
    mockPut.mockResolvedValue({ message: 'Profile updated' })
    const { wrapper, router, auth } = mountPage()

    const inputs = wrapper.findAll('input[type="password"]')
    await inputs[0]!.setValue('OldP@ss123')
    await inputs[1]!.setValue('NewP@ss456!')
    await inputs[2]!.setValue('NewP@ss456!')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(auth.logout).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('shows loading state during submission', async () => {
    mockPut.mockReturnValue(new Promise(() => {}))

    const { wrapper } = mountPage()

    const inputs = wrapper.findAll('input[type="password"]')
    await inputs[0]!.setValue('OldP@ss123')
    await inputs[1]!.setValue('NewP@ss456!')
    await inputs[2]!.setValue('NewP@ss456!')

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('PROCESSING')
  })
})
