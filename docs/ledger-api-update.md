# Ledger Page — Frontend API Reference

Base URL: `https://api.futureguide.id` (tunnel) or `http://localhost:8085` (local)

All endpoints require admin JWT in `Authorization: Bearer <token>`. Mutations (PUT/POST/DELETE) require **superadmin** role.

---

## 1. Monthly P&L Summary

### `GET /admin/ledger?month=YYYY-MM`

Returns full monthly profit & loss breakdown with lifetime totals and exchange rate info.

**Query params:**
| Param | Required | Default | Note |
|-------|----------|---------|------|
| `month` | no | current month | Format `YYYY-MM` |

**Response `200`:**
```json
{
  "period": "2026-05",
  "exchange_rate": {
    "usd_to_idr": 16500.0,
    "updated_at": "2026-05-17T08:00:00Z",
    "source": "auto"
  },
  "lifetime": {
    "revenue_idr": 12500000,
    "ai_costs_usd": 3.42,
    "ai_costs_idr": 56430,
    "infra_costs_idr": 6000000,
    "infra_costs_from_month": "2026-01",
    "net_profit_idr": 6443570
  },
  "monthly": {
    "revenue": {
      "total_idr": 4500000,
      "order_count": 3,
      "breakdown": [
        { "package_id": "pkg_basic", "label": "Basic (5 tokens)", "count": 2, "total_idr": 3000000 },
        { "package_id": "pkg_pro", "label": "Pro (15 tokens)", "count": 1, "total_idr": 1500000 }
      ]
    },
    "ai_costs": {
      "total_usd": 1.23,
      "total_idr": 20295,
      "breakdown": [
        { "category": "analysis", "model": "gemini-2.5-flash", "cost_usd": 0.80, "cost_idr": 13200, "call_count": 3 },
        { "category": "chat", "model": "deepseek/deepseek-chat-v3", "cost_usd": 0.35, "cost_idr": 5775, "call_count": 12 },
        { "category": "embedding", "model": "gemini-embedding-001", "cost_usd": 0.08, "cost_idr": 1320, "call_count": 3 }
      ]
    },
    "infra_costs": {
      "total_idr": 1200000,
      "breakdown": [
        { "category": "database", "cost_idr": 250000, "effective_from": "2026-04-01T00:00:00Z", "note": "", "period_id": "uuid" },
        { "category": "redis", "cost_idr": 100000, "effective_from": "2026-01-01T00:00:00Z", "period_id": "uuid" },
        { "category": "server", "cost_idr": 800000, "effective_from": "2026-05-01T00:00:00Z", "note": "Upgraded to 4 vCPU", "period_id": "uuid" },
        { "category": "domain", "cost_idr": 50000, "effective_from": "2025-01-01T00:00:00Z", "period_id": "uuid" },
        { "category": "other", "cost_idr": 0 }
      ]
    },
    "opportunity_cost": {
      "tokens_granted": 5,
      "equivalent_idr": 75000
    },
    "summary": {
      "revenue_idr": 4500000,
      "total_costs_idr": 1220295,
      "net_profit_idr": 3279705,
      "profit_margin_percent": 72.88
    }
  }
}
```

**Notes:**
- Top-level key is `period`, not `month`.
- `lifetime.infra_costs_from_month` is `null` if no infra cost periods exist yet.
- `lifetime.infra_costs_idr` is a true historical sum (each month uses its own cost basis).
- `monthly.infra_costs.breakdown` always has 5 entries (one per category). Categories with no period row show `cost_idr: 0` and omit `effective_from`, `note`, `period_id` fields.
- `monthly.ai_costs.breakdown` is grouped by `(category, model)`.
- `monthly.summary.total_costs_idr` = AI costs IDR + infra costs IDR (opportunity cost is informational, not subtracted).

---

## 2. Available Months

### `GET /admin/ledger/months`

Returns months that have ledger data, with flags indicating what data exists.

