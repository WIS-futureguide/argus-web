import { api } from '@/lib/api'

// -----------------------------------------------------------------------------
// Shared unions
// -----------------------------------------------------------------------------

export type FxSource = 'auto' | 'manual' | 'cached' | 'fallback'
export type InfraCategory = 'database' | 'redis' | 'server' | 'domain' | 'other'
export type AiCategory = 'analysis' | 'chat' | 'embedding' | 'ab_test'
export type AiProvider = 'gemini' | 'openrouter'

// -----------------------------------------------------------------------------
// Monthly P&L summary (`GET /admin/ledger`)
// -----------------------------------------------------------------------------

export interface ExchangeRate {
  usd_to_idr: number
  updated_at: string
  source: FxSource
}

export interface RevenueBreakdownItem {
  package_id: string
  label: string
  count: number
  total_idr: number
}

export interface AiCostBreakdownItem {
  category: AiCategory
  model: string
  cost_usd: number
  cost_idr: number
  call_count: number
}

/**
 * Infra cost row in the monthly summary or active basis.
 *
 * Categories with no period row show `cost_idr: 0` and **omit** `effective_from`,
 * `note`, `period_id` (JSON `omitempty`). Treat all three as optional client-side.
 */
export interface InfraCostBreakdownItem {
  category: InfraCategory
  cost_idr: number
  effective_from?: string
  note?: string
  period_id?: string
}

export interface LedgerResponse {
  period: string
  exchange_rate: ExchangeRate
  lifetime: {
    revenue_idr: number
    ai_costs_usd: number
    ai_costs_idr: number
    infra_costs_idr: number
    /** First month with a cost basis. `null` when no infra cost periods exist yet. */
    infra_costs_from_month: string | null
    net_profit_idr: number
  }
  monthly: {
    revenue: {
      total_idr: number
      order_count: number
      breakdown: RevenueBreakdownItem[]
    }
    ai_costs: {
      total_usd: number
      total_idr: number
      breakdown: AiCostBreakdownItem[]
    }
    infra_costs: {
      total_idr: number
      /** Always 5 entries (one per category). */
      breakdown: InfraCostBreakdownItem[]
    }
    opportunity_cost: {
      tokens_granted: number
      equivalent_idr: number
    }
    summary: {
      revenue_idr: number
      total_costs_idr: number
      net_profit_idr: number
      profit_margin_percent: number
    }
  }
}

// -----------------------------------------------------------------------------
// Months index (`GET /admin/ledger/months`)
// -----------------------------------------------------------------------------

export interface LedgerMonth {
  month: string
  has_revenue: boolean
  has_costs: boolean
}

// -----------------------------------------------------------------------------
// Compare (`GET /admin/ledger/compare`)
// -----------------------------------------------------------------------------

export interface CompareDelta {
  /** `null` when previous value was 0 (avoids divide-by-zero). */
  absolute: number
  percent: number | null
}

export interface CompareData {
  current: LedgerResponse
  previous: LedgerResponse
  delta: {
    revenue_idr: CompareDelta
    ai_costs_idr: CompareDelta
    infra_costs_idr: CompareDelta
    net_profit_idr: CompareDelta
    /** Delta in percentage *points*, not percent change. */
    profit_margin_points: number
  }
}

// -----------------------------------------------------------------------------
// Revenue drill-down (`GET /admin/ledger/revenue`)
// -----------------------------------------------------------------------------

export interface RevenueRow {
  id: string
  user_id: string
  user_email: string
  package_id: string
  package_label: string
  amount_idr: number
  payment_method: string
  completed_at: string
}

export interface RevenueListResponse {
  rows: RevenueRow[]
  /** Empty string `""` or absent when no more pages. Treat as opaque token. */
  next_cursor?: string
}

export interface RevenueListParams {
  month?: string
  cursor?: string
  limit?: number
  package_id?: string
}

// -----------------------------------------------------------------------------
// AI usage drill-down (`GET /admin/ledger/ai-usage`)
// -----------------------------------------------------------------------------

export interface AiUsageRow {
  id: string
  created_at: string
  provider: AiProvider | string
  model: string
  operation: string
  category: AiCategory | string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  latency_ms: number
  estimated_cost_usd: number
  assessment_id?: string | null
  chat_session_id?: string | null
}

export interface AiUsageListResponse {
  rows: AiUsageRow[]
  next_cursor?: string
}

