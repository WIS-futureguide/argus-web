# Ledger Page Expansion Plan

Status: Ready for implementation
Owner: Argus admin API
Last updated: 2026-05-17

## Context

The ledger feature currently exposes:

- `GET /admin/ledger?month=YYYY-MM` — full monthly P&L (revenue, AI costs, infra costs, opportunity cost, lifetime totals)
- `GET /admin/ledger/months` — months that have data

Infrastructure costs and ledger tunables live in `system_config` (migration 040) under the `ledger.*` namespace. Source of truth for current keys:

| Key | Type | Default | Purpose |
|---|---|---|---|
| `ledger.usd_to_idr_rate` | float | 16500 | Auto-refreshed daily from open.er-api.com |
| `ledger.usd_to_idr_updated_at` | string | "" | RFC3339 timestamp |
| `ledger.infra_cost_db_idr` | int | 0 | Monthly DB hosting cost |
| `ledger.infra_cost_redis_idr` | int | 0 | Monthly Redis hosting cost |
| `ledger.infra_cost_server_idr` | int | 0 | Monthly server/compute cost |
| `ledger.infra_cost_domain_idr` | int | 0 | Monthly domain/DNS cost |
| `ledger.infra_cost_other_idr` | int | 0 | Monthly other infra cost |
| `ledger.token_unit_price_idr` | int | 15000 | Per-token opportunity cost |

## Problems To Solve

1. The page can render top-level totals but cannot drill into the underlying transactions (which orders generated the revenue, which AI calls produced the cost).
2. Infra costs are edited one key at a time through the generic config UI. Worse, they're a single global value — raising server cost in July retroactively rewrites May's P&L. Historical months must keep their original cost basis.
3. Lifetime infra is computed as `current_monthly × 1` rather than as a true historical sum.
4. There is no month-over-month comparison and no way to lock the exchange rate for reporting.
5. Manual exchange-rate override has no precedence model — auto-refresh would overwrite it the next day.

## Goals

- Add drill-down endpoints for revenue and AI cost so admins can reconcile totals with raw rows.
- Promote infrastructure cost from flat config keys to a versioned, time-windowed schema so historical months keep their original cost basis.
- Provide first-class endpoints for editing infra costs and the exchange rate, with audit trail and live invalidation.
- Add month-over-month comparison with server-computed deltas.
- Make manual exchange-rate override sticky until explicitly cleared.

## Non-Goals

- CSV / PDF export.
- Multi-currency support beyond USD/IDR.
- Forecasting, budgets, or alerts (leave to monitoring profile / Grafana).
- Grants drill-down (already covered by `GET /admin/users/{id}/transactions?type=grant`).
- Token unit price dedicated endpoints (the generic `PUT /admin/config/ledger.token_unit_price_idr` already covers it).
- Per-user revenue attribution (already covered by `GET /admin/users/{id}/transactions`).
- Changes to non-ledger admin features.

---

## Data Model Changes

### New table: `infra_cost_periods`

Versions infrastructure cost by effective month. Each row is the current cost for a category starting at `effective_from`. The cost applied to a given month is the row whose `effective_from` is the latest one `<= month_start`.

```sql
CREATE TABLE infra_cost_periods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category        TEXT NOT NULL CHECK (category IN ('database','redis','server','domain','other')),
    cost_idr        BIGINT NOT NULL CHECK (cost_idr >= 0 AND cost_idr <= 1000000000),
    effective_from  DATE NOT NULL CHECK (effective_from = date_trunc('month', effective_from)::date),
    note            TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
    created_by      UUID NOT NULL REFERENCES admin_users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (category, effective_from)
);

CREATE INDEX idx_infra_cost_periods_lookup
    ON infra_cost_periods (category, effective_from DESC);
```

Design notes:

- `effective_from` is constrained to first-of-month. Mid-month server upgrades round to the next month boundary. P&L is reported monthly; sub-month precision is noise.
- `UNIQUE (category, effective_from)` makes the lookup deterministic with no tiebreaker. To correct a typo the admin runs DELETE then re-INSERT, which is a conscious "I'm overwriting March" rather than a silent shadow row.
- Append-only as a workflow, not as a constraint. DELETE is allowed even on the last row for a category — that category contributes 0 to subsequent P&L until a new row is added.

### Source-of-truth flip for legacy keys

Migration `041_infra_cost_periods.up.sql`:

