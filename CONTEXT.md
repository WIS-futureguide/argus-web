# Admin FutureGuide — Domain Context

## Product

Admin dashboard for FutureGuide — an AI-powered career assessment platform for Indonesian high school students. This frontend consumes the Admin Service API (`https://api.futureguide.id`) and the Auth Service (`https://api.futureguide.id`).

## Ubiquitous Language

| Term | Definition |
|------|-----------|
| Assessment | A psychometric test submission (RIASEC + OCEAN + VIAIS) that gets analyzed by AI to produce career recommendations |
| Analysis | The AI-generated output from an assessment — includes profile summary, career pathing, and recommendations |
| Token (user) | A consumable credit that users spend to submit assessments. Purchased, granted by admin, or refunded |
| Order | A completed payment transaction where a user purchases token credits. Tracked for revenue reporting |
| Package | A predefined token purchase option (SKU) with a fixed price and token count (e.g. "1 Token", "5 Tokens") |
| Chat Session | A follow-up AI conversation tied to a completed assessment, where users ask career questions |
| Prompt Template | A versioned text template used by the analysis worker to instruct the AI model. Has a `template_key`, content, declared variables, and cache type |
| A/B Test | A side-by-side comparison of two prompt versions run against the same completed assessment to judge quality. Max 3 concurrent pending/running tests |
| Runtime Config | Key-value pairs that control system behavior (model selection, worker count, payment settings) without redeployment. Grouped by category: analysis, chat, assessment, payment, general |
| Ledger | Monthly profit & loss tracking — revenue from token purchases vs AI costs + infrastructure costs. Includes exchange rate (USD→IDR) and opportunity cost (granted tokens) |
| Exchange Rate | The USD-to-IDR conversion rate used in ledger P&L calculations. Single global value with audit trail. Mutated only via FX endpoints, never via generic config |
| Source Flag | The provenance of the current exchange rate: `auto` (refreshed from open.er-api.com, ≤24h old), `manual` (admin override active, auto-refresh paused), `cached` (auto-refresh due but upstream failed, using stored value), `fallback` (never set, default 16500). `auto` and `manual` are persisted; `cached` and `fallback` are transient |
| Manual Lock | A sticky exchange rate override set by superadmin via PUT. Pauses auto-refresh indefinitely. Only cleared by an explicit refresh action (POST /exchange-rate/refresh), which fetches upstream and flips source back to `auto` |
| Cost Period | A versioned row in `infra_cost_periods` defining one infrastructure cost category's rate starting from `effective_from` (day-1 of a month). The cost applied to a given month is the period whose `effective_from` is the latest ≤ that month. Categories: database, redis, server, domain, other |
| Cost Basis | The 5-category active cost set for a given month, computed as the latest Cost Period per category where `effective_from ≤ month_start`. Historical months keep their original basis — adding a future Cost Period does not retroactively rewrite past P&L |
| Opportunity Cost | Revenue foregone when tokens are granted for free instead of purchased. Tracked in ledger as `tokens_granted × token price`. Informational only — not subtracted from P&L summary |
| Admin | A dashboard operator with read access to all data + limited write (user profile edit except email, verify email, self-edit) |
| Superadmin | Full write access — config changes, prompt editing, user suspend/tokens/email edit, admin CRUD, maintenance mode |
| Maintenance Mode | A system-wide flag that blocks user-facing services. Toggled by superadmin via Redis pub/sub |
| Keyset Cursor | Pagination strategy using base64url-encoded `{created_at, id}` pairs. No page numbers, no offset |
| Worker | The analysis-worker process that consumes assessment jobs from a Redis queue and calls Gemini. Can be force-restarted by superadmin (60s cooldown) |
| Independent User | A user not affiliated with any school (no `school_id`) |
| Provider | The authentication method a user registered with: `email` (password-based) or `google` (OAuth). OAuth-only users cannot have their password reset |
| DLQ | Dead Letter Queue — failed assessment jobs that exhausted retries. Visible in monitoring |
| Outbox | Transactional outbox for event publishing. Monitoring tracks unpublished and stuck messages |

## Roles & Access

| Role | Can Read | Can Write |
|------|----------|-----------|
| admin | All endpoints | User profile edit (except email), verify email, self-edit (name + password) |
| superadmin | All endpoints | Everything admin can + config CRUD, prompt edit/revert/toggle, grant/deduct tokens, suspend/unsuspend, revoke sessions, reset user password, admin CRUD, maintenance toggle, A/B test create/verdict, worker restart, user email edit |

Stale token rejection: if an admin is demoted, existing JWTs with the old role are rejected (403) until re-login.

## Technical Decisions

### Stack
- Vue 3 (Composition API) + Vite + TypeScript + Tailwind CSS
- SPA — no SSR (admin dashboard, no SEO needed)
- Radix Vue for headless accessible primitives, fully custom-styled
- TanStack Query (Vue Query) for server state (caching, pagination, polling)
- Pinia for auth state + UI-only state (sidebar, filters)
- Chart.js via vue-chartjs for timeseries and breakdown charts
- Vue Router with nested `/app` prefix layout

