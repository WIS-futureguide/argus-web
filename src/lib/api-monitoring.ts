import { api } from '@/lib/api'

export interface ServiceCheck {
  status: 'healthy' | 'unhealthy' | 'timeout'
  status_code?: number
  latency?: string
  error?: string
}

export interface WorkerInfo {
  worker_id: string
  ttl_seconds: number
}

export interface MonitoringResponse {
  timestamp: string
  postgres: {
    status: 'healthy' | 'unhealthy' | 'timeout'
    active_connections: number
    max_connections: number
    pool_total: number
    pool_idle: number
    pool_in_use: number
    db_size_bytes: number
    outbox_unpublished: number
    outbox_stuck: number
  }
  redis: {
    status: 'healthy' | 'unhealthy' | 'timeout'
    used_memory_mb: number
    connected_clients: number
    pubsub_channels: number
    uptime_seconds: number
  }
  queue: {
    pending: number
    active: number
    dlq: number
    stale_claims: number
  }
  services: Record<string, ServiceCheck>
  tunnel: Record<string, ServiceCheck>
  workers: WorkerInfo[]
}

export const monitoringApi = {
  status(): Promise<MonitoringResponse> {
    return api.get<MonitoringResponse>('/admin/monitoring')
  },
}