1. Creates the table above.
2. Seeds one row per category from current `system_config` values:
   ```sql
   INSERT INTO infra_cost_periods (category, cost_idr, effective_from, note, created_by)
   SELECT
       split_part(s.key, '_', 3),  -- db, redis, server, domain, other
       s.value::bigint,
       date_trunc('month', NOW())::date,
       'seeded from system_config during migration 041',
       (SELECT id FROM admin_users WHERE role = 'superadmin' ORDER BY created_at LIMIT 1)
   FROM system_config s
   WHERE s.key LIKE 'ledger.infra_cost_%_idr';
   ```
3. Deletes the five legacy keys from `system_config`. Generic config UI no longer shows them.

Down migration recreates the legacy keys from the latest period row per category before dropping the table, so rollback is data-safe.

### Keep in `system_config`

- `ledger.usd_to_idr_rate` — single global value
- `ledger.usd_to_idr_updated_at` — RFC3339 timestamp
- `ledger.usd_to_idr_source` — **new key, added in migration 041**, `"auto"` or `"manual"`, default `"auto"`
- `ledger.token_unit_price_idr` — single global value, edited via generic config endpoint

Rationale: exchange rate, source flag, and token price do not benefit from periodization — there is one current value at any time, and `system_config_audit` already tracks changes.

---

## API Surface

All endpoints live under `/admin/ledger/*` and require admin JWT. Mutations require **superadmin** (enforced both by router middleware `h.SuperAdminOnly` and by service-layer role check, matching existing pattern). Read endpoints are open to any admin — consistent with the existing pattern (Overview, User Management, Assessment QA all use any-admin reads).

### Read endpoints (any admin)

#### `GET /admin/ledger?month=YYYY-MM`
Existing. Internally switches to `infra_cost_periods` lookup so historical months reflect the cost basis active at that time. Response shape unchanged at the top level. The `lifetime` block gains one field:

```jsonc
{
  "lifetime": {
    "revenue_idr": 12500000,
    "ai_costs_usd": 3.42,
    "ai_costs_idr": 56430,
    "infra_costs_idr": 6000000,
    "infra_costs_from_month": "2026-05",  // earliest infra_cost_periods.effective_from; null if no rows yet
    "net_profit_idr": 6443570
  }
}
```

#### `GET /admin/ledger/months`
Existing. No change.

#### `GET /admin/ledger/compare?month=YYYY-MM&against=prev|YYYY-MM`
Returns both months' full `LedgerResponse` plus a `delta` block with server-computed diffs. Default `against=prev` resolves to the previous calendar month.

```jsonc
{
  "current":  { /* LedgerResponse for month */ },
  "previous": { /* LedgerResponse for against month */ },
  "delta": {
    "revenue_idr":          { "absolute": 500000, "percent": 12.0 },
    "ai_costs_idr":         { "absolute": -10000, "percent": -5.0 },
    "infra_costs_idr":      { "absolute":      0, "percent":  0.0 },
    "net_profit_idr":       { "absolute": 510000, "percent": 18.0 },
    "profit_margin_points": 3.2  // delta in percentage points, not percent
  }
}
```

Validation: both months parse as `YYYY-MM`; `against != month`; if `current` has zero revenue, `percent` fields are null (avoid divide-by-zero). Internally calls `GetLedger` twice in parallel via `errgroup`.

#### `GET /admin/ledger/revenue?month=YYYY-MM&limit=&cursor=&package_id=`
Keyset-paginated list of completed `payment_orders` for the month.

Columns returned: `id`, `user_id`, `user_email`, `package_id`, `package_label`, `amount_idr`, `payment_method`, `completed_at`. Backed by `payment_orders` JOIN `users`. Cursor: `(completed_at DESC, id DESC)`. `limit` default 20, max 100.

#### `GET /admin/ledger/ai-usage?month=YYYY-MM&limit=&cursor=&category=&model=&provider=`
Keyset-paginated list of `ai_usage_logs` rows for the month with `success = true`.

Columns: `id`, `created_at`, `provider`, `model`, `operation`, `category` (computed: `chat | embedding | ab_test | analysis`, same expression as in `GetMonthlyAICosts`), `prompt_tokens`, `completion_tokens`, `total_tokens`, `latency_ms`, `estimated_cost_usd`, `assessment_id`, `chat_session_id`. Cursor: `(created_at DESC, id DESC)`.

### Infrastructure cost endpoints

