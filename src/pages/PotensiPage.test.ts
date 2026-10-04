import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createRouter, createMemoryHistory } from 'vue-router'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { useAuthStore } from '@/stores/auth'
import PotensiPage from './PotensiPage.vue'
import { potensiApi } from '@/lib/api-potensi'
vi.mock('@/lib/api-potensi', () => ({ potensiApi: { list: vi.fn(), createDraft: vi.fn() } }))
const version = { id: 'v1', label: 'v1', status: 'active', created_at: '2026-10-04', updated_at: '2026-10-04', created_by: null }
let wrapper: VueWrapper
let client: QueryClient
async function setup(role = 'superadmin') {
  localStorage.clear()
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/app/potensi', name: 'potensi', component: PotensiPage },
    { path: '/app/potensi/:id', name: 'potensi-detail', component: { template: '<div>detail</div>' } },
  ] })
  await router.push('/app/potensi')
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  wrapper = mount(PotensiPage, { global: {
    plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: false }), router, [VueQueryPlugin, { queryClient: client }]],
    stubs: { Modal: { props: ['open'], template: '<div v-if="open"><slot /></div>' } },
  } })
  useAuthStore().setToken(`e30.${btoa(JSON.stringify({ sub: 'test', role, exp: 9999999999 }))}.test`)
  await flushPromises()
  return router
}
describe('PotensiPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(potensiApi.list).mockResolvedValue({ versions: [version as never], next_cursor: 'next' })
  })
  afterEach(() => { wrapper?.unmount(); client?.clear() })
  it('lists versions and paginates with backend cursor', async () => {
    await setup()
    expect(wrapper.text()).toContain('active')
    await wrapper.findAll('button').find(b => b.text() === 'Berikutnya')!.trigger('click')
    await flushPromises()
    expect(potensiApi.list).toHaveBeenLastCalledWith('next')
    await wrapper.findAll('button').find(b => b.text() === 'Sebelumnya')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('a').attributes('href')).toBe('/app/potensi/v1')
  })
  it('creates a draft and navigates to its detail', async () => {
    vi.mocked(potensiApi.createDraft).mockResolvedValue({ ...version, id: 'v2', status: 'draft', entries: [] } as never)
    const router = await setup()
    await wrapper.findAll('button').find(b => b.text().startsWith('Buat draf'))!.trigger('click')
    await wrapper.find('input').setValue(' v2 ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(potensiApi.createDraft).toHaveBeenCalledWith('v2')
    expect(router.currentRoute.value.params.id).toBe('v2')
  })
  it('gives admins read-only access', async () => {
    await setup('admin')
    expect(wrapper.text()).toContain('Akses baca saja')
    expect(wrapper.findAll('button').some(b => b.text().includes('Buat draf'))).toBe(false)
  })
  it('keeps failed draft form open with server error', async () => {
    vi.mocked(potensiApi.createDraft).mockRejectedValue({ status: 409, message: 'duplicate label' })
    await setup()
    await wrapper.findAll('button').find(b => b.text().startsWith('Buat draf'))!.trigger('click')
    await wrapper.find('input').setValue('v1')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('duplicate label')
    expect(wrapper.find('input').element.value).toBe('v1')
  })
  it('shows fetch error separately from empty results', async () => {
    vi.mocked(potensiApi.list).mockRejectedValue(new Error('offline'))
    await setup()
    expect(wrapper.find('[role="alert"]').text()).toContain('Gagal memuat versi')
    expect(wrapper.text()).not.toContain('Belum ada versi')
  })
  it('shows empty and loading states', async () => {
    vi.mocked(potensiApi.list).mockResolvedValue({ versions: [] })
    await setup()
    expect(wrapper.text()).toContain('Belum ada versi')
    wrapper.unmount(); client.clear()
    vi.mocked(potensiApi.list).mockReturnValue(new Promise(() => {}))
    await setup()
    expect(wrapper.text()).toContain('Memuat versi')
  })
})