**Response `200`:**
```json
{
  "months": [
    { "month": "2026-05", "has_revenue": true, "has_costs": true },
    { "month": "2026-04", "has_revenue": true, "has_costs": true },
    { "month": "2026-03", "has_revenue": false, "has_costs": true }
  ]
}
```

**Notes:**
- Each entry is an object with `month` (string), `has_revenue` (bool), `has_costs` (bool).
- Use `has_revenue` / `has_costs` to show indicators in the month selector UI.

---

## 3. Month-over-Month Comparison

### `GET /admin/ledger/compare?month=YYYY-MM&against=prev|YYYY-MM`

Returns two full P&L responses plus server-computed deltas.

**Query params:**
| Param | Required | Default | Note |
|-------|----------|---------|------|
| `month` | no | current month | Month to compare |
| `against` | no | `prev` | `prev` = previous calendar month, or explicit `YYYY-MM` |

**Validation:** `against` must differ from `month`. Both must be valid `YYYY-MM`.

**Response `200`:**
```json
{
  "current": { /* full LedgerResponse shape (see section 1) */ },
  "previous": { /* full LedgerResponse shape (see section 1) */ },
  "delta": {
    "revenue_idr": { "absolute": 500000, "percent": 12.0 },
    "ai_costs_idr": { "absolute": -10000, "percent": -5.0 },
    "infra_costs_idr": { "absolute": 0, "percent": 0.0 },
    "net_profit_idr": { "absolute": 510000, "percent": 18.0 },
    "profit_margin_points": 3.2
  }
}
```

**Notes:**
- `percent` fields are `null` when the previous value is 0 (avoids divide-by-zero).
- `profit_margin_points` is delta in percentage **points**, not percent change.
- Both months are fetched in parallel server-side — no extra latency vs two separate calls.

---

## 4. Revenue Drill-Down

### `GET /admin/ledger/revenue?month=YYYY-MM&limit=&cursor=&package_id=`

Keyset-paginated list of completed payment orders for the month.

**Query params:**
| Param | Required | Default | Note |
|-------|----------|---------|------|
| `month` | no | current month | `YYYY-MM` |
| `limit` | no | `20` | Max `100` |
| `cursor` | no | — | Opaque string from previous response |
| `package_id` | no | — | Filter by package |

**Response `200`:**
```json
{
  "rows": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "user_email": "user@example.com",
      "package_id": "pkg_basic",
      "package_label": "Basic (5 tokens)",
      "amount_idr": 75000,
      "payment_method": "qris",
      "completed_at": "2026-05-15T10:30:00Z"
    }
  ],
  "next_cursor": "eyJjcmVhdGVkX2F0IjoiMjAyNi0wNS0xNVQxMDozMDowMFoiLCJpZCI6ImFiYzEyMyJ9"
}
```

**Notes:**
- Response key is `rows`, not `items`.
- `next_cursor` is `""` (empty string) or absent when no more pages.
- Sorted by `completed_at DESC, id DESC`.

---

## 5. AI Usage Drill-Down

### `GET /admin/ledger/ai-usage?month=YYYY-MM&limit=&cursor=&category=&model=&provider=`

Keyset-paginated list of successful AI usage logs for the month.

**Query params:**
| Param | Required | Default | Note |
|-------|----------|---------|------|
| `month` | no | current month | `YYYY-MM` |
| `limit` | no | `20` | Max `100` |
| `cursor` | no | — | Opaque string from previous response |
| `category` | no | — | Must be one of: `analysis`, `chat`, `embedding`, `ab_test` |
| `model` | no | — | Filter by model name (exact match) |
| `provider` | no | — | Filter: `gemini`, `openrouter` |

**Response `200`:**
```json
{
  "rows": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "created_at": "2026-05-15T10:30:00Z",
      "provider": "gemini",
      "model": "gemini-2.5-flash",
      "operation": "generate_analysis",
      "category": "analysis",
      "prompt_tokens": 12500,
      "completion_tokens": 3200,
      "total_tokens": 15700,
      "latency_ms": 4500,
      "estimated_cost_usd": 0.0045,
      "assessment_id": "uuid-or-null",
      "chat_session_id": "uuid-or-null"
    }
  ],
  "next_cursor": "eyJjcmVhdGVkX2F0IjoiMjAyNi0wNS0xNVQxMDozMDowMFoiLCJpZCI6ImFiYzEyMyJ9"
}
```

