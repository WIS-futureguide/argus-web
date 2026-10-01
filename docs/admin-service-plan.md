# Admin Service — API Plan (SUPERSEDED)

> **This document is superseded by [`docs/api-admin.md`](docs/api-admin.md), which is the source of truth for the admin-service API.**
>
> Key divergences from this plan in the final implementation:
> - Suspend, unsuspend, revoke-sessions, and reset-password require **superadmin** (plan said "any admin")
> - Reset password directly sets a new password and returns it (plan described an email-based forgot-password flow)
> - `analysis_runs.model` column required migration 040 to fix (plan assumed it existed via migration 034)
>
> Retained for historical context only. Do not use for implementation decisions.

---

## Overview Page

### Endpoints

#### `GET /admin/overview`

Returns headline stats + model info. Cheap queries, renders instantly.

**Response shape:**

```json
{
  "stats": {
    "users_registered_today": { "value": 12, "yesterday": 10 },
    "users_verified_today": { "value": 8, "yesterday": 6 },
    "tokens_purchased_today": { "value": 45, "yesterday": 30 },
    "orders_completed_today": { "value": 15, "yesterday": 10 },
    "tokens_granted_today": { "value": 5, "yesterday": 0 },
    "assessments_submitted_today": { "value": 20, "yesterday": 18 },
    "revenue_today_idr": { "value": 500000, "yesterday": 400000 },
    "ai_costs_today_usd": { "value": 1.25, "yesterday": 1.10 },
    "independent_users_total": 340,
    "independent_assessments_total": 120
  },
  "models": {
    "analysis_current": "gemini-2.5-flash",
    "chat_current": "google/gemini-2.5-flash",
    "used_today": [
      { "model": "gemini-2.5-flash", "provider": "gemini", "requests": 45 },
      { "model": "google/gemini-2.5-flash", "provider": "openrouter", "requests": 30 }
    ]
  }
}
```

**Data sources:**

| Stat | Query |
|------|-------|
| Users registered today | `SELECT COUNT(*) FROM users WHERE created_at >= today` |
| Users verified today | `SELECT COUNT(*) FROM users WHERE email_verified = true AND created_at >= today` |
| Tokens purchased today | `SELECT COALESCE(SUM(amount), 0) FROM token_transactions WHERE transaction_type = 'purchase' AND created_at >= today` |
| Orders completed today | `SELECT COUNT(*) FROM payment_orders WHERE status = 'completed' AND completed_at >= today` |
| Tokens granted today | `SELECT COALESCE(SUM(amount), 0) FROM token_transactions WHERE transaction_type = 'grant' AND created_at >= today` |
| Assessments submitted today | `SELECT COUNT(*) FROM assessments WHERE created_at >= today` |
| Revenue today (IDR) | `SELECT COALESCE(SUM(amount_idr), 0) FROM payment_orders WHERE status = 'completed' AND completed_at >= today` |
| AI costs today (USD) | `SELECT COALESCE(SUM(estimated_cost_usd), 0) FROM ai_usage_logs WHERE created_at >= today` |
| Independent users | `SELECT COUNT(*) FROM users WHERE school_id IS NULL` |
| Independent assessments | `SELECT COUNT(*) FROM assessments a JOIN users u ON a.user_id = u.id WHERE u.school_id IS NULL` |
| Current analysis model | `runtimeconfig.Get("analysis.gemini_model")` |
| Current chat model | `runtimeconfig.Get("chat.openrouter_model")` |
| Models used today | `SELECT model, provider, COUNT(*) FROM ai_usage_logs WHERE created_at >= today GROUP BY model, provider` |

**Comparison logic:** Each "today vs yesterday" stat runs the same query for `yesterday_start <= created_at < today_start`. Frontend computes percentage delta from the two values.

---

#### `GET /admin/overview/timeseries?metric={metric}&range={range}`

Returns time-bucketed data for a single metric. Heavier aggregation — loaded lazily by frontend.

**Parameters:**

| Param | Values |
|-------|--------|
| `metric` | `users_registered`, `users_verified`, `tokens_purchased`, `orders_completed`, `assessments_submitted`, `revenue`, `ai_costs` |
| `range` | `today`, `7d`, `30d`, `12mo` |

**Granularity:**

| Range | Bucket | Data points |
|-------|--------|-------------|
| `today` | per hour | 24 |
| `7d` | per day | 7 |
| `30d` | per day | 30 |
| `12mo` | per month | 12 |

**Response shape:**

```json
{
  "metric": "users_registered",
  "range": "7d",
  "data": [
    { "t": "2026-05-09", "v": 12 },
    { "t": "2026-05-10", "v": 8 },
    { "t": "2026-05-11", "v": 0 },
    { "t": "2026-05-12", "v": 15 },
    { "t": "2026-05-13", "v": 6 },
    { "t": "2026-05-14", "v": 9 },
    { "t": "2026-05-15", "v": 4 }
  ]
}
```

**Rules:**
- Zero-filled: every bucket has a value, no gaps
- `today` range uses hour format: `"2026-05-15T08:00:00Z"`
- `7d` and `30d` use date format: `"2026-05-15"`
- `12mo` uses month format: `"2026-05"`
- Rolling windows: `7d` = last 7 days including today, `30d` = last 30 days including today, `12mo` = last 12 months including current month

**Data sources per metric:**

| Metric | Table | Aggregation |
|--------|-------|-------------|
| `users_registered` | `users` | `COUNT(*)` bucketed by `created_at` |
| `users_verified` | `users` | `COUNT(*) WHERE email_verified = true` bucketed by `created_at` |
| `tokens_purchased` | `token_transactions` | `SUM(amount) WHERE type = 'purchase'` bucketed by `created_at` |
| `orders_completed` | `payment_orders` | `COUNT(*) WHERE status = 'completed'` bucketed by `completed_at` |
| `assessments_submitted` | `assessments` | `COUNT(*)` bucketed by `created_at` |
| `revenue` | `payment_orders` | `SUM(amount_idr) WHERE status = 'completed'` bucketed by `completed_at` |
| `ai_costs` | `ai_usage_logs` | `SUM(estimated_cost_usd)` bucketed by `created_at` |

---

#### `GET /admin/overview/schools`

Returns top 10 school rankings. All-time totals.

**Response shape:**

```json
{
  "by_assessments": [
    { "school_id": "uuid", "school_name": "SMA Negeri 1 Jakarta", "count": 245 },
    ...
  ],
  "by_users": [
    { "school_id": "uuid", "school_name": "SMA Negeri 1 Jakarta", "count": 89 },
    ...
  ]
}
```

**Data sources:**

```sql
-- Top 10 schools by assessment count
SELECT s.id, s.name, COUNT(a.id) as count
FROM schools s
JOIN users u ON u.school_id = s.id
JOIN assessments a ON a.user_id = u.id
GROUP BY s.id, s.name
ORDER BY count DESC
LIMIT 10;

-- Top 10 schools by user count
SELECT s.id, s.name, COUNT(u.id) as count
FROM schools s
JOIN users u ON u.school_id = s.id
GROUP BY s.id, s.name
ORDER BY count DESC
LIMIT 10;
```

---

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| New users metric | Show both registered + verified | Conversion funnel signal |
| Token purchases | Show volume + order count + grants separately | Different signals for admin |
| Profit/revenue | Revenue (amount_idr) + AI costs (USD) shown separately | fee_idr goes to Pakasir; no fake currency conversion |
| Time windows | Rolling (7d, 30d) not calendar | Avoids empty charts at period start |
| Chart data shape | `{t, v}` pairs, zero-filled | Self-describing, charting-library friendly |
| Comparison | Today vs yesterday only | Simple directional signal; charts show trends |
| School rankings | All-time, top 10 | Rankings don't shift daily; avoids empty tables |
| Model info | Current config + today's usage breakdown | Status indicator + reality check |
| API split | Overview (fast) + timeseries (lazy) + schools (separate) | Dashboard renders top cards instantly |

---

## QA Assessment Review Page

### Endpoints

#### `GET /admin/assessments`

Paginated assessment list for QA navigation. Keyset pagination, newest first.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `limit` | int | Page size (default 20, max 100) |
| `cursor` | string | Keyset cursor (opaque, from previous response) |
| `school_id` | uuid | Filter by school |
| `status` | string | Filter by status: `pending`, `processing`, `completed`, `failed` |
| `date_from` | datetime | Filter assessments created after this time |
| `date_to` | datetime | Filter assessments created before this time |
| `user_name` | string | ILIKE search on `users.full_name` |
| `user_email` | string | ILIKE search on `users.email` |
| `model` | string | Filter by analysis model used |

