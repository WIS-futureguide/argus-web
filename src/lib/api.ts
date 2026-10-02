import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useRateLimit } from '@/composables/useRateLimit'
import { router } from '@/router'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://api.futureguide.id').replace(/\/+$/, '')

export interface ApiError {
  message: string
  status: number
  retryAfter?: number
}

async function handleResponse<T>(response: Response): Promise<T> {
  const auth = useAuthStore()
  const toast = useToast()
  const rateLimit = useRateLimit()

  rateLimit.update(response)

  if (response.ok) {
    return response.json() as Promise<T>
  }

  const status = response.status
  let message = ''

  try {
    const body = await response.json()
    message = body.message ?? ''
  } catch {
    message = ''
  }

  if (status === 401) {
    auth.logout()
    router.push({ name: 'login' })
    throw { message: 'Sesi berakhir', status } satisfies ApiError
  }

  if (status === 403) {
    toast.error('Session expired or permissions changed')
    auth.logout()
    router.push({ name: 'login' })
    throw { message, status } satisfies ApiError
  }

  if (status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60', 10)
    toast.error(message || 'Terlalu banyak permintaan', retryAfter)
    throw { message, status, retryAfter } satisfies ApiError
  }

  if (status === 503) {
    toast.error(message || 'Layanan tidak tersedia, coba lagi nanti')
    throw { message, status } satisfies ApiError
  }

  if (status >= 500) {
    toast.error('Terjadi kesalahan sistem')
    throw { message: 'Terjadi kesalahan sistem', status } satisfies ApiError
  }

  throw { message, status } satisfies ApiError
}

function getHeaders(): HeadersInit {
  const auth = useAuthStore()
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`
  }
  return headers
}

export const api = {
  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: getHeaders(),
    })
    return handleResponse<T>(response)
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(response)
  },

  async put<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(body),
    })
    return handleResponse<T>(response)
  },

  async delete<T>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })
    return handleResponse<T>(response)
  },
}

export const authApi = {
  async login(email: string, password: string): Promise<{ token: string }> {
    const response = await fetch(`${API_BASE}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Login gagal' }))
      throw { message: body.message ?? 'Login gagal', status: response.status } satisfies ApiError
    }
    return response.json()
  },
}