#### `GET /admin/ledger/infra-costs?month=YYYY-MM` (any admin)
Returns the cost basis active for that month plus the full history across all categories. Default `month` is current month.

```jsonc
{
  "month": "2026-05",
  "active": [
    { "category": "database", "cost_idr": 250000, "effective_from": "2026-04-01", "note": "...", "period_id": "uuid" },
    { "category": "redis",    "cost_idr": 100000, "effective_from": "2026-01-01", "note": "",   "period_id": "uuid" },
    { "category": "server",   "cost_idr": 800000, "effective_from": "2026-05-01", "note": "Upgraded to 4 vCPU", "period_id": "uuid" },
    { "category": "domain",   "cost_idr":  50000, "effective_from": "2025-01-01", "note": "",   "period_id": "uuid" },
    { "category": "other",    "cost_idr":      0, "effective_from": "2025-01-01", "note": "",   "period_id": "uuid" }
  ],
  "total_idr": 1200000,
  "history": [
    { "id": "uuid", "category": "server", "cost_idr": 800000, "effective_from": "2026-05-01", "note": "...", "created_by": "admin@x", "created_at": "..." },
    { "id": "uuid", "category": "server", "cost_idr": 600000, "effective_from": "2025-11-01", "note": "...", "created_by": "admin@x", "created_at": "..." }
  ]
}
```

`history` is ordered by `(effective_from DESC, category)`.

#### `PUT /admin/ledger/infra-costs` (superadmin)
Batch upsert. One row inserted in `infra_cost_periods` per item, all in a single transaction.

Request:
```json
{
  "effective_from": "2026-05-01",
  "note": "Q2 server upgrade",
  "items": [
    { "category": "database", "cost_idr": 250000 },
    { "category": "server",   "cost_idr": 800000 }
  ]
}
```

Validation:
- `effective_from` is required, must equal `date_trunc('month', value)`, must be `<= first day of next month` (no scheduling costs more than one month into the future).
- `items` length 1–5, no duplicate `category` within the request.
- `category` ∈ `{database, redis, server, domain, other}`.
- `0 <= cost_idr <= 1_000_000_000`.
- `note` length ≤ 500.

If any `(category, effective_from)` already exists, the entire request is rejected with **409** and sentinel `ErrInfraCostConflict`. To overwrite, the admin must DELETE the existing period first.

Side effects:
- Single DB transaction (`BEGIN ... COMMIT`); partial state cannot land.
- One row in `admin_activity_log` with `action="update_infra_cost"`, details containing the request body and inserted period IDs.
- Publishes Redis invalidation on the `runtimeconfig:invalidate` channel with key prefix `ledger.infra_cost_*` so other Argus instances refresh any in-memory caches (currently none, but hooks the future).

Response: same shape as `GET /admin/ledger/infra-costs?month={effective_from month}`.

#### `DELETE /admin/ledger/infra-costs/{period_id}` (superadmin)
Removes a single historical period entry. Returns 404 (`ErrInfraCostNotFound`) if no such row. Allowed even when it's the last row for a category — that category will contribute 0 to subsequent P&L until a new row is added.

Logged to `admin_activity_log` with `action="delete_infra_cost"`.

### Exchange rate endpoints

#### `GET /admin/ledger/exchange-rate` (any admin)
Returns current rate, source flag, last update, and last 10 audit entries from `system_config_audit` for `ledger.usd_to_idr_rate`.

```jsonc
{
  "usd_to_idr": 16780.5,
  "source": "manual",            // "auto" | "manual" | "cached" | "fallback"
  "updated_at": "2026-05-17T08:00:00Z",
  "audit": [
    { "id": 12, "old_value": "16500.00", "new_value": "16780.50", "changed_by": "admin@x", "changed_at": "...", "reason": "Locking rate for May reporting" }
  ]
}
```

`source` semantics:

| Value | Meaning |
|---|---|
| `auto` | Last write was the auto-refresher; rate is fresh (≤ 24h old). |
| `manual` | Last write was an admin override; auto-refresher will skip until cleared. Persisted in `ledger.usd_to_idr_source`. |
| `cached` | Auto-refresh was due but the upstream call failed; using the stored value. Transient — never persisted. |
| `fallback` | No value ever stored, using default 16500. Transient — never persisted. |

#### `PUT /admin/ledger/exchange-rate` (superadmin)
Manually override the rate. Sets:
- `ledger.usd_to_idr_rate` = the new value
- `ledger.usd_to_idr_updated_at` = `NOW()` (RFC3339)
- `ledger.usd_to_idr_source` = `"manual"`