**Response shape:**

```json
{
  "assessments": [
    {
      "id": "uuid",
      "user_name": "John Doe",
      "school_name": "SMA Negeri 1 Jakarta",
      "status": "completed",
      "submitted_at": "2026-05-15T08:30:00Z",
      "model_used": "gemini-2.5-flash"
    }
  ],
  "next_cursor": "eyJjcmVhdGVkX2F0IjoiMjAyNi0wNS0xNFQxMDowMDowMFoiLCJpZCI6InV1aWQifQ=="
}
```

**Data source:**

```sql
SELECT a.id, u.full_name AS user_name, s.name AS school_name,
       a.status, a.created_at AS submitted_at, ar.model AS model_used
FROM assessments a
JOIN users u ON a.user_id = u.id
LEFT JOIN schools s ON u.school_id = s.id
LEFT JOIN LATERAL (
    SELECT model FROM analysis_runs
    WHERE assessment_id = a.id
    ORDER BY created_at DESC LIMIT 1
) ar ON true
WHERE ... (filters)
ORDER BY a.created_at DESC, a.id DESC
LIMIT :limit
```

**Keyset cursor:** Encoded `(created_at, id)` pair. Next page: `WHERE (a.created_at, a.id) < (:cursor_created_at, :cursor_id)`.

---

#### `GET /admin/assessments/{id}/detail`

Full assessment detail for QA review. Returns everything except chat messages.

**Response shape:**

```json
{
  "assessment": {
    "id": "uuid",
    "status": "completed",
    "submitted_at": "2026-05-15T08:30:00Z",
    "completed_at": "2026-05-15T08:31:45Z"
  },
  "user": {
    "id": "uuid",
    "full_name": "John Doe",
    "email": "john@example.com",
    "school_name": "SMA Negeri 1 Jakarta",
    "grade": "12",
    "major": "IPA"
  },
  "model_info": {
    "model": "gemini-2.5-flash",
    "attempts": 1,
    "duration_ms": 3200,
    "prompt_tokens": 1200,
    "completion_tokens": 2400,
    "estimated_cost_usd": 0.003
  },
  "scores": {
    "riasec": [
      { "domain": "R", "score": 85 },
      { "domain": "I", "score": 72 },
      { "domain": "A", "score": 60 },
      { "domain": "S", "score": 45 },
      { "domain": "E", "score": 55 },
      { "domain": "C", "score": 40 }
    ],
    "ocean": [
      { "domain": "O", "score": 78 },
      { "domain": "C", "score": 65 },
      { "domain": "E", "score": 50 },
      { "domain": "A", "score": 70 },
      { "domain": "N", "score": 35 }
    ],
    "viais": [
      { "domain": "Creativity", "score": 90 },
      { "domain": "Curiosity", "score": 85 }
    ]
  },
  "answers": {
    "riasec": {
      "R": [
        { "question_number": 1, "question_text": "Saya suka bekerja dengan alat...", "answer": 4, "reverse_scored": false }
      ],
      "I": [ ... ]
    },
    "ocean": {
      "O": [ ... ],
      "C": [ ... ]
    },
    "viais": {
      "Creativity": [ ... ],
      "Curiosity": [ ... ]
    }
  },
  "analysis_result": {
    "profile_summary": {
      "signature_title": "The Analytical Creator",
      "signature_description": "...",
      "learning_style": { "preference": "...", "environment": "..." }
    },
    "detailed_analysis": {
      "strengths": ["...", "..."],
      "weaknesses": ["...", "..."],
      "team_dynamics": { "natural_role": "...", "collaboration_style": "...", "synergy_needs": "..." }
    },
    "career_pathing": {
      "top_industries": ["...", "..."],
      "ideal_work_environment": "...",
      "role_prospects": [
        {
          "role_title": "...",
          "match_reason": "...",
          "market_outlook": "...",
          "automation_risk": "...",
          "wage_structure": { "currency": "IDR", "entry_level": "...", "junior": "...", "senior": "...", "max_potential": "...", "average": "..." }
        }
      ]
    },
    "student_recommendations": {
      "extracurricular_clubs": [{ "club_name": "...", "relevance": "..." }],
      "immediate_actions": [{ "action": "...", "description": "..." }]
    },
    "personal_growth": {
      "development_areas": [{ "area": "...", "action_plan": "..." }],
      "book_recommendations": [{ "title": "...", "author": "...", "relevance": "..." }]
    }
  },
  "chat_summary": {
    "session_id": "uuid",
    "message_count": 12,
    "model_used": "google/gemini-2.5-flash",
    "last_message_at": "2026-05-15T09:15:00Z"
  }
}
```

**Data sources:**

| Section | Tables |
|---------|--------|
| Assessment metadata | `assessments` |
| User info | `users` JOIN `schools` |
| Model + usage | `analysis_runs` + `ai_usage_logs WHERE assessment_id = :id` |
| Scores | `assessment_domain_scores WHERE assessment_id = :id` |
| Answers | `assessment_responses` JOIN `assessment_questions` ON `(assessment_type, question_number)` |
| Analysis result | `assessments.result_data` (JSONB, deserialized as `GeminiAnalysisResult`) |
| Chat summary | `chat_sessions WHERE assessment_id = :id` |

**Notes:**
- Answers are grouped by assessment_type, then by domain (category)
- Each answer includes: question_number, question_text, answer value (1-5), reverse_scored flag
- Analysis result is the full `GeminiAnalysisResult` struct — frontend renders as collapsible accordion
- Chat summary is metadata only; messages loaded separately

---

#### `GET /admin/assessments/{id}/chat`

Full chat message history for an assessment. Loaded on demand when QA expands the chat section.

**Response shape:**

```json
{
  "session": {
    "id": "uuid",
    "model_used": "google/gemini-2.5-flash",
    "message_count": 12,
    "created_at": "2026-05-15T08:35:00Z"
  },
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "What careers match my profile?",
      "token_count": 15,
      "created_at": "2026-05-15T08:35:30Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "Based on your RIASEC profile...",
      "token_count": 250,
      "created_at": "2026-05-15T08:35:45Z"
    }
  ]
}
```

**Data source:**

```sql
SELECT id, role, content, token_count, created_at
FROM chat_messages
WHERE session_id = :session_id
ORDER BY created_at ASC;
```

---

### Comparison Mode

- Up to 3 assessments compared side by side
- Frontend fetches N individual detail responses (`GET /admin/assessments/{id}/detail`)
- Alignment: by section (scores row → answers row → analysis sections)
- Same question_number on same row across columns
- No dedicated comparison endpoint needed — frontend handles layout

---

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| List columns | Name, school, status, submitted_at, model | Enough to identify; scores are too dense for list |
| Scores in list | No | List is for navigation, not analysis |
| Answer display | Question text + value + domain + reverse_scored | QA needs full context to evaluate answer quality |
| Answer grouping | By domain within assessment type | QA sees which answers built each domain score |
| Analysis display | Collapsible accordion, full result in one response | Dense page; let QA focus on relevant sections |
| Chat in detail | Metadata only, expand to load messages | Avoids loading unnecessary data |
| API split | Detail (everything minus chat) + chat (on demand) | Fast initial load, lazy chat |
| Comparison | Up to 3, aligned by section | 3 columns max for readability; row alignment enables diff |
| Pagination | Keyset (created_at DESC, id DESC) | Codebase standard, index-backed, no drift |
| Filters | School, date range, name, status, email, model | All available filterable dimensions |

---

## User Management Page

### Endpoints

#### `GET /admin/users`

Paginated user list. Keyset pagination, newest first.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `limit` | int | Page size (default 20, max 100) |
| `cursor` | string | Keyset cursor (opaque) |
| `name` | string | ILIKE search on `users.full_name` |
| `email` | string | ILIKE search on `users.email` |
| `school_id` | uuid | Filter by school |
| `registered_from` | datetime | Registered after |
| `registered_to` | datetime | Registered before |
| `verified` | bool | Filter by email_verified (omit for all) |
| `suspended` | bool | Filter by suspended (omit for all) |
| `provider` | string | Filter by provider: `email`, `google` |