export interface AiUsageListParams {
  month?: string
  cursor?: string
  limit?: number
  category?: AiCategory
  model?: string
  provider?: AiProvider
}

// -----------------------------------------------------------------------------
// Infra costs (`GET/PUT /admin/ledger/infra-costs`, `DELETE .../{id}`)
// -----------------------------------------------------------------------------

export interface InfraCostHistoryEntry {
  id: string
  category: InfraCategory
  cost_idr: number
  effective_from: string
  note: string
  /** Resolved admin display name (full_name or email), not UUID. */
  created_by: string
  created_at: string
}

export interface InfraCostsResponse {
  month: string
  /** Always 5 entries (one per category). */
  active: InfraCostBreakdownItem[]
  total_idr: number
  /** Capped at 200 rows, sorted by `effective_from DESC, category ASC`. */
  history: InfraCostHistoryEntry[]
}

export interface InfraCostsUpdateItem {
  category: InfraCategory
  cost_idr: number
}

export interface InfraCostsUpdateRequest {
  /** `YYYY-MM-DD`, must be day-1 of a month, max +1 month into future. */
  effective_from: string
  note?: string
  /** 1–5 items, no duplicate `category`. */
  items: InfraCostsUpdateItem[]
}

// -----------------------------------------------------------------------------
// Exchange rate (`GET/PUT /admin/ledger/exchange-rate`, `POST .../refresh`)
// -----------------------------------------------------------------------------

export interface ExchangeRateAuditEntry {
  id: number
  old_value: string
  new_value: string
  changed_by: string
  changed_at: string
  reason: string
}

export interface ExchangeRateResponse {
  usd_to_idr: number
  source: FxSource
  updated_at: string
  /** Always an array (empty `[]` if no history yet, never `null`). */
  audit: ExchangeRateAuditEntry[]
}

export interface ExchangeRateUpdateRequest {
  /** Exclusive bounds: > 1000 and < 100000. */
  usd_to_idr: number
  reason: string
}

// -----------------------------------------------------------------------------
// Query string helper
// -----------------------------------------------------------------------------

function buildQuery(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== '' && v !== null,
  )
  if (entries.length === 0) return ''
  return (
    '?' +
    entries
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&')
  )
}

// -----------------------------------------------------------------------------
// Client
// -----------------------------------------------------------------------------

export const ledgerApi = {
  // --- Reads ---------------------------------------------------------------

  getSummary(month?: string): Promise<LedgerResponse> {
    return api.get<LedgerResponse>(`/admin/ledger${buildQuery({ month })}`)
  },

  months(): Promise<{ months: LedgerMonth[] }> {
    return api.get<{ months: LedgerMonth[] }>('/admin/ledger/months')
  },

  getCompare(month?: string, against: 'prev' | string = 'prev'): Promise<CompareData> {
    return api.get<CompareData>(`/admin/ledger/compare${buildQuery({ month, against })}`)
  },

  getRevenue(params: RevenueListParams = {}): Promise<RevenueListResponse> {
    return api.get<RevenueListResponse>(`/admin/ledger/revenue${buildQuery({ ...params })}`)
  },

  getAiUsage(params: AiUsageListParams = {}): Promise<AiUsageListResponse> {
    return api.get<AiUsageListResponse>(`/admin/ledger/ai-usage${buildQuery({ ...params })}`)
  },

  getInfraCosts(month?: string): Promise<InfraCostsResponse> {
    return api.get<InfraCostsResponse>(`/admin/ledger/infra-costs${buildQuery({ month })}`)
  },

  getExchangeRate(): Promise<ExchangeRateResponse> {
    return api.get<ExchangeRateResponse>('/admin/ledger/exchange-rate')
  },

  // --- Writes (superadmin only) -------------------------------------------

  updateInfraCosts(req: InfraCostsUpdateRequest): Promise<InfraCostsResponse> {
    return api.put<InfraCostsResponse>('/admin/ledger/infra-costs', req)
  },

  deleteInfraCost(periodId: string): Promise<void> {
    return api.delete<void>(`/admin/ledger/infra-costs/${encodeURIComponent(periodId)}`)
  },

  updateExchangeRate(req: ExchangeRateUpdateRequest): Promise<ExchangeRateResponse> {
    return api.put<ExchangeRateResponse>('/admin/ledger/exchange-rate', req)
  },

  refreshExchangeRate(): Promise<ExchangeRateResponse> {
    return api.post<ExchangeRateResponse>('/admin/ledger/exchange-rate/refresh')
  },
}