**Notes:**
- Response key is `rows`, not `items`.
- `assessment_id` and `chat_session_id` are `null` when not applicable (omitted via `omitempty`).
- Invalid `category` value returns `400`.
- Sorted by `created_at DESC, id DESC`.

---

## 6. Infrastructure Costs

### `GET /admin/ledger/infra-costs?month=YYYY-MM`

Returns the active cost basis for the given month plus full change history.

**Query params:**
| Param | Required | Default | Note |
|-------|----------|---------|------|
| `month` | no | current month | `YYYY-MM` |

**Response `200`:**
```json
{
  "month": "2026-05",
  "active": [
    { "category": "database", "cost_idr": 250000, "effective_from": "2026-04-01T00:00:00Z", "note": "", "period_id": "uuid" },
    { "category": "redis", "cost_idr": 100000, "effective_from": "2026-01-01T00:00:00Z", "period_id": "uuid" },
    { "category": "server", "cost_idr": 800000, "effective_from": "2026-05-01T00:00:00Z", "note": "Upgraded to 4 vCPU", "period_id": "uuid" },
    { "category": "domain", "cost_idr": 50000, "effective_from": "2025-01-01T00:00:00Z", "period_id": "uuid" },
    { "category": "other", "cost_idr": 0 }
  ],
  "total_idr": 1200000,
  "history": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "category": "server",
      "cost_idr": 800000,
      "effective_from": "2026-05-01T00:00:00Z",
      "note": "Upgraded to 4 vCPU",
      "created_by": "Admin Name",
      "created_at": "2026-05-01T08:00:00Z"
    }
  ]
}
```

**Notes:**
- `active` always has 5 entries (one per category: `database`, `redis`, `server`, `domain`, `other`).
- Categories with no period row show `cost_idr: 0` and **omit** `effective_from`, `note`, `period_id` (JSON `omitempty`).
- `history` is capped at 200 rows, sorted by `effective_from DESC, category ASC`.
- `created_by` resolves to admin display name (full_name or email), not UUID.
- All timestamps are RFC3339 format.

---

### `PUT /admin/ledger/infra-costs` — Superadmin only

Batch insert new cost periods. All items share the same `effective_from` and `note`.

**Request:**
```json
{
  "effective_from": "2026-06-01",
  "note": "Q2 server upgrade",
  "items": [
    { "category": "database", "cost_idr": 250000 },
    { "category": "server", "cost_idr": 800000 }
  ]
}
```

**Validation rules:**
| Field | Rule |
|-------|------|
| `effective_from` | Required. Format `YYYY-MM-DD`. Must be day 1 of a month. Max 1 month into the future. |
| `note` | Optional. Max 500 characters. |
| `items` | Required. 1–5 items. No duplicate `category` within the request. |
| `items[].category` | One of: `database`, `redis`, `server`, `domain`, `other`. |
| `items[].cost_idr` | Integer, range `0` – `1,000,000,000`. |

**Conflict handling:** If any `(category, effective_from)` already exists in the database, the **entire batch is rejected** with `409`. To overwrite, DELETE the existing period first, then PUT again.

**Responses:**
| Status | Condition |
|--------|-----------|
| `200` | Success — returns same shape as `GET /admin/ledger/infra-costs?month={effective_from month}` |
| `400` | Validation error |
| `403` | Not superadmin |
| `409` | Period already exists for that `(category, effective_from)` |

---

### `DELETE /admin/ledger/infra-costs/{period_id}` — Superadmin only

Removes a single historical period entry.

**Path params:**
| Param | Note |
|-------|------|
| `period_id` | UUID of the period to delete. Returns `400` if not a valid UUID format. |

**Responses:**
| Status | Condition |
|--------|-----------|
| `204` | Deleted (no response body) |
| `400` | Invalid UUID format |
| `403` | Not superadmin |
| `404` | Period not found |