### Visual Archetype: Calm Professional + Terminal Accents
- **Palette:** Light slate background (`#F8FAFC`), dark slate text (`#0F172A`), teal brand accent (`#0F766E`), soft borders (`#E2E8F0`)
- **Typography:** Inter sans-serif for body + headings (not monospace-dominant). JetBrains Mono only for explicit `.font-mono` class on data values
- **Accent colors:** Teal `#0F766E` (brand, primary actions, active states), green `#16A34A` (success/positive), red `#DC2626` (danger/negative), slate-500 `#64748B` (faint/secondary)
- **Styling rules:** No border-radius (all 90-degree corners), no gradients, no soft shadows, no translucency
- **Terminal flavor:** ASCII framing (`[ LABEL ]`, `>>> STATUS`, `/// SUBTITLE`) for section headers and status text. Uppercase 11px labels. Monospace data values only
- **Compartmentalization:** Visible borders (`border-2 border-crt-border` for major sections, `border` for tables). Light grid backgrounds for table headers
- **Responsive:** Light theme works on all devices. No dark mode variant

### Routing
```
/login              → AuthLayout
/app/...            → DashboardLayout (sidebar + topbar)
/app/overview
/app/monitoring
/app/users
/app/users/:id
/app/assessments
/app/assessments/:id
/app/assessments/:id/chat
/app/prompts
/app/prompts/:id
/app/ab-tests
/app/ab-tests/:id
/app/ab-tests/new
/app/config
/app/ledger
/app/admins
```

### Sidebar Navigation (always expanded)
```
[ OPERATIONS ]
  Overview
  Monitoring

[ DATA ]
  Users
  Assessments

[ AI ENGINE ]
  Prompts
  A/B Tests

[ SYSTEM ]
  Config
  Ledger
  Admins
```

### Authentication
- Login: POST `https://api.futureguide.id/auth/admin/login` with `{email, password}` → returns `{token: string}` (JWT)
- JWT stored in localStorage, decoded client-side for role + must_change_password (no `/me` endpoint exists)
- JWT payload assumed: `{sub: admin_id, email, role, must_change_password, exp}`
- Token expiry check on route navigation (decode exp, compare to Date.now)
- `must_change_password` gate: forced password change screen (PUT /admin/admins/me) before `/app` access
- Global 401 interceptor: force re-login (token expired or invalid)
- Global 403 interceptor: toast "Session expired or permissions changed" → force re-login (stale role)
- Superadmin-only UI elements: hidden (not rendered), not disabled
- No token refresh — on 401, force re-login
- Login and admin calls share `https://api.futureguide.id`; the dashboard origin is `https://admin.futureguide.id`, allowed by backend CORS.

### Data Fetching
- TanStack Query for all API calls
- Keyset cursor pagination via manual cursor state in `useQuery` (not `useInfiniteQuery` — see ADR-0001)
- Monitoring page: auto-poll every 30s + manual refresh button with cooldown indicator
- Rate limit budget (`X-RateLimit-Remaining`) displayed on rate-limited pages
- On 429: toast with Retry-After countdown, disable triggering action until cooldown expires

### Error Handling
- Terminal-style stacked notifications (top-right, monospace, bordered)
- Hazard red for errors, phosphor white for success
- Auto-dismiss after 5s
- API error messages passed through directly (mix of Indonesian and English depending on endpoint)
- Generic 500s: override with "Terjadi kesalahan sistem" (ignore API's English 500 messages)
- 409 Conflict: display API message as error toast (e.g. "email already in use")
- 429 Rate Limited: toast with countdown from `Retry-After` header (API returns Indonesian message)
- 503 Unavailable: pass through API message ("layanan tidak tersedia, coba lagi nanti")
- Null/omitted fields: display as "—" (em dash) consistently

### Table Patterns
- Row click → navigate to detail page
- No bulk selection/checkboxes (API has no batch endpoints)
- Empty state: centered monospace `[ NO RECORDS FOUND ]`
- Cursor pagination (next/prev), no page numbers

## Development Phases

| Phase | Scope | Key Deliverable |
|-------|-------|-----------------|
| 1 | Foundation & Auth Shell | App boots, login works, layout renders |
| 2 | User Management | Search, inspect, manage users |
| 3 | Assessment QA | QA workflow for AI outputs |
| 4 | Overview & Monitoring | Business stats + infra health |
| 5 | Prompts & A/B Testing | AI quality iteration loop |
| 6 | Config, Ledger & Admins | Full operational coverage |

## API Reference

See `api-admin.md` for full endpoint documentation.

- Base URL: `https://api.futureguide.id`
- Auth URL: `https://api.futureguide.id/auth/admin/login`
- All responses: `{"message": "..."}` for errors
- Pagination: keyset cursor, `next_cursor` omitted (not null) when no more pages
- Nullable vs omitted: see api-admin.md § "Nullable & Omitted Fields"

### API Quirks (frontend must handle)

- **Prompt variables format asymmetry:** GET returns `variables: ["scores", "references"]` (string array), PUT expects `variables: [{"name": "scores"}]` (object array)
- **User detail inline vs paginated:** GET /admin/users/{id} returns assessments, chat_sessions, recent_transactions inline (not paginated). Full transaction history uses GET /admin/users/{id}/transactions (keyset paginated)
- **Config `updated_by`:** empty string `""` (not null, not omitted) when no admin has ever updated the key
- **Exchange rate `updated_at`:** can be empty string `""` if rate was never fetched
- **Monitoring `latency`:** Go duration string format (e.g. `"5.123ms"`, `"1.2s"`), not a number