**Response shape:**

```json
{
  "users": [
    {
      "id": "uuid",
      "full_name": "John Doe",
      "email": "john@example.com",
      "school_name": "SMA Negeri 1 Jakarta",
      "registered_at": "2026-05-10T08:00:00Z",
      "email_verified": true,
      "suspended": false,
      "token_balance": 3,
      "last_assessment_at": "2026-05-14T10:30:00Z"
    }
  ],
  "next_cursor": "..."
}
```

**Data source:**

```sql
SELECT u.id, u.full_name, u.email, s.name AS school_name,
       u.created_at AS registered_at, u.email_verified, u.suspended,
       u.token_balance,
       (SELECT MAX(a.created_at) FROM assessments a WHERE a.user_id = u.id) AS last_assessment_at
FROM users u
LEFT JOIN schools s ON u.school_id = s.id
WHERE ... (filters)
ORDER BY u.created_at DESC, u.id DESC
LIMIT :limit
```

**Keyset cursor:** Encoded `(created_at, id)` pair.

---

#### `GET /admin/users/{id}`

User detail with aggregate stats, assessment list, chat sessions, and recent transactions.

**Response shape:**

```json
{
  "user": {
    "id": "uuid",
    "full_name": "John Doe",
    "email": "john@example.com",
    "school_id": "uuid",
    "school_name": "SMA Negeri 1 Jakarta",
    "grade": "12",
    "major": "IPA",
    "birthdate": "2008-03-15",
    "email_verified": true,
    "suspended": false,
    "provider": "email",
    "token_balance": 3,
    "created_at": "2026-05-10T08:00:00Z",
    "updated_at": "2026-05-14T10:30:00Z"
  },
  "stats": {
    "assessments_total": 5,
    "assessments_completed": 4,
    "tokens_purchased_lifetime": 10,
    "tokens_granted_lifetime": 2,
    "chat_sessions_count": 3,
    "last_active_at": "2026-05-14T10:30:00Z"
  },
  "assessments": [
    {
      "id": "uuid",
      "status": "completed",
      "submitted_at": "2026-05-14T10:30:00Z",
      "completed_at": "2026-05-14T10:31:45Z",
      "model_used": "gemini-2.5-flash"
    }
  ],
  "chat_sessions": [
    {
      "id": "uuid",
      "assessment_id": "uuid",
      "title": "Career guidance",
      "model_used": "google/gemini-2.5-flash",
      "message_count": 12,
      "last_message_at": "2026-05-14T11:00:00Z"
    }
  ],
  "recent_transactions": [
    {
      "id": "uuid",
      "amount": 1,
      "transaction_type": "purchase",
      "description": "Token package: 1 token",
      "balance_after": 3,
      "created_at": "2026-05-13T09:00:00Z"
    }
  ]
}
```

**Data sources:**

| Section | Source |
|---------|--------|
| User metadata | `users` JOIN `schools` |
| Stats: assessments | `COUNT(*) / COUNT(*) WHERE status='completed' FROM assessments` |
| Stats: tokens purchased | `SUM(amount) FROM token_transactions WHERE type='purchase'` |
| Stats: tokens granted | `SUM(amount) FROM token_transactions WHERE type='grant'` |
| Stats: chat sessions | `COUNT(*) FROM chat_sessions` |
| Stats: last active | `MAX(created_at)` across assessments + chat_messages |
| Assessments list | `assessments WHERE user_id = :id ORDER BY created_at DESC` |
| Chat sessions list | `chat_sessions WHERE user_id = :id ORDER BY updated_at DESC` |
| Recent transactions | `token_transactions WHERE user_id = :id ORDER BY created_at DESC LIMIT 5` |