---

## 7. Exchange Rate

### `GET /admin/ledger/exchange-rate`

Returns current rate, source flag, last update timestamp, and last 10 audit entries.

**Response `200`:**
```json
{
  "usd_to_idr": 16780.5,
  "source": "manual",
  "updated_at": "2026-05-17T08:00:00Z",
  "audit": [
    {
      "id": 12,
      "old_value": "16500.00",
      "new_value": "16780.50",
      "changed_by": "admin@example.com",
      "changed_at": "2026-05-17T08:00:00Z",
      "reason": "Locking rate for May reporting"
    }
  ]
}
```

**`source` values:**
| Value | Meaning | Persisted? | UI hint |
|-------|---------|------------|---------|
| `auto` | Auto-refreshed from open.er-api.com (fresh, ≤ 24h old) | yes | Green indicator |
| `manual` | Admin override active — auto-refresh paused | yes | Yellow/locked indicator |
| `cached` | Auto-refresh was due but upstream failed; using stored value | no (transient) | Orange warning |
| `fallback` | No value ever stored; using default 16500 | no (transient) | Red warning |

**Notes:**
- `audit` is always an array (empty `[]` if no history yet, never `null`).
- Audit entries come from `system_config_audit` table for the `ledger.usd_to_idr_rate` key.

---

### `PUT /admin/ledger/exchange-rate` — Superadmin only

Manually override the exchange rate. Pins `source = "manual"` which pauses auto-refresh until explicitly cleared via the refresh endpoint.

**Request:**
```json
{
  "usd_to_idr": 16780.5,
  "reason": "Locking rate for May reporting"
}
```

**Validation:**
| Field | Rule |
|-------|------|
| `usd_to_idr` | Required. Must be strictly greater than `1000` and strictly less than `100000` (exclusive bounds). |
| `reason` | Required. Non-empty string. |

**Responses:**
| Status | Condition |
|--------|-----------|
| `200` | Updated — returns same shape as `GET /admin/ledger/exchange-rate` |
| `400` | Validation error |
| `403` | Not superadmin |

---

### `POST /admin/ledger/exchange-rate/refresh` — Superadmin only

Force-refresh from upstream API (open.er-api.com) **and clear manual override**. This is the **only way** to exit manual mode.

**Request:** empty body.

**Responses:**
| Status | Condition |
|--------|-----------|
| `200` | Refreshed — returns same shape as `GET /admin/ledger/exchange-rate` |
| `403` | Not superadmin |
| `429` | Rate limited (max 6 calls/hour per IP) |
| `502` | Upstream fetch failed — all rate keys left unchanged |

**Notes:**
- On success, `source` flips to `"auto"` and auto-refresh resumes normally.
- On `502`, the admin can retry later. The manual lock (if it was set) remains in place.

---

## Error Shape

All errors follow the canonical format:

```json
{ "message": "human-readable error description" }
```

Common error messages by status:
| Status | Example message |
|--------|-----------------|
| `400` | `"invalid month format, expected YYYY-MM"`, `"ledger validation failed: items must not be empty"` |
| `403` | `"superadmin role required"` |
| `404` | `"infra cost period not found"` |
| `409` | `"infra cost period already exists for this category and month"` |
| `429` | (rate limiter response) |
| `502` | `"exchange rate refresh failed"` |

---

## Pagination Pattern

List endpoints (`/revenue`, `/ai-usage`) use **keyset pagination**:

1. First request: omit `cursor`.
2. Response includes `next_cursor` (opaque base64-URL-encoded string).
3. Pass `next_cursor` as `cursor` query param for next page.
4. When `next_cursor` is `""` (empty string) or absent, there are no more pages.

Rules:
- Never decode or construct cursors client-side — treat them as opaque tokens.
- Cursors encode `(timestamp, id)` internally but this is an implementation detail.
- Invalid cursor returns `400` with message `"ledger validation failed: invalid cursor"`.

---

## Feature Summary

This ledger expansion provides:

| Feature | Endpoint | What it solves |
|---------|----------|----------------|
| **Drill-down** | `/revenue`, `/ai-usage` | Admins can reconcile totals with raw transaction rows |
| **Versioned infra costs** | `/infra-costs` GET/PUT/DELETE | Historical months keep their original cost basis; no retroactive P&L rewrite |
| **Month comparison** | `/compare` | Server-computed deltas for month-over-month trends |
| **Sticky manual FX rate** | `/exchange-rate` PUT | Override won't be silently overwritten by auto-refresh |
| **Explicit FX unlock** | `/exchange-rate/refresh` POST | Only way to leave manual mode — intentional action |
| **Lifetime infra accuracy** | `lifetime.infra_costs_idr` | True historical sum, not `current_monthly x 1` |
| **Audit trail** | Exchange rate audit in GET response | Full change history visible without separate endpoint |

---

## Suggested Page Layout

```
┌─────────────────────────────────────────────────────────┐
│  Month Selector (from GET /admin/ledger/months)         │
│  [◀ 2026-04]  [2026-05 ▶]                              │
├─────────────────────────────────────────────────────────┤
│  Summary Cards (from monthly.summary + compare delta)   │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌────────┐ │
│  │ Revenue   │ │ AI Costs  │ │  Infra    │ │ Profit │ │
│  │ Rp4.5M    │ │ Rp20.3K   │ │ Rp1.2M    │ │Rp3.3M  │ │
│  │ +12% ▲    │ │ -5% ▼     │ │  0%       │ │+18% ▲  │ │
│  └───────────┘ └───────────┘ └───────────┘ └────────┘ │
├─────────────────────────────────────────────────────────┤
│  Tabs: [Revenue] [AI Usage] [Infra Costs] [FX Rate]    │
├─────────────────────────────────────────────────────────┤
│  Revenue tab:                                           │
│    GET /admin/ledger/revenue                            │
│    Table: email, package, amount, method, date          │
│    Filter: package_id dropdown                          │
│    Pagination: Load More button                         │
│                                                         │
│  AI Usage tab:                                          │
│    GET /admin/ledger/ai-usage                           │
│    Table: time, provider, model, category, tokens, cost │
│    Filters: category, model, provider dropdowns         │
│    Pagination: Load More button                         │
│                                                         │
│  Infra Costs tab:                                       │
│    GET /admin/ledger/infra-costs                        │
│    Active costs card (5 categories, total)              │
│    History table (sortable)                             │
│    [+ Add Cost Period] button (superadmin only)         │
│    [Delete] per row (superadmin only)                   │
│                                                         │
│  FX Rate tab:                                           │
│    GET /admin/ledger/exchange-rate                       │
│    Current rate + source badge + updated_at             │
│    Audit log table                                      │
│    [Override Rate] button (superadmin only)              │
│    [Refresh from API] button (superadmin only)          │
└─────────────────────────────────────────────────────────┘
```

---

## Quick Reference

| Endpoint | Method | Role | Purpose |
|----------|--------|------|---------|
| `/admin/ledger` | GET | any admin | Monthly P&L summary + lifetime |
| `/admin/ledger/months` | GET | any admin | Available months with data flags |
| `/admin/ledger/compare` | GET | any admin | Month-over-month comparison |
| `/admin/ledger/revenue` | GET | any admin | Revenue drill-down (paginated) |
| `/admin/ledger/ai-usage` | GET | any admin | AI cost drill-down (paginated) |
| `/admin/ledger/infra-costs` | GET | any admin | Infra cost basis + history |
| `/admin/ledger/infra-costs` | PUT | superadmin | Add new cost periods (batch) |
| `/admin/ledger/infra-costs/{period_id}` | DELETE | superadmin | Remove a cost period |
| `/admin/ledger/exchange-rate` | GET | any admin | Current rate + source + audit |
| `/admin/ledger/exchange-rate` | PUT | superadmin | Manual override (pins manual mode) |
| `/admin/ledger/exchange-rate/refresh` | POST | superadmin | Force refresh + clear manual mode |