Body:
```json
{ "usd_to_idr": 16780.5, "reason": "Locking rate for May reporting" }
```

Validation: `1000 < usd_to_idr < 100000` (catches typos like dropped zeros). `reason` is required, non-empty.

Side effects: three `runtimeconfig.Store.Set` calls (one transaction internally, audited via `system_config_audit`). One row in `admin_activity_log` with `action="update_exchange_rate_manual"`.

#### `POST /admin/ledger/exchange-rate/refresh` (superadmin)
Forces a refetch from open.er-api.com **and clears manual mode**. After successful refresh:
- `ledger.usd_to_idr_rate` = the freshly fetched rate
- `ledger.usd_to_idr_updated_at` = `NOW()`
- `ledger.usd_to_idr_source` = `"auto"`

Rate-limited to 6/hour/admin (Redis-backed). If the upstream fetch fails, returns **502** with sentinel `ErrExchangeRefreshFailed` and leaves all three keys unchanged. Logged to `admin_activity_log` with `action="refresh_exchange_rate"` regardless of success/failure (success/error captured in details).

This endpoint is the only way to leave manual mode, by design.

### Auto-refresh behaviour change

`getExchangeRate(ctx)` in `ledger_service.go` is updated:

```text
read source from ledger.usd_to_idr_source (default "auto")
if source == "manual":
    return persisted rate, source = "manual"      // never auto-refresh
else:
    if rate is stale (> 24h):
        try refresh:
            success → persist rate + updated_at + source="auto", return
            failure → return persisted rate, source = "cached" (or "fallback" if never set)
    else:
        return persisted rate, source = "auto"
```

---

## Authorization Summary

| Endpoint | Method | Role |
|---|---|---|
| `/admin/ledger` | GET | any admin |
| `/admin/ledger/months` | GET | any admin |
| `/admin/ledger/compare` | GET | any admin |
| `/admin/ledger/revenue` | GET | any admin |
| `/admin/ledger/ai-usage` | GET | any admin |
| `/admin/ledger/infra-costs` | GET | any admin |
| `/admin/ledger/infra-costs` | PUT | superadmin |
| `/admin/ledger/infra-costs/{period_id}` | DELETE | superadmin |
| `/admin/ledger/exchange-rate` | GET | any admin |
| `/admin/ledger/exchange-rate` | PUT | superadmin |
| `/admin/ledger/exchange-rate/refresh` | POST | superadmin |

The drill-down reads expose nothing that `GET /admin/users/{id}/transactions` and `GET /admin/users/{id}` don't already expose to any admin, so the consistency choice is to keep all reads at admin-tier.

---

## Service Layer Changes

### `repository/infra_cost.go` (new)

```go
type InfraCostRepository interface {
    GetActive(ctx context.Context, month time.Time) ([]InfraCostPeriod, error)
    GetHistory(ctx context.Context) ([]InfraCostPeriod, error)
    CreateBatch(ctx context.Context, periods []InfraCostPeriod) error
    Delete(ctx context.Context, id string) error
    LifetimeTotal(ctx context.Context) (int64, *time.Time, error)  // total IDR, from-month
}

type InfraCostPeriod struct {
    ID            string
    Category      string
    CostIDR       int64
    EffectiveFrom time.Time
    Note          string
    CreatedBy     string
    CreatedAt     time.Time
}
```

`GetActive` query (single round trip):
```sql
SELECT DISTINCT ON (category)
       id, category, cost_idr, effective_from, note, created_by, created_at
FROM infra_cost_periods
WHERE effective_from <= $1
ORDER BY category, effective_from DESC;
```

`LifetimeTotal` query:
```sql
WITH bounds AS (
    SELECT MIN(effective_from) AS earliest FROM infra_cost_periods
),
months AS (
    SELECT generate_series(
        (SELECT earliest FROM bounds),
        date_trunc('month', NOW())::date,
        interval '1 month'
    )::date AS m
),
active AS (
    SELECT m.m, p.cost_idr
    FROM months m
    CROSS JOIN LATERAL (
        SELECT DISTINCT ON (category) cost_idr
        FROM infra_cost_periods
        WHERE effective_from <= m.m
        ORDER BY category, effective_from DESC
    ) p
)
SELECT
    COALESCE(SUM(cost_idr), 0)            AS total_idr,
    (SELECT earliest FROM bounds)         AS from_month;
```

