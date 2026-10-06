import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createRouter, createMemoryHistory } from 'vue-router'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { useAuthStore } from '@/stores/auth'
import PotensiDetailPage from './PotensiDetailPage.vue'
import { potensiApi, riasecOptions, oceanOptions, virtueOptions, type PotensiDetail } from '@/lib/api-potensi'
vi.mock('@/lib/api-potensi', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/api-potensi')>()
  return { ...original, potensiApi: { detail: vi.fn(), audit: vi.fn(), updateEntry: vi.fn(), publish: vi.fn() } }
})
const entries = riasecOptions.flatMap(r => oceanOptions.flatMap(o => virtueOptions.map(v => ({
  cell_id: `${r}-${o}-${v}`, name: `${r} ${o} ${v}`, description: 'Kecenderungan untuk berlatih', example_activities: 'Membaca', example_majors: 'Sastra',
}))))
const detail: PotensiDetail = { id: 'v1', label: 'v1', status: 'draft', created_by: null, created_at: '2026-10-04', updated_at: '2026-10-04', entries }
let wrapper: VueWrapper
let client: QueryClient
async function setup(role = 'superadmin') {
  localStorage.clear()
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/app/potensi', name: 'potensi', component: { template: '<div />' } },
    { path: '/app/potensi/:id', name: 'potensi-detail', component: PotensiDetailPage },
  ] })
  await router.push('/app/potensi/v1')
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  wrapper = mount(PotensiDetailPage, { global: {
    plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: false }), router, [VueQueryPlugin, { queryClient: client }]],
    stubs: { Modal: { props: ['open'], template: '<div v-if="open"><slot /></div>' } },
  } })
  useAuthStore().setToken(`e30.${btoa(JSON.stringify({ sub: 'test', role, exp: 9999999999 }))}.test`)
  await flushPromises()
}
function button(text: string) { return wrapper.findAll('button').find(b => b.text() === text)! }
describe('PotensiDetailPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(potensiApi.detail).mockResolvedValue(structuredClone(detail))
    vi.mocked(potensiApi.audit).mockResolvedValue({ audit: [] })
    vi.mocked(potensiApi.updateEntry).mockResolvedValue({ updated: true })
    vi.mocked(potensiApi.publish).mockResolvedValue({ published: true })
  })
  afterEach(() => { wrapper?.unmount(); client?.clear() })
  it('renders 180 entries and filters all three dimensions including ES', async () => {
    await setup()
    expect(wrapper.findAll('[data-testid="entry-row"]')).toHaveLength(180)
    await wrapper.find('[aria-label="Filter RIASEC"]').setValue('R')
    expect(wrapper.findAll('[data-testid="entry-row"]')).toHaveLength(30)
    await wrapper.find('[aria-label="Filter OCEAN"]').setValue('ES')
    expect(wrapper.findAll('[data-testid="entry-row"]')).toHaveLength(6)
    await wrapper.find('[aria-label="Filter virtue"]').setValue('Wisdom')
    expect(wrapper.findAll('[data-testid="entry-row"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('R-ES-Wisdom')
  })
  it('edits a copied entry, warns about copy and refreshes data/audit', async () => {
    await setup()
    await wrapper.find('[aria-label="Edit R-O-Wisdom"]').trigger('click')
    await wrapper.find('input').setValue('Skill baru')
    expect(wrapper.find('[role="alert"]').text()).toContain('skill')
    // Unsaved edits must not alter the displayed catalog.
    expect(wrapper.findAll('[data-testid="entry-row"]')[0]!.text()).not.toContain('Skill baru')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(potensiApi.updateEntry).toHaveBeenCalledWith('v1', { ...entries[0], name: 'Skill baru' })
    expect(potensiApi.detail).toHaveBeenCalledTimes(2)
    expect(potensiApi.audit).toHaveBeenCalledTimes(2)
    expect(wrapper.find('form').exists()).toBe(false)
  })
  it('shows deduplicated warnings across fields and still allows saving editorial copy', async () => {
    await setup()
    await wrapper.find('[aria-label="Edit R-O-Wisdom"]').trigger('click')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    await wrapper.find('input').setValue('TALENTA talenta')
    const textareas = wrapper.findAll('textarea')
    await textareas[0]!.setValue('Keterampilan TALENTA')
    await textareas[1]!.setValue('keterampilan')
    await textareas[2]!.setValue('Talenta')
    expect(wrapper.find('[role="alert"]').text()).toContain('Peringatan copy: talenta, keterampilan.')
    expect(button('Simpan entri').attributes('disabled')).toBeUndefined()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(potensiApi.updateEntry).toHaveBeenCalledWith('v1', { ...entries[0],
      name: 'TALENTA talenta', description: 'Keterampilan TALENTA',
      example_activities: 'keterampilan', example_majors: 'Talenta',
    })
  })
  it('clears the warning when all fields return to normal copy', async () => {
    await setup()
    await wrapper.find('[aria-label="Edit R-O-Wisdom"]').trigger('click')
    await wrapper.findAll('textarea')[2]!.setValue('TALENTA')
    expect(wrapper.find('[role="alert"]').text()).toContain('talenta')
    await wrapper.findAll('textarea')[2]!.setValue('Sastra')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
  it('requires explicit confirmation before publishing, then becomes read-only', async () => {
    await setup()
    await button('Publikasikan versi').trigger('click')
    expect(button('Konfirmasi publikasi').attributes('disabled')).toBeDefined()
    await wrapper.find('form').trigger('submit')
    expect(potensiApi.publish).not.toHaveBeenCalled()
    await wrapper.find('input[type="checkbox"]').setValue(true)
    vi.mocked(potensiApi.detail).mockResolvedValue({ ...detail, status: 'active' })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(potensiApi.publish).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('active')
    expect(wrapper.find('[aria-label="Edit R-O-Wisdom"]').exists()).toBe(false)
  })
  it.each(['active', 'retired'] as const)('blocks editing %s versions', async status => {
    vi.mocked(potensiApi.detail).mockResolvedValue({ ...detail, status })
    await setup()
    expect(wrapper.findAll('button').some(b => b.text() === 'Edit')).toBe(false)
    expect(wrapper.text()).toContain('Akses baca saja')
  })
  it('blocks all mutations for admins even on drafts', async () => {
    await setup('admin')
    expect(wrapper.findAll('button').some(b => ['Edit', 'Publikasikan versi'].includes(b.text()))).toBe(false)
    expect(potensiApi.publish).not.toHaveBeenCalled()
  })
  it('keeps edited text on server conflicts', async () => {
    vi.mocked(potensiApi.updateEntry).mockRejectedValue({ status: 409, message: 'version immutable' })
    await setup()
    await wrapper.find('[aria-label="Edit R-O-Wisdom"]').trigger('click')
    await wrapper.find('input').setValue('Baru')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('version immutable')
    expect(wrapper.find('input').element.value).toBe('Baru')
  })
  it('renders audit and keyset next page, with escaped details', async () => {
    vi.mocked(potensiApi.audit).mockResolvedValue({ audit: [{ id: 'a1', action: 'potensi_create_draft', admin_email: 'audit@example.test', ip_address: '203.0.113.8', details: { label: '<img src=x>' }, created_at: '2026-10-04' }], next_cursor: 'next' })
    await setup('admin')
    expect(wrapper.text()).toContain('audit@example.test')
    expect(wrapper.text()).toContain('<img src=x>')
    expect(wrapper.find('img').exists()).toBe(false)
    await button('Audit berikutnya').trigger('click')
    await flushPromises()
    expect(potensiApi.audit).toHaveBeenLastCalledWith('v1', 'next')
  })
  it('shows separate detail/audit errors', async () => {
    vi.mocked(potensiApi.audit).mockRejectedValue(new Error('offline'))
    await setup()
    expect(wrapper.text()).toContain('Gagal memuat audit')
    wrapper.unmount(); client.clear()
    vi.mocked(potensiApi.detail).mockRejectedValue(new Error('404'))
    await setup()
    expect(wrapper.text()).toContain('Gagal memuat katalog')
  })
})
