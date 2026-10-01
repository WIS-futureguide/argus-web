import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createRouter, createMemoryHistory } from 'vue-router'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import MonitoringPage from '@/pages/MonitoringPage.vue'

const mockStatus = vi.fn()

vi.mock('@/lib/api-monitoring', () => ({
  monitoringApi: {
    status: (...args: unknown[]) => mockStatus(...args),
  },
}))

const monitoringData = {
  timestamp: '2026-05-15T08:30:00Z',
  postgres: {
    status: 'healthy',
    active_connections: 12,
    max_connections: 100,
    pool_total: 20,
    pool_idle: 15,
    pool_in_use: 5,
    db_size_bytes: 524288000,
    outbox_unpublished: 2,
    outbox_stuck: 0,
  },
  redis: {
    status: 'healthy',
    used_memory_mb: 45.0,
    connected_clients: 8,
    pubsub_channels: 2,
    uptime_seconds: 864000,
  },
  queue: {
    pending: 3,
    active: 1,
    dlq: 0,
    stale_claims: 0,
  },
  services: {
    auth: { status: 'healthy', status_code: 200, latency: '5.123ms' },
    assessment: { status: 'healthy', status_code: 200, latency: '8.456ms' },
  },
  tunnel: {
    auth: { status: 'healthy', status_code: 200, latency: '120.789ms' },
    pay: { status: 'unhealthy', error: 'connection failed' },
  },
  workers: [
    { worker_id: 'worker-abc123', ttl_seconds: 25 },
  ],
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/monitoring', name: 'monitoring', component: { template: '<div />' } },
    ],
  })
}

function mountPage() {
  const router = createTestRouter()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = mount(MonitoringPage, {
    global: {
      plugins: [
        createTestingPinia({ createSpy: vi.fn, stubActions: false }),
        router,
        [VueQueryPlugin, { queryClient }],
      ],
    },
  })

  return wrapper
}

describe('MonitoringPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state', () => {
    mockStatus.mockReturnValue(new Promise(() => {}))
    const wrapper = mountPage()
    expect(wrapper.text()).toContain('LOADING MONITORING DATA')
  })

  it('renders postgres status', async () => {
    mockStatus.mockResolvedValue(monitoringData)
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('POSTGRES')
    expect(wrapper.text()).toContain('HEALTHY')
    expect(wrapper.text()).toContain('12 / 100')
  })

  it('shows ready queue rows without hazard and labels expired leases', async () => {
    mockStatus.mockResolvedValue(monitoringData)
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('QUEUE READY')
    expect(wrapper.text()).toContain('EXPIRED LEASES')
    expect(wrapper.text()).not.toContain('OUTBOX')
    expect(wrapper.text()).not.toContain('STALE CLAIMS')
    const readyValue = wrapper.findAll('dt').find((dt) => dt.text() === 'QUEUE READY')?.element.nextElementSibling
    expect(readyValue?.textContent).toBe('2')
    expect(readyValue?.classList.contains('text-hazard')).toBe(false)
  })

  it('renders redis status', async () => {
    mockStatus.mockResolvedValue(monitoringData)
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('REDIS')
    expect(wrapper.text()).toContain('45.0 MB')
    expect(wrapper.text()).toContain('10d 0h')
  })

  it('renders queue stats', async () => {
    mockStatus.mockResolvedValue(monitoringData)
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('QUEUE')
    expect(wrapper.text()).toContain('PENDING')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('DLQ')
  })

  it('renders services and tunnels', async () => {
    mockStatus.mockResolvedValue(monitoringData)
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('AUTH')
    expect(wrapper.text()).toContain('5.123ms')
    expect(wrapper.text()).toContain('PAY')
    expect(wrapper.text()).toContain('connection failed')
    expect(wrapper.text()).toContain('UNHEALTHY')
  })

  it('renders workers', async () => {
    mockStatus.mockResolvedValue(monitoringData)
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('worker-abc123')
    expect(wrapper.text()).toContain('TTL: 25s')
  })

  it('renders refresh button', async () => {
    mockStatus.mockResolvedValue(monitoringData)
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('[ REFRESH ]')
  })

  it('shows timestamp', async () => {
    mockStatus.mockResolvedValue(monitoringData)
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('2026-05-15 08:30:00')
  })
})