**Notes:**
- Assessments and chat sessions are full lists (not paginated — a single user won't have thousands)
- Recent transactions limited to 5; "View all" links to full ledger endpoint
- Chat session click → navigates to `GET /admin/assessments/{assessment_id}/detail` with chat auto-expanded

---

#### `GET /admin/users/{id}/transactions`

Full token transaction ledger for a user. Keyset pagination.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `limit` | int | Page size (default 20, max 100) |
| `cursor` | string | Keyset cursor |
| `type` | string | Filter by transaction_type: `grant`, `purchase`, `assessment_debit`, `refund`, `admin_debit` |

**Response shape:**

```json
{
  "transactions": [
    {
      "id": "uuid",
      "amount": -1,
      "transaction_type": "assessment_debit",
      "description": "Assessment submission",
      "reference_id": "assessment-uuid",
      "balance_after": 2,
      "created_at": "2026-05-14T10:30:00Z"
    }
  ],
  "next_cursor": "..."
}
```

---

#### `PUT /admin/users/{id}`

Edit user profile fields. Any admin can edit name, school, grade, major, birthdate. Email edit requires superadmin.

**Request body:**

```json
{
  "full_name": "John Doe",
  "school_id": "uuid",
  "grade": "12",
  "major": "IPA",
  "birthdate": "2008-03-15",
  "email": "new@example.com"
}
```

**Rules:**
- Only provided fields are updated (partial update)
- `email` field rejected with 403 if caller role is not `superadmin`
- All edits logged to `admin_activity_log`
- Returns updated user object

---

#### `POST /admin/users/{id}/verify-email`

Force-verify a user's email. Any admin.

**Response:** `{"message": "Email verified"}`

**Side effects:**
- Sets `email_verified = true`
- Logged to `admin_activity_log`

---

#### `POST /admin/users/{id}/suspend`

Suspend a user. Any admin.

**Response:** `{"message": "User suspended"}`

**Side effects:**
- Sets `suspended = true`
- Revokes all refresh tokens for this user
- Logged to `admin_activity_log`

---

#### `POST /admin/users/{id}/unsuspend`

Unsuspend a user. Any admin.

**Response:** `{"message": "User unsuspended"}`

**Side effects:**
- Sets `suspended = false`
- Logged to `admin_activity_log`

---

#### `POST /admin/users/{id}/revoke-sessions`

Force-logout a user without suspending. Any admin.

**Response:** `{"message": "All sessions revoked"}`

**Side effects:**
- Revokes all refresh tokens for this user
- Logged to `admin_activity_log`
- User can log back in immediately

---

#### `POST /admin/users/{id}/reset-password`

Trigger forgot-password flow for the user. Any admin.

**Response:** `{"message": "Password reset email sent"}`

**Side effects:**
- Creates password reset token
- Sends reset email to user's current email address
- Logged to `admin_activity_log`

---

#### `POST /admin/users/{id}/grant-tokens`

Grant tokens to a user. Superadmin only.

**Request body:**

```json
{
  "amount": 5,
  "reason": "Compensation for system error during assessment"
}
```

**Rules:**
- `amount` must be > 0
- `reason` is mandatory (non-empty)
- Creates `token_transactions` record with `type='grant'`, `description=reason`
- Updates `users.token_balance`
- Logged to `admin_activity_log`

---

#### `POST /admin/users/{id}/deduct-tokens`

Deduct tokens from a user. Superadmin only.

**Request body:**

```json
{
  "amount": 2,
  "reason": "Policy violation: fraudulent assessment submission"
}
```

**Rules:**
- `amount` must be > 0
- `reason` is mandatory (non-empty)
- Fails with 400 if user's balance < amount (cannot go negative — DB constraint)
- Creates `token_transactions` record with `type='admin_debit'`, `description=reason`
- Updates `users.token_balance`
- Logged to `admin_activity_log`

---

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| List columns | Name, email, school, registered, verified, suspended, balance, last assessment | Quick identification + status at a glance |
| Editable fields | Name, school, grade, major, birthdate (admin); email (superadmin) | Email changes login identity — higher privilege |
| Suspension effect | Set flag + revoke all refresh tokens | Immediate lockout; auth-service enforces on login/refresh |
| Revoke sessions | Separate from suspend | Soft re-auth without blocking account |
| Password reset | Trigger existing forgot-password flow | Reuses infrastructure, admin never sees passwords |
| Token grant/deduct | Superadmin only, mandatory reason | Audit trail for financial operations |
| Transaction history | Last 5 inline + full paginated endpoint | Quick context without bloating detail page |
| Chat navigation | Click → assessment detail page, auto-expand chat | Single source of truth for assessment context |
| User assessments | Full list (not paginated) | Single user won't have thousands |

### Follow-up Required

- Auth-service must check `users.suspended` on login and refresh token rotation (reject if true)
- This is a cross-service change not covered by admin-service alone

---

## Monitoring Page

### Endpoints

#### `GET /admin/monitoring`

Single endpoint returning full infrastructure status. All checks run in parallel with 3s per-check timeout. Frontend auto-polls every 15-30 seconds.

**Response shape:**

```json
{
  "checked_at": "2026-05-15T08:30:00Z",
  "postgres": {
    "status": "healthy",
    "response_ms": 2,
    "pool": {
      "acquired": 5,
      "idle": 15,
      "max": 20
    },
    "active_connections": 12,
    "db_size_bytes": 524288000,
    "outbox": {
      "unpublished": 2,
      "stuck": 0
    }
  },
  "redis": {
    "status": "healthy",
    "response_ms": 1,
    "memory_used_bytes": 47185920,
    "memory_max_bytes": 268435456,
    "connected_clients": 8,
    "pubsub_channels": 2,
    "uptime_seconds": 864000
  },
  "queue": {
    "pending": 3,
    "active": 1,
    "dlq": 0,
    "stale_claims": 0
  },
  "services": [
    {
      "name": "auth-service",
      "url": "http://auth-service:8081/health",
      "status": "healthy",
      "response_ms": 5
    },
    {
      "name": "assessment-service",
      "url": "http://assessment-service:8080/health",
      "status": "healthy",
      "response_ms": 3
    },
    {
      "name": "notification-service",
      "url": "http://notification-service:8082/health",
      "status": "healthy",
      "response_ms": 2
    },
    {
      "name": "chat-service",
      "url": "http://chat-service:8083/health",
      "status": "healthy",
      "response_ms": 4
    },
    {
      "name": "payment-service",
      "url": "http://payment-service:8084/health",
      "status": "healthy",
      "response_ms": 3
    }
  ],
  "tunnel": [
    {
      "hostname": "auth.futureguide.id",
      "status": "healthy",
      "response_ms": 120
    },
    {
      "hostname": "pay.futureguide.id",
      "status": "healthy",
      "response_ms": 135
    },
    {
      "hostname": "api-admin.futureguide.id",
      "status": "healthy",
      "response_ms": 110
    },
    {
      "hostname": "notify.futureguide.id",
      "status": "healthy",
      "response_ms": 125
    },
    {
      "hostname": "chat.futureguide.id",
      "status": "healthy",
      "response_ms": 130
    }
  ],
  "workers": [
    {
      "worker_id": "worker-abc123",
      "heartbeat_age_seconds": 3
    },
    {
      "worker_id": "worker-def456",
      "heartbeat_age_seconds": 12
    }
  ],
  "maintenance_mode": false
}
```

**Status values:** `"healthy"`, `"unhealthy"`, `"timeout"` (check exceeded 3s)

**Data sources:**

| Section | How |
|---------|-----|
| PostgreSQL status | `pool.Ping(ctx)` |
| Pool stats | `pool.Stat()` (pgx pool statistics) |
| Active connections | `SELECT count(*) FROM pg_stat_activity WHERE state = 'active'` |
| DB size | `SELECT pg_database_size(current_database())` |
| Outbox unpublished | `SELECT count(*) FROM analysis_job_outbox WHERE published_at IS NULL` |
| Outbox stuck | `SELECT count(*) FROM analysis_job_outbox WHERE published_at IS NULL AND created_at < NOW() - INTERVAL '5 minutes'` |
| Redis status | `rdb.Ping(ctx)` |
| Redis metrics | `rdb.Info(ctx, "memory", "clients", "stats", "server")` parsed |
| Queue pending | `rdb.LLen(ctx, "queue:analysis_jobs")` |
| Queue active | `rdb.LLen(ctx, "queue:analysis_jobs:active")` |
| Queue DLQ | `rdb.LLen(ctx, "queue:analysis_jobs:dlq")` |
| Stale claims | `rdb.HLen(ctx, "queue:analysis_jobs:claims")` minus active worker count |
| Services | HTTP GET to each URL in `ADMIN_SERVICE_HEALTH_URLS`, measure response time |
| Tunnel | HTTP GET to `https://{hostname}/health` for each tunnel hostname, 3s timeout |
| Workers | `rdb.Keys(ctx, "worker:analysis:heartbeat:*")` + `rdb.TTL` for each |
| Maintenance mode | `runtimeconfig.Store.Get("maintenance_mode", "false")` |

**Implementation notes:**
- All checks run concurrently via `errgroup` with individual 3s context timeouts
- Tunnel checks go to the public internet — may be slower than internal checks
- If a check times out, its status is `"timeout"` and metrics are omitted
- If a check fails (connection refused, error), status is `"unhealthy"`
- Workers list uses `SCAN` (not `KEYS`) in production for safety, but with few heartbeat keys `KEYS` is acceptable

---

#### `POST /admin/monitoring/maintenance`

Toggle maintenance mode. Superadmin only.

**Request body:**

```json
{
  "enabled": true
}
```

**Response:** `{"message": "Maintenance mode enabled", "maintenance_mode": true}`

**Side effects:**
- Updates `system_config` key `maintenance_mode` via `runtimeconfig.Store.Set()`
- Publishes Redis invalidation so all services pick up the change
- Logged to `admin_activity_log`
- Logged to `system_config_audit`

---

### Configuration

**Environment variables used:**

| Variable | Purpose |
|----------|---------|
| `ADMIN_SERVICE_HEALTH_URLS` | Comma-separated `name=url` pairs for service health checks |
| `TUNNEL_HOSTNAMES` | Comma-separated public hostnames to check (default: `auth.futureguide.id,pay.futureguide.id,api-admin.futureguide.id,notify.futureguide.id,chat.futureguide.id`) |

---

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Detail level | Status + key metrics (no charts) | Actionable numbers; charts live in Grafana |
| Polling | Auto-poll 15-30s | Simple, no held connections, fresh enough |
| Tunnel check | HTTP GET on public hostnames | Only way to confirm end-to-end tunnel health |
| Service check | HTTP GET + response time | Latency reveals degradation beyond up/down |
| Workers | List individual IDs + heartbeat age | Debug which worker is stuck |
| Redis metrics | Memory, clients, pub/sub, uptime | Key capacity/leak indicators |
| PG metrics | Pool stats, connections, DB size, outbox | Connection pressure + job pipeline health |
| DLQ | Count only, click navigates to queue management page | Monitoring page is status, not action center |
| API shape | Single endpoint, parallel checks, per-check timeout | One poll call, no partial failures blocking response |
| Maintenance mode | Toggle on monitoring page, superadmin | Emergency lever belongs near infrastructure status |

---

## Runtime Config Page

### Endpoints

#### `GET /admin/config`

List all runtime config entries grouped by category. Any admin can read.

**Response shape:**

```json
{
  "categories": [
    {
      "name": "analysis",
      "entries": [
        {
          "key": "analysis.gemini_model",
          "value": "gemini-2.5-flash",
          "description": "Gemini model for analysis generation",
          "value_type": "string",
          "updated_at": "2026-05-10T08:00:00Z",
          "updated_by": "superadmin@futureguide.id"
        }
      ]
    },
    {
      "name": "chat",
      "entries": [...]
    },
    {
      "name": "assessment",
      "entries": [...]
    },
    {
      "name": "payment",
      "entries": [...]
    },
    {
      "name": "general",
      "entries": [...]
    }
  ]
}
```

**Data source:** `runtimeconfig.Store.All()` grouped by `Entry.Category`

---

#### `GET /admin/config/{key}/audit`

Get change history for a specific config key. Any admin can read.

**Query params:** `?limit=5` (default 5, max 50)

**Response shape:**

```json
{
  "key": "analysis.gemini_model",
  "audit": [
    {
      "id": 12,
      "old_value": "gemini-2.0-flash",
      "new_value": "gemini-2.5-flash",
      "changed_by": "superadmin@futureguide.id",
      "changed_at": "2026-05-10T08:00:00Z",
      "reason": "Upgraded to 2.5 for better structured output"
    }
  ]
}
```

**Data source:** `runtimeconfig.AuditLog(ctx, key, limit)`

---

#### `PUT /admin/config/{key}`

Update a config value. Superadmin only.

**Request body:**

```json
{
  "value": "gemini-2.5-pro",
  "reason": "Testing pro model for higher quality analysis"
}
```

**Rules:**
- `value` is required, non-empty
- `reason` is required, non-empty
- Value is validated against the key's `value_type` via `runtimeconfig.ValidateValueType()`
- Returns 400 if type validation fails (e.g., "abc" for an int key)
- Returns 404 if key doesn't exist
- Publishes Redis invalidation after successful update
- Logged to `admin_activity_log`
- Audit record created in `system_config_audit`

**Response:** 

```json
{
  "message": "Config updated",
  "key": "analysis.gemini_model",
  "value": "gemini-2.5-pro",
  "previous_value": "gemini-2.5-flash"
}
```

**Special behavior for restart-triggering keys:**

When these keys are changed, the response includes a restart warning:

- `analysis.worker_count`

```json
{
  "message": "Config updated",
  "key": "analysis.worker_count",
  "value": "4",
  "previous_value": "2",
  "restart_triggered": true,
  "restart_warning": "Analysis worker will restart to apply this change. In-flight jobs will be reclaimed."
}
```

The worker reads this value at startup; restart it to apply changes.

---

### UI Behavior

- **Layout:** One card per category (Analysis, Chat, Assessment, Payment, General)
- **Controls by type:**
  - `string` → text input
  - `int` → number input with step=1
  - `float` → number input with step=0.01
  - `bool` → toggle switch
  - `duration` → number input (seconds) with human-readable preview ("5 minutes")
- **Edit flow:** Click edit icon → fields become editable → type reason → Save button per card
- **Audit expand:** Click clock icon next to any key → shows last 5 changes inline
- **Restart warning:** For `analysis.worker_count`, show confirmation modal before saving: "This change will restart the analysis worker. In-flight jobs will be reclaimed after 90 seconds."

---

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Page separation | Config and Prompts are separate pages | Different editing UX: key-value vs long-form text |
| Layout | Card per category | Visual grouping, save per card, 18 keys fits without search |
| Read access | Any admin | Context visibility for all admins |
| Write access | Superadmin only | Config changes have production-wide impact |
| Reason field | Always mandatory | Audit trail value outweighs 5s friction |
| Audit display | Expandable per-key, last 5 | Context right where you need it |
| Worker restart | SIGTERM via SubscribeKeyChange | Existing pattern, no new infrastructure |
| Type validation | Server-side before save | Prevents invalid values reaching production |

---

## Prompt Templates Page

### Endpoints

#### `GET /admin/prompts`

List all prompt templates. Any admin can read.

**Response shape:**

```json
{
  "templates": [
    {
      "id": "uuid",
      "template_key": "analysis.role",
      "name": "Analysis Role Prompt",
      "description": "Defines the AI persona for analysis generation",
      "version": 3,
      "is_active": true,
      "cache_type": "cached",
      "variables": ["scores", "references"],
      "updated_by": "uuid",
      "updated_at": "2026-05-10T08:00:00Z"
    }
  ]
}
```

**`cache_type` values:**
- `"cached"` — part of Gemini static cache (affects: `analysis.static_cache`, `analysis.role`, `analysis.context`, `analysis.score_interpretation`, `analysis.cross_reference_guide`, `analysis.output_format`)
- `"per_request"` — injected per-request only (affects: `analysis.instructions.step0` through `step6`, `analysis.constraints`, `analysis.instructions.step0_no_refs`)

**Data source:** `SELECT id, template_key, name, description, version, is_active, variables, updated_by, updated_at FROM prompt_templates ORDER BY template_key`

---

#### `GET /admin/prompts/{id}`

Get full template detail with content. Any admin can read.

**Response shape:**

```json
{
  "id": "uuid",
  "template_key": "analysis.role",
  "name": "Analysis Role Prompt",
  "description": "Defines the AI persona for analysis generation",
  "content": "You are a professional psychologist...",
  "variables": ["scores", "references"],
  "version": 3,
  "is_active": true,
  "cache_type": "cached",
  "updated_by": "uuid",
  "updated_at": "2026-05-10T08:00:00Z"
}
```

---

#### `GET /admin/prompts/{id}/versions`

Get version history for a template. Any admin can read.

**Query params:** `?limit=10` (default 10, max 50)

**Response shape:**

```json
{
  "template_key": "analysis.role",
  "current_version": 3,
  "versions": [
    {
      "id": "uuid",
      "version": 3,
      "content": "You are a professional psychologist...",
      "variables": ["scores", "references"],
      "changed_by": "uuid",
      "change_reason": "Added emphasis on Indonesian cultural context",
      "created_at": "2026-05-10T08:00:00Z"
    },
    {
      "id": "uuid",
      "version": 2,
      "content": "You are an expert psychologist...",
      "variables": ["scores", "references"],
      "changed_by": "uuid",
      "change_reason": "Refined persona for better output structure",
      "created_at": "2026-05-05T12:00:00Z"
    }
  ]
}
```

**Data source:** `SELECT * FROM prompt_template_versions WHERE template_id = $1 ORDER BY version DESC LIMIT $2`

---

#### `PUT /admin/prompts/{id}`

Update a prompt template. Superadmin only. Auto-creates a version record.

**Request body:**

```json
{
  "content": "You are a professional psychologist specializing in...",
  "variables": ["scores", "references"],
  "change_reason": "Added emphasis on Indonesian cultural context"
}
```

**Rules:**
- `content` is required, non-empty
- `change_reason` is required, non-empty
- Soft validation: if any declared variable (e.g., `{{scores}}`) is not found in content, response includes a warning (but save still succeeds)
- Increments `version` in `prompt_templates`
- Creates new row in `prompt_template_versions` with old content
- Publishes Redis invalidation on channel `prompt_templates:invalidate`
- Logged to `admin_activity_log`

**Response:**

```json
{
  "message": "Template updated",
  "template_key": "analysis.role",
  "version": 4,
  "cache_type": "cached",
  "cache_warning": "This template is cached by Gemini. After prompt invalidation, Athena replaces the cache before the next analysis.",
  "variable_warnings": ["Variable {{references}} not found in content"]
}
```

- `cache_warning` only present if `cache_type == "cached"`
- `variable_warnings` only present if declared variables are missing from content

---

#### `POST /admin/prompts/{id}/revert`

Revert a template to a previous version. Superadmin only. Creates a new version (does not overwrite history).

**Request body:**

```json
{
  "target_version": 2,
  "reason": "Quality regression in v3 — reverting to stable v2"
}
```

**Rules:**
- `target_version` must exist in `prompt_template_versions` for this template
- `reason` is required, non-empty
- Creates a new version (e.g., v4) with the content from target_version (v2)
- The version history shows: v1 → v2 → v3 → v4(reverted from v2)
- Same invalidation + logging as PUT

**Response:**

```json
{
  "message": "Template reverted",
  "template_key": "analysis.role",
  "version": 4,
  "reverted_from_version": 2,
  "cache_warning": "This template is cached by Gemini. After prompt invalidation, Athena replaces the cache before the next analysis."
}
```

---

#### `POST /admin/prompts/{id}/toggle`

Activate or deactivate a template. Superadmin only.

**Request body:**

```json
{
  "is_active": false
}
```

**Rules:**
- When deactivated, the analysis-worker falls back to hardcoded prompt text
- Logged to `admin_activity_log`
- Publishes invalidation

**Response:** `{"message": "Template deactivated", "template_key": "analysis.role", "is_active": false}`

---

#### `POST /admin/worker/restart`

Force-restart the analysis worker. Superadmin only. Lives on the prompts page as an action button.

**Response:** `{"message": "Worker restart signal sent"}`

**Implementation:**
- Publishes a special message on Redis channel `worker:control:restart`
- Worker subscribes to this channel and sends SIGTERM to self on receipt
- Logged to `admin_activity_log`

---

### UI Behavior

- **List view:** Table with columns: Name, Key, Version, Cache Type (badge: blue "cached" / green "per-request"), Active (toggle), Last Updated
- **Detail editor:** Full-screen with:
  - Template metadata (name, key, description) — read-only
  - Variables list — shown as chips/badges above the editor
  - Content — large textarea/code editor (monospace, line numbers)
  - Change reason — text input below editor
  - Save button + Cancel
- **Version history:** Sidebar or expandable panel showing version list with diff view (highlight changes between versions)
- **Revert:** Click "Revert" on any version → confirmation modal with reason field
- **Cache badge:** Blue "Cached" or green "Per-request" badge on each template in list and detail view
- **Restart button:** Prominent button at top of page: "Restart Worker" with confirmation modal. Shows last restart time if available.
- **Post-save behavior:** If template is cached type, show yellow banner: "Athena will refresh the Gemini cache before the next analysis after prompt invalidation."

---

### Template Classification

| Template Key | Cache Type | Variables |
|-------------|-----------|-----------|
| `analysis.static_cache` | cached | (none — standalone) |
| `analysis.role` | cached | (none) |
| `analysis.context` | cached | (none) |
| `analysis.score_interpretation` | cached | (none) |
| `analysis.cross_reference_guide` | cached | (none) |
| `analysis.output_format` | cached | (none) |
| `analysis.instructions.step0` | per_request | references |
| `analysis.instructions.step0_no_refs` | per_request | (none) |
| `analysis.instructions.step1` | per_request | (none) |
| `analysis.instructions.step2` | per_request | (none) |
| `analysis.instructions.step3` | per_request | (none) |
| `analysis.instructions.step4` | per_request | (none) |
| `analysis.instructions.step5` | per_request | (none) |
| `analysis.instructions.step6` | per_request | (none) |
| `analysis.constraints` | per_request | (none) |

---

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Page separation | Separate from runtime config | Long-form text editing needs different UX than key-value |
| Editor style | List + full-screen detail editor | Prompts are long; inline editing is cramped |
| Versioning | Auto-version on every save | Full audit trail; enables rollback |
| Change reason | Always mandatory | Prompts directly control AI output quality — traceability critical |
| Cache warning | Show after saving cached templates | Admin knows Athena refreshes the cache on the next analysis |
| Restart button | On prompts page, superadmin only | Emergency action for immediate cache refresh |
| Variable validation | Soft warning, not hard block | Admin might intentionally remove a section |
| Rollback | Creates new version with old content + reason | Preserves full timeline, auditable |
| Cache type badge | Per-template visual indicator | Admin knows impact before editing |
| Toggle active | Deactivate falls back to hardcoded | Safe escape hatch if a template breaks output |

---

## A/B Prompt Testing

Feature extension of the Prompt Templates page. Allows admins to compare two versions of the same prompt template against a real completed assessment to evaluate quality differences.

### Architecture

```text
Admin creates A/B test → admin-service inserts ab_prompt_tests row (status: pending)
                        → LPUSH to queue:ab_tests
                        
analysis-worker subscribes to queue:ab_tests
  → loads assessment scores from DB
  → loads original RAG refs from assessment_references
  → runs Gemini with prompt A content (sequential)
  → runs Gemini with prompt B content (sequential)
  → stores result_a, result_b, usage_a, usage_b
  → updates status to completed
  
Admin polls GET /admin/ab-tests/{id} every 5s until completed
  → side-by-side comparison view
  → picks winner + writes notes
```

### Endpoints

#### `GET /admin/ab-tests`

List all A/B tests. Any admin can read.

**Query params:** `?status=pending|running|completed|failed&limit=20&cursor=...`

**Response shape:**

```json
{
  "tests": [
    {
      "id": "uuid",
      "assessment_id": "uuid",
      "admin_id": "uuid",
      "admin_email": "superadmin@futureguide.id",
      "status": "completed",
      "prompt_key": "analysis.role",
      "version_a": 2,
      "version_b": 3,
      "winner": "b",
      "started_at": "2026-05-15T08:00:00Z",
      "completed_at": "2026-05-15T08:01:02Z",
      "created_at": "2026-05-15T07:59:55Z"
    }
  ],
  "next_cursor": "..."
}
```

**Data source:** `SELECT ... FROM ab_prompt_tests ORDER BY created_at DESC` with keyset pagination

---

#### `POST /admin/ab-tests`

Create a new A/B test. Superadmin only.

**Request body:**

```json
{
  "assessment_id": "uuid",
  "template_key": "analysis.role",
  "version_a": 2,
  "version_b": 3
}
```

**Rules:**
- `assessment_id` must reference a completed assessment
- `template_key` must exist in `prompt_templates`
- `version_a` and `version_b` must exist in `prompt_template_versions` for that key
- `version_a != version_b`
- Max 3 tests with status `pending` or `running` at any time (returns 429 if exceeded)
- Snapshots prompt content from `prompt_template_versions` into `prompt_a_content` and `prompt_b_content` at creation time (immutable record of what was tested)
- Inserts row with status `pending`, then LPUSH to `queue:ab_tests`
- Logged to `admin_activity_log`

**Response:**

```json
{
  "id": "uuid",
  "status": "pending",
  "message": "A/B test created. Results will be available in ~60 seconds."
}
```

---

#### `GET /admin/ab-tests/{id}`

Get full A/B test detail including results. Any admin can read.

**Response shape:**

```json
{
  "id": "uuid",
  "assessment_id": "uuid",
  "admin_id": "uuid",
  "admin_email": "superadmin@futureguide.id",
  "status": "completed",
  "prompt_key": "analysis.role",
  "version_a": 2,
  "version_b": 3,
  "prompt_a_content": "You are an expert psychologist...",
  "prompt_b_content": "You are a professional psychologist specializing in...",
  "result_a": { /* full GeminiAnalysisResult JSON */ },
  "result_b": { /* full GeminiAnalysisResult JSON */ },
  "usage_a": {
    "prompt_tokens": 4500,
    "completion_tokens": 2100,
    "total_tokens": 6600,
    "latency_ms": 28000,
    "estimated_cost_usd": 0.0045
  },
  "usage_b": {
    "prompt_tokens": 4800,
    "completion_tokens": 2300,
    "total_tokens": 7100,
    "latency_ms": 31000,
    "estimated_cost_usd": 0.0052
  },
  "winner": "b",
  "notes": "Version 3 produces more culturally relevant career suggestions",
  "started_at": "2026-05-15T08:00:00Z",
  "completed_at": "2026-05-15T08:01:02Z",
  "created_at": "2026-05-15T07:59:55Z"
}
```

- `result_a` and `result_b` are null while status is `pending` or `running`
- `usage_a` and `usage_b` are null while status is `pending` or `running`

---

#### `PUT /admin/ab-tests/{id}/verdict`

Record the admin's judgment. Superadmin only.

**Request body:**

```json
{
  "winner": "b",
  "notes": "Version 3 produces more culturally relevant career suggestions"
}
```

**Rules:**
- Test must have status `completed`
- `winner` must be `"a"`, `"b"`, or `"tie"`
- `notes` is optional but recommended
- Logged to `admin_activity_log`

**Response:** `{"message": "Verdict recorded", "winner": "b"}`

---

### Worker-Side Implementation

The analysis-worker needs a new consumer for `queue:ab_tests`:

1. **BLMOVE** from `queue:ab_tests` → `queue:ab_tests:active`
2. **Load assessment data:**
   - Scores from `assessment_domain_scores` (RIASEC, OCEAN, VIA-IS)
   - RAG refs from `assessment_references` joined with `reference_documents`
3. **Update status** to `running`, set `started_at`
4. **Build prompt A:** Use `prompt_a_content` as override for the specified `template_key`, all other keys use current live templates
5. **Call Gemini** with prompt A → store result + usage
6. **Build prompt B:** Use `prompt_b_content` as override for the same key
7. **Call Gemini** with prompt B → store result + usage
8. **Update status** to `completed`, set `completed_at`, store `result_a`, `result_b`, `usage_a`, `usage_b`
9. **Ack** — remove from active list

**Error handling:**
- If either Gemini call fails after retries → status = `failed`, store error in notes
- If prompt A succeeds but prompt B fails → still mark as `failed` (partial results not useful for comparison)
- Failed tests can be retried by creating a new test with the same parameters

**Prompt override mechanism:**
- `BuildPromptWithReferences` currently reads from `PromptStore.Get(key, fallback)`
- For A/B tests, create a `PromptStoreOverride` wrapper that returns the override content for the target key and delegates to the real store for all other keys
- This keeps the existing prompt building logic unchanged

---

### Redis Queue Keys

| Key | Purpose |
|-----|---------|
| `queue:ab_tests` | Pending A/B test jobs |
| `queue:ab_tests:active` | Currently processing |

No DLQ for A/B tests — failed tests are simply marked as `failed` in the DB. Admin can create a new test if needed.

---

### UI Behavior

- **Access:** Tab or section within the Prompt Templates page (not a separate page)
- **Create flow:** Admin selects a template → clicks "A/B Test" → picks two versions from dropdowns → selects a completed assessment (searchable by user name/email) → confirms
- **List view:** Table showing recent tests with status badge (pending=yellow, running=blue, completed=green, failed=red), prompt key, versions, winner, date
- **Detail/comparison view:**
  - Top: metadata (assessment info, prompt key, versions, timing, cost comparison)
  - Middle: two-column layout showing prompt A content vs prompt B content (diff highlighted)
  - Bottom: two-column layout showing result A vs result B (same GeminiAnalysisResult structure, section by section)
  - Footer: verdict controls (A wins / B wins / Tie + notes textarea + Save)
- **Polling:** While status is `pending` or `running`, auto-poll every 5 seconds with a spinner/progress indicator

---

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Execution location | analysis-worker via Redis queue | Reuses Gemini client, prompt building, retry logic |
| Comparison scope | Two versions of same template key | Single variable isolation for valid comparison |
| Version selection | Pick any two from history | Full flexibility for testing |
| Execution order | Sequential (A then B) | Avoids doubling Gemini rate limit pressure |
| Concurrency limit | Max 3 pending/running tests | Prevents API quota exhaustion |
| Assessment eligibility | Completed only | Ensures clean, complete input data |
| RAG references | Re-use original from assessment_references | True apples-to-apples comparison |
| Result notification | Frontend polls every 5s | Consistent with monitoring page pattern |
| Result persistence | Permanent | Lightweight, historically valuable |
| Winner judgment | Side-by-side, admin picks A/B/Tie + notes | Simple, efficient, auditable |
| Prompt override | PromptStoreOverride wrapper | Minimal change to existing prompt building |
| Failed tests | Mark as failed, admin creates new test | Simple error recovery, no retry queue needed |

---

## Ledger Page

Financial overview showing money in vs money out, with P&L calculation. Answers "are we profitable?"

### Data Sources

**Revenue (Money IN) — IDR:**
- Token purchases: `payment_orders WHERE status = 'completed'`, sum of `amount_idr` (excludes `fee_idr` which goes to Pakasir)

**AI Costs (Money OUT) — USD, converted to IDR for P&L:**
- Analysis AI: `ai_usage_logs WHERE operation IN ('analysis', 'analysis_retry')`, sum of `estimated_cost_usd`, grouped by model
- Chat AI: `ai_usage_logs WHERE provider = 'openrouter'`, sum of `estimated_cost_usd`, grouped by model
- Embeddings: `ai_usage_logs WHERE operation = 'embedding'`, sum of `estimated_cost_usd`, grouped by model
- A/B Tests: `ai_usage_logs WHERE operation = 'ab_test'`, sum of `estimated_cost_usd`

**Infrastructure Costs (Money OUT) — IDR, manual config:**
- `ledger.infra_cost_db_idr` — Database hosting (default: 0)
- `ledger.infra_cost_redis_idr` — Redis hosting (default: 0)
- `ledger.infra_cost_server_idr` — Server/compute (default: 0)
- `ledger.infra_cost_domain_idr` — Domain/DNS (default: 0)
- `ledger.infra_cost_other_idr` — Other infrastructure (default: 0)

**Opportunity Cost (informational, not in P&L):**
- Token grants: `token_transactions WHERE transaction_type = 'grant'`, sum of `amount` × token unit price

**Exchange Rate:**
- Stored in `system_config` key `ledger.usd_to_idr_rate`
- Auto-fetched from ExchangeRate-API (`https://open.er-api.com/v6/latest/USD`) when value is older than 24 hours
- Superadmin can manually override
- Fallback: last stored value if API is unreachable

### New system_config Keys (migration required)

| Key | Default | Category | Type | Description |
|-----|---------|----------|------|-------------|
| `ledger.usd_to_idr_rate` | `16500` | ledger | float | USD to IDR exchange rate (auto-updated daily) |
| `ledger.usd_to_idr_updated_at` | `""` | ledger | string | ISO timestamp of last rate fetch |
| `ledger.infra_cost_db_idr` | `0` | ledger | int | Monthly database hosting cost (IDR) |
| `ledger.infra_cost_redis_idr` | `0` | ledger | int | Monthly Redis hosting cost (IDR) |
| `ledger.infra_cost_server_idr` | `0` | ledger | int | Monthly server/compute cost (IDR) |
| `ledger.infra_cost_domain_idr` | `0` | ledger | int | Monthly domain/DNS cost (IDR) |
| `ledger.infra_cost_other_idr` | `0` | ledger | int | Monthly other infrastructure cost (IDR) |
| `ledger.token_unit_price_idr` | `15000` | ledger | int | Price per token for opportunity cost calculation (IDR) |

### Endpoints

#### `GET /admin/ledger`

Full P&L summary. Any admin can read.

**Query params:** `?month=2026-05` (default: current month)

**Response shape:**

```json
{
  "period": "2026-05",
  "exchange_rate": {
    "usd_to_idr": 16500.0,
    "updated_at": "2026-05-15T06:00:00Z",
    "source": "auto"
  },
  "lifetime": {
    "revenue_idr": 45000000,
    "ai_costs_usd": 12.45,
    "ai_costs_idr": 205425,
    "infra_costs_idr": 3000000,
    "net_profit_idr": 41794575
  },
  "monthly": {
    "revenue": {
      "total_idr": 5000000,
      "order_count": 42,
      "breakdown": [
        { "package_id": "basic_1", "label": "1 Token", "count": 10, "total_idr": 150000 },
        { "package_id": "pack_3", "label": "3 Tokens", "count": 8, "total_idr": 360000 },
        { "package_id": "pack_5", "label": "5 Tokens", "count": 12, "total_idr": 840000 },
        { "package_id": "pack_10", "label": "10 Tokens", "count": 12, "total_idr": 3650000 }
      ]
    },
    "ai_costs": {
      "total_usd": 2.85,
      "total_idr": 47025,
      "breakdown": [
        { "category": "analysis", "model": "gemini-2.5-flash", "cost_usd": 1.80, "cost_idr": 29700, "call_count": 45 },
        { "category": "chat", "model": "google/gemini-2.5-flash", "cost_usd": 0.90, "cost_idr": 14850, "call_count": 320 },
        { "category": "embedding", "model": "gemini-embedding-001", "cost_usd": 0.10, "cost_idr": 1650, "call_count": 45 },
        { "category": "ab_test", "model": "gemini-2.5-flash", "cost_usd": 0.05, "cost_idr": 825, "call_count": 2 }
      ]
    },
    "infra_costs": {
      "total_idr": 500000,
      "breakdown": [
        { "item": "database", "cost_idr": 200000 },
        { "item": "redis", "cost_idr": 100000 },
        { "item": "server", "cost_idr": 150000 },
        { "item": "domain", "cost_idr": 50000 },
        { "item": "other", "cost_idr": 0 }
      ]
    },
    "opportunity_cost": {
      "tokens_granted": 50,
      "equivalent_idr": 750000
    },
    "summary": {
      "revenue_idr": 5000000,
      "total_costs_idr": 547025,
      "net_profit_idr": 4452975,
      "profit_margin_percent": 89.06
    }
  }
}
```

**SQL sources:**

| Metric | Query |
|--------|-------|
| Monthly revenue | `SELECT package_id, count(*), sum(amount_idr) FROM payment_orders WHERE status='completed' AND completed_at >= $1 AND completed_at < $2 GROUP BY package_id` |
| Lifetime revenue | `SELECT sum(amount_idr) FROM payment_orders WHERE status='completed'` |
| Monthly AI costs | `SELECT CASE WHEN provider='openrouter' THEN 'chat' WHEN operation='embedding' THEN 'embedding' WHEN operation='ab_test' THEN 'ab_test' ELSE 'analysis' END as category, model, count(*), sum(estimated_cost_usd) FROM ai_usage_logs WHERE created_at >= $1 AND created_at < $2 AND success=true GROUP BY category, model` |
| Lifetime AI costs | `SELECT sum(estimated_cost_usd) FROM ai_usage_logs WHERE success=true` |
| Monthly grants | `SELECT sum(amount) FROM token_transactions WHERE transaction_type='grant' AND created_at >= $1 AND created_at < $2` |
| Infra costs | From `system_config` keys (monthly values, prorated if needed) |
| Exchange rate | From `system_config` key `ledger.usd_to_idr_rate` |

**Exchange rate auto-refresh logic:**
1. Read `ledger.usd_to_idr_rate` and `ledger.usd_to_idr_updated_at` from config
2. If `updated_at` is empty or older than 24 hours:
   - Fetch `https://open.er-api.com/v6/latest/USD`, extract `rates.IDR`
   - Update both config keys via `runtimeconfig.Store.Set()`
   - Use fresh rate for response
3. If fetch fails: use last stored rate, log warning
4. If no stored rate exists and fetch fails: use hardcoded fallback 16500

---

#### `GET /admin/ledger/months`

List available months with data. Any admin can read. Used for the month selector.

**Response shape:**

```json
{
  "months": [
    { "month": "2026-05", "has_revenue": true, "has_costs": true },
    { "month": "2026-04", "has_revenue": true, "has_costs": true },
    { "month": "2026-03", "has_revenue": false, "has_costs": true }
  ]
}
```

**Data source:** `SELECT DISTINCT to_char(completed_at, 'YYYY-MM') FROM payment_orders WHERE status='completed' UNION SELECT DISTINCT to_char(created_at, 'YYYY-MM') FROM ai_usage_logs ORDER BY 1 DESC`

---

### UI Behavior

- **Layout:** Top section = lifetime P&L summary card (revenue, costs, net profit). Below = monthly detail with month selector dropdown.
- **Monthly detail:** Three cards side by side:
  - Revenue card (total + package breakdown)
  - AI Costs card (total + category/model breakdown)
  - Infrastructure card (total + itemized breakdown)
- **P&L summary bar:** Below the three cards — "Revenue - AI Costs - Infrastructure = Net Profit (margin %)"
- **Opportunity cost:** Shown as a separate info line below P&L: "Token grants this month: 50 tokens (≈ Rp 750,000 opportunity cost)" — visually distinct, not part of P&L math
- **Exchange rate indicator:** Small badge showing current rate + last updated time. Click to force refresh.
- **Navigation links:** Revenue total links to payment orders page (filtered to month). AI costs link to AI usage page (when built). Infrastructure links to config page (ledger category).
- **Month selector:** Dropdown populated from `/admin/ledger/months`

---

### Configuration

**New environment variables:** None — all config is in `system_config`.

**ExchangeRate-API integration:**
- Endpoint: `https://open.er-api.com/v6/latest/USD`
- No API key required (free tier, 1500 req/month)
- Response: `{ "rates": { "IDR": 16500.0, ... } }`
- HTTP timeout: 5 seconds
- Called at most once per 24 hours per admin-service instance

---

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Currency display | Native currencies + converted P&L summary | Accurate line items, useful summary |
| Exchange rate | Auto-fetch daily from ExchangeRate-API, store in system_config, manual override | Reliable, no background job, fallback available |
| Infrastructure costs | Itemized manual entries in system_config | Ready for cloud migration, granular visibility |
| Time range | Monthly detail + lifetime totals | Answers both "this month" and "all time" questions |
| AI cost granularity | By category + model | Shows what and which model costs, without token-level noise |
| Transaction detail | Aggregates with navigation links | Ledger is summary; detail lives on dedicated pages |
| P&L calculation | Revenue - AI costs (converted) - Infra = Net Profit | Clear, actionable headline number |
| Token grants | Opportunity cost (informational, not in P&L) | Visible but doesn't distort cash P&L |
| Export | None for now | ~10 numbers per month, screenshot suffices at this scale |
| Rate fallback | Last stored value → hardcoded 16500 | Always renders, never blocks on API failure |

---

## Admin User Management Page

Simple CRUD for admin accounts. Superadmin manages all admins; any admin can edit their own identity.

### Endpoints

#### `GET /admin/admins`

List all admin users. Any admin can read.

**Response shape:**

```json
{
  "admins": [
    {
      "id": "uuid",
      "email": "superadmin@futureguide.id",
      "full_name": "Super Admin",
      "role": "superadmin",
      "must_change_password": false,
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-05-10T08:00:00Z"
    }
  ]
}
```

**Data source:** `SELECT id, email, full_name, role, must_change_password, created_at, updated_at FROM admin_users ORDER BY created_at ASC`

---

#### `POST /admin/admins`

Create a new admin user. Superadmin only.

**Request body:**

```json
{
  "email": "newadmin@futureguide.id",
  "full_name": "New Admin",
  "password": "SecureP@ss123",
  "role": "admin"
}
```

**Rules:**
- `email` must be unique, valid email format
- `full_name` required, non-empty
- `password` must meet password policy (min 8 chars, max 72, upper+lower+digit+special)
- `role` must be `"admin"` or `"superadmin"`
- Password is bcrypt hashed (cost 12) before storage
- `must_change_password` is set to `true` automatically
- Logged to `admin_activity_log`

**Response:**

```json
{
  "message": "Admin created",
  "id": "uuid",
  "email": "newadmin@futureguide.id",
  "role": "admin",
  "must_change_password": true
}
```

---

#### `PUT /admin/admins/{id}`

Update an admin user. Superadmin only (except self-edit — see below).

**Request body (superadmin editing another admin):**

```json
{
  "email": "updated@futureguide.id",
  "full_name": "Updated Name",
  "role": "superadmin"
}
```

**Rules:**
- All fields optional — only provided fields are updated
- `email` must be unique if changed
- `role` change: cannot demote the last superadmin (query `SELECT count(*) FROM admin_users WHERE role='superadmin'`)
- Logged to `admin_activity_log`

**Response:** `{"message": "Admin updated"}`

---

#### `PUT /admin/admins/me`

Self-edit for any admin. Updates own name and/or password.

**Request body:**

```json
{
  "full_name": "My New Name",
  "current_password": "OldP@ss123",
  "new_password": "NewP@ss456"
}
```

**Rules:**
- `full_name` is optional — updates name if provided
- Password change requires `current_password` (verified via bcrypt) + `new_password` (must meet policy)
- Cannot change own email or role via this endpoint
- If `must_change_password` is true and password is changed, sets it to `false`
- Logged to `admin_activity_log`

**Response:** `{"message": "Profile updated"}`

---

#### `DELETE /admin/admins/{id}`

Delete an admin user. Superadmin only.

**Rules:**
- Cannot delete yourself
- Cannot delete the last superadmin
- Logged to `admin_activity_log`

**Response:** `{"message": "Admin deleted"}`

---

#### `POST /admin/admins/{id}/reset-password`

Reset another admin's password. Superadmin only.

**Request body:**

```json
{
  "new_password": "TempP@ss789"
}
```

**Rules:**
- `new_password` must meet password policy
- Sets `must_change_password = true`
- Logged to `admin_activity_log`

**Response:** `{"message": "Password reset", "must_change_password": true}`

---

### Database Change Required

The `admin_users` table needs a `must_change_password` column:

```sql
ALTER TABLE admin_users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;
```

This will be migration 039. Auth-service's admin login flow should check this flag and return it in the JWT or login response so the frontend can force a password change screen.

---

### UI Behavior

- **List view:** Table with columns: Name, Email, Role (badge: purple "superadmin" / gray "admin"), Created At, Actions
- **Actions column:** Edit button, Reset Password button, Delete button (with confirmation modal)
- **Create form:** Modal with email, name, password, role dropdown
- **Self-edit:** Separate "My Profile" section or accessible via avatar/menu — shows name (editable) + change password form
- **Guards:**
  - Delete button disabled on self
  - Delete button disabled on last superadmin (with tooltip explaining why)
  - Role dropdown disabled when editing the last superadmin
- **First login flow:** When `must_change_password` is true, frontend shows a forced password change screen before allowing access to admin panel

---

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Password creation | Superadmin sets initial password | No email infrastructure for invite flow |
| First login | must_change_password flag forces change | Secure handoff without sharing permanent credentials |
| Self-edit scope | Name + password only | Email is login identity, role is privilege — both need superadmin |
| Last superadmin guard | Cannot delete or demote | Prevents permanent lockout |
| Self-delete | Not allowed | Prevents accidental self-removal |
| Password policy | Same as user passwords (8-72 chars, upper+lower+digit+special) | Consistent security standard |