Returns `(0, nil)` if `infra_cost_periods` is empty. Frontend renders "Lifetime infra (since {from_month})" so day-1 rollout (lifetime = current month only) reads honestly.

### `repository/ledger.go` extensions

Add list methods for drill-downs:

```go
type LedgerRepository interface {
    // existing: GetMonthlyRevenue, GetLifetimeRevenue,
    //           GetMonthlyAICosts, GetLifetimeAICosts,
    //           GetMonthlyGrants, GetAvailableMonths

    // new
    ListRevenue(ctx context.Context, q ListRevenueQuery) ([]RevenueRow, string, error)
    ListAIUsage(ctx context.Context, q ListAIUsageQuery) ([]AIUsageRow, string, error)
}
```

Cursors are opaque base64-encoded `(timestamp, id)` tuples, matching the existing keyset pattern in `assessment_postgres.go` and `user_postgres.go`.

### `service/ledger_service.go` changes

- Replace `getInfraCosts()` with `getInfraCosts(ctx, month time.Time)` calling `InfraCostRepository.GetActive`. Categories with no row contribute 0.
- Replace lifetime infra calc — call `InfraCostRepository.LifetimeTotal`, expose `infra_costs_from_month` in the response.
- Update `getExchangeRate` per the auto-refresh behaviour change above. Read `ledger.usd_to_idr_source` from the store.
- New methods:
  - `Compare(ctx, month, against)`
  - `ListRevenue(ctx, query)`, `ListAIUsage(ctx, query)`
  - `GetInfraCosts(ctx, month)`, `UpdateInfraCosts(ctx, req, adminID, role)`, `DeleteInfraCostPeriod(ctx, id, adminID, role)`
  - `GetExchangeRate(ctx)`, `UpdateExchangeRate(ctx, value, reason, adminID, role)`, `RefreshExchangeRate(ctx, adminID, role)`
- Each mutation calls the existing `ActivityLogger` interface to record `admin_activity_log` rows.

### Sentinel errors (new)

```go
var (
    ErrLedgerValidation       = errors.New("ledger validation failed")
    ErrInfraCostConflict      = errors.New("infra cost period already exists for this category and month")
    ErrInfraCostNotFound      = errors.New("infra cost period not found")
    ErrExchangeRefreshFailed  = errors.New("exchange rate refresh failed")
)
```

`service.ErrForbidden` and `service.ErrInvalidMonth` reused from existing code.

### Error mapping (handler → HTTP)

| Condition | HTTP | Sentinel |
|---|---|---|
| Validation fails (bad month, out-of-range cost, bad effective_from, etc.) | 400 | `ErrLedgerValidation` or `ErrInvalidMonth` |
| `(category, effective_from)` already exists on PUT | 409 | `ErrInfraCostConflict` |
| Period ID not found on DELETE | 404 | `ErrInfraCostNotFound` |
| Non-superadmin on mutation | 403 | `ErrForbidden` |
| Exchange rate refresh failed (upstream down or 4xx) | 502 | `ErrExchangeRefreshFailed` |
| Refresh rate-limit exceeded | 429 | (rate-limit middleware) |

All wrapped through `httputil.WriteError` for the canonical `{"message": "..."}` shape.

### `main.go` route registration

```go
// Ledger
r.Get("/ledger", ledgerH.GetLedger)
r.Get("/ledger/months", ledgerH.GetMonths)
r.Get("/ledger/compare", ledgerH.Compare)
r.Get("/ledger/revenue", ledgerH.ListRevenue)
r.Get("/ledger/ai-usage", ledgerH.ListAIUsage)

r.Get("/ledger/infra-costs", ledgerH.GetInfraCosts)
r.With(h.SuperAdminOnly).Put("/ledger/infra-costs", ledgerH.UpdateInfraCosts)
r.With(h.SuperAdminOnly).Delete("/ledger/infra-costs/{period_id}", ledgerH.DeleteInfraCostPeriod)

r.Get("/ledger/exchange-rate", ledgerH.GetExchangeRate)
r.With(h.SuperAdminOnly).Put("/ledger/exchange-rate", ledgerH.UpdateExchangeRate)
r.With(
    h.SuperAdminOnly,
    middleware.RateLimitMiddleware(rdb, 6, 1*time.Hour, middleware.WithTrustedProxyCIDRs(cfg.TrustedProxyCIDRs)),
).Post("/ledger/exchange-rate/refresh", ledgerH.RefreshExchangeRate)
```

