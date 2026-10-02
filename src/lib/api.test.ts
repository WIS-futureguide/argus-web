import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

const mockRouterPush = vi.fn()
const mockToastError = vi.fn()

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    token: 'fake-token',
    logout: vi.fn(),
  })),
}))

vi.mock('@/router', () => ({
  router: { push: mockRouterPush },
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    error: mockToastError,
    success: vi.fn(),
    dismiss: vi.fn(),
    toasts: { value: [] },
  }),
}))

describe('api client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('makes GET request with auth header', async () => {
    const mockResponse = { stats: {} }
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: () => Promise.resolve(mockResponse),
    })

    const { api } = await import('@/lib/api')
    const result = await api.get('/admin/overview')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.futureguide.id/admin/overview',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer fake-token',
        }),
      })
    )
    expect(result).toEqual(mockResponse)
  })

  it('makes POST request with body', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: () => Promise.resolve({ message: 'ok' }),
    })

    const { api } = await import('@/lib/api')
    await api.post('/admin/users/123/grant-tokens', { amount: 5, reason: 'test' })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.futureguide.id/admin/users/123/grant-tokens',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ amount: 5, reason: 'test' }),
      })
    )
  })

  it('handles 401 by logging out and redirecting', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: () => Promise.resolve({ message: 'unauthorized' }),
    })

    const { api } = await import('@/lib/api')

    await expect(api.get('/admin/overview')).rejects.toMatchObject({
      status: 401,
    })

    expect(mockRouterPush).toHaveBeenCalledWith({ name: 'login' })
  })

  it('handles 403 with toast and redirect', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
      json: () => Promise.resolve({ message: 'forbidden' }),
    })

    const { api } = await import('@/lib/api')

    await expect(api.get('/admin/config')).rejects.toMatchObject({
      status: 403,
    })

    expect(mockToastError).toHaveBeenCalledWith('Session expired or permissions changed')
    expect(mockRouterPush).toHaveBeenCalledWith({ name: 'login' })
  })

  it('handles 429 with retry-after countdown toast', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '30' }),
      json: () => Promise.resolve({ message: 'terlalu banyak permintaan' }),
    })

    const { api } = await import('@/lib/api')

    await expect(api.get('/admin/monitoring')).rejects.toMatchObject({
      status: 429,
      retryAfter: 30,
    })

    expect(mockToastError).toHaveBeenCalledWith('terlalu banyak permintaan', 30)
  })

  it('handles 500 with generic Indonesian message', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: () => Promise.resolve({ message: 'failed to load monitoring status' }),
    })

    const { api } = await import('@/lib/api')

    await expect(api.get('/admin/monitoring')).rejects.toMatchObject({
      message: 'Terjadi kesalahan sistem',
      status: 500,
    })

    expect(mockToastError).toHaveBeenCalledWith('Terjadi kesalahan sistem')
  })

  it('handles 503 by passing through API message', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers(),
      json: () => Promise.resolve({ message: 'layanan tidak tersedia, coba lagi nanti' }),
    })

    const { api } = await import('@/lib/api')

    await expect(api.get('/admin/overview')).rejects.toMatchObject({
      status: 503,
    })

    expect(mockToastError).toHaveBeenCalledWith('layanan tidak tersedia, coba lagi nanti')
  })

  it('authApi.login calls auth endpoint', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'jwt-token' }),
    })

    const { authApi } = await import('@/lib/api')
    const result = await authApi.login('admin@test.com', 'pass123')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.futureguide.id/auth/admin/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'admin@test.com', password: 'pass123' }),
      })
    )
    expect(result.token).toBe('jwt-token')
  })

  it('uses the configured API origin for both admin and login calls', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080/')
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: () => Promise.resolve({ token: 'jwt-token' }),
    })
    const { api, authApi } = await import('@/lib/api')
    await api.get('/admin/overview')
    await authApi.login('admin@test.com', 'pass123')
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8080/admin/overview',
      expect.any(Object)
    )
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8080/auth/admin/login',
      expect.any(Object)
    )
  })
})