---

## Hard Rules Compliance

- Keyset pagination on every list endpoint, indexed by `(timestamp DESC, id DESC)`.
- All queries parameterized; admin list queries avoid heavy fields.
- Repository pattern preserved.
- `UpdateInfraCosts` is one DB transaction; partial state cannot land.
- Mutations write to `admin_activity_log`. Exchange-rate writes additionally audit through `system_config_audit` via `runtimeconfig.Store.Set`.
- Superadmin enforced at router (`h.SuperAdminOnly`) **and** service layer (`role != "superadmin"` → `ErrForbidden`), defense-in-depth matching existing pattern.
- Refresh exchange rate rate-limited 6/hour/admin to protect upstream.

---

## Migration & Rollout

1. **Migration 041** (`041_infra_cost_periods.up.sql`):
   - `CREATE TABLE infra_cost_periods` with constraints above.
   - `INSERT` one row per category from `system_config` legacy keys, `effective_from = first_of_current_month`, `created_by = first superadmin`.
   - `INSERT INTO system_config` the new key `ledger.usd_to_idr_source = 'auto'`.
   - `DELETE FROM system_config WHERE key LIKE 'ledger.infra_cost_%_idr'`.
2. **Down migration** (`041_infra_cost_periods.down.sql`):
   - Recreate the five legacy `system_config` keys from the most recent period row per category.
   - `DELETE FROM system_config WHERE key = 'ledger.usd_to_idr_source'`.
   - `DROP TABLE infra_cost_periods`.
3. **Service deploy** — admin-service deploy bundles migration 041 + the new endpoints in one release. No dual-write phase, no compatibility shim. Existing tests that reference legacy keys (`ledger_handler_test.go`, `ledger_service_test.go`, `ledger_edge_test.go`) are rewritten to the Argus repository and table.
4. **Frontend cutover** — frontend ledger page replaces its calls to `PUT /admin/config/ledger.infra_cost_*_idr` with `PUT /admin/ledger/infra-costs`. Deployment order: backend first (legacy keys still readable in audit log), frontend second.

---

## Test Coverage

### Repository
- `repository/infra_cost_postgres_test.go`:
  - `GetActive` for: empty table, one row in past, one row in future (ignored), multiple categories with different effective_from, query month before any row.
  - `CreateBatch` rejects duplicate `(category, effective_from)` with PG constraint error mapped to `ErrInfraCostConflict`.
  - `Delete` returns row-count zero → handled as `ErrInfraCostNotFound`.
  - `LifetimeTotal` arithmetic across changing periods (e.g. server cost rises mid-history, sum reflects each month's active rate).
- `repository/ledger_postgres_test.go` extended with `ListRevenue` and `ListAIUsage` keyset round-trips.

### Service
- `service/ledger_service_test.go` extended:
  - `Compare` returns correct deltas, percent fields null when current revenue is 0.
  - `UpdateInfraCosts` validation (bad month, out-of-range cost, dup category, > 5 items, `effective_from` more than one month in future).
  - `UpdateInfraCosts` non-superadmin → `ErrForbidden`.
  - `UpdateExchangeRate` flips source to `"manual"` and writes audit.
  - `RefreshExchangeRate` clears manual flag on success, leaves keys unchanged on failure, returns `ErrExchangeRefreshFailed` on upstream error.
  - `getExchangeRate` skips refresh entirely when source is `"manual"`.
- `service/ledger_edge_test.go`:
  - Historical month P&L stays stable when a new infra cost period is inserted with a future `effective_from`.
  - Historical month P&L changes correctly when a period is added with a past `effective_from`.
  - Lifetime infra returns 0 with null `from_month` when table is empty.

### Handler
- `handler/ledger_handler_test.go`:
  - Every mutation requires superadmin (403 for plain admin).
  - Validation errors return 400 with canonical `{"message": ...}` shape.
  - Compare endpoint round-trips both shapes.
  - Drill-down endpoints return correct cursors that round-trip on the next page.
  - Refresh endpoint hits rate limit at 7th call within an hour, returns 429.

---

## Open Questions

1. Should `infra_cost_periods` support `effective_to` for one-time costs (single-month consultancy fee)? Current design treats every row as effective until superseded. Adding nullable `effective_to` later doesn't break the lookup query.
2. Should `package_id → label` mapping move out of repository code into the payment-service catalog? Out of scope here, but worth a follow-up.
