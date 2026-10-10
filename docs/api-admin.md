# Admin Service API Reference

Base URL (tunnel): `https://api.futureguide.id`
Base URL (local): `http://localhost:8085`

This reference covers 51 administrative routes.

All `/admin/*` endpoints require a valid JWT issued by `POST /auth/admin/login` at `https://api.futureguide.id/auth/admin/login`. Include it as a Bearer token:

```
Authorization: Bearer <jwt>
Content-Type: application/json
```

---

## Authentication & Role Model

| Role | Access |
|------|--------|
| `admin` | All read endpoints + `PUT /admin/users/{id}`, `POST /admin/users/{id}/verify-email`, `PUT /admin/admins/me` |
| `superadmin` | Everything. Routes guarded by `SuperAdminOnly` middleware in `internal/admin/module.go`: user suspend/unsuspend/revoke-sessions/reset-password/grant-tokens/deduct-tokens; `PUT /config/{key}`, `POST /config/reload`; prompt update/revert/toggle; Potensi draft/edit/publish; ledger infra-costs PUT/DELETE and exchange-rate PUT/refresh; admin create/update/delete/reset-password. |

**Stale token rejection:** If an admin is demoted (e.g. superadmin to admin), existing JWTs with the old role are rejected with 403 until a new token is issued.

Rate limits apply per client IP (respects `X-Forwarded-For` only from `TRUSTED_PROXY_CIDRS`):

| Scope | Limit |
|-------|-------|
| General admin | 60 req/min |
| Monitoring | 10 req/min |
| Exchange-rate refresh | 6 req/hour |

**Rate limit headers** (present on every response from rate-limited routes):

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Max requests allowed in window |
| `X-RateLimit-Remaining` | Remaining requests (min 0) |
| `Retry-After` | Seconds until reset (only on 429) |

**429 response:** `{"message": "terlalu banyak permintaan, coba lagi nanti"}`

**503 response** (Redis unavailable, fail-closed): `{"message": "layanan tidak tersedia, coba lagi nanti"}`

---

## Pagination

Paginated list endpoints use keyset cursor pagination. Not paginated (return everything; small tables): `GET /admin/admins`, `GET /admin/prompts`, `GET /admin/config`, `GET /admin/ledger/infra-costs` (history capped at 200 rows). `GET /admin/config/{key}/audit` and `GET /admin/prompts/{id}/versions` accept `limit` but no cursor.

- **Cursor encoding:** base64url-encoded JSON `{"created_at":"RFC3339","id":"uuid"}`
- **`next_cursor`:** present in response only when more pages exist; **omitted entirely** (not null, not empty string) when there are no more results
- **`limit`:** default 20, max 100 (silently clamped)
- **Ordering:** `(created_at, id) DESC` — newest first

---

## Nullable & Omitted Fields

This API uses Go's `omitempty` JSON tag. Fields documented as "nullable" behave as follows:

- **Omitted fields** (tagged `omitempty`): When the value is nil/zero, the field is **absent from the JSON response entirely** — not serialized as `null`. Check for field existence (`"field" in obj` or `obj.field !== undefined`) rather than `=== null`.
- **Null fields** (no `omitempty`): Serialized as `null` when empty.

Fields that are **omitted** when empty (not null):
- `assessment.completed_at`
- `user.school_name`, `user.grade`, `user.major`
- `chat_summary.last_message_at`
- `messages[].token_count`
- `next_cursor` (pagination)
- `restart_warning` (config update)
- `cache_warning`, `variable_warnings` (prompt update)
- `ServiceCheck.status_code`, `ServiceCheck.latency`, `ServiceCheck.error`

Fields that serialize as **null** when empty:
- `model_info` (entire object in assessment detail)
- `analysis_result` (entire object)
- `chat_summary` (entire object)
- `versions[].changed_by` (prompt versions)

---

## Health & Infrastructure (no auth)

### `GET /health`

Liveness check. Static response — does not touch PostgreSQL or Redis.

**Response 200:**
```json
{"status": "ok"}
```

### `GET /ready`

Readiness check. Pings PostgreSQL and Redis; non-200 when either is down.

In the consolidated backend, Argus serves `GET /metrics` on port 8085 through `MetricsBearerAuthMiddleware`; when `METRICS_SECRET` is set, send `Authorization: Bearer <METRICS_SECRET>`. The legacy `admin-service` still has its separate `:9090` listener until Compose wiring moves in P10.

**Response 200:**
```json
{"status": "ok"}
```

---

## Overview

### `GET /admin/overview`

Headline stats with today vs yesterday comparison + model info.

**Access:** Any admin

**Response 200:**
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

**Data sources:** Aggregation queries on `users`, `token_transactions`, `payment_orders`, `assessments`, `ai_usage_logs`. Model info from `runtimeconfig`. All queries are cheap index scans.

---

### `GET /admin/overview/timeseries`

Time-bucketed data for a single metric. Heavier aggregation — loaded lazily by the frontend.

**Access:** Any admin

**Query parameters:**

| Param | Values |
|-------|--------|
| `metric` | `users_registered`, `users_verified`, `tokens_purchased`, `orders_completed`, `assessments_submitted`, `revenue`, `ai_costs` |
| `range` | `today`, `7d`, `30d`, `12mo` |

**Note:** Not all overview stats have timeseries equivalents. `tokens_granted` and `independent_users_total`/`independent_assessments_total` are overview-only and not available as timeseries metrics.

**Granularity:**

| Range | Bucket | Data points |
|-------|--------|-------------|
| `today` | per hour | 24 |
| `7d` | per day | 7 |
| `30d` | per day | 30 |
| `12mo` | per month | 12 |

**Response 200:**
```json
{
  "metric": "users_registered",
  "range": "7d",
  "data": [
    { "t": "2026-05-09", "v": 12.0 },
    { "t": "2026-05-10", "v": 8.0 }
  ]
}
```

Time format: `today` = ISO hour (`2026-05-15T08:00:00Z`), `7d`/`30d` = date (`2026-05-15`), `12mo` = month (`2026-05`). Zero-filled, no gaps.

**Note:** `v` is always a `float64`. Integer-looking values may serialize as `12.0` or `8.0`. Metrics like `revenue` and `ai_costs` will have fractional values.

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"metric parameter is required"` |
| 400 | `"range parameter is required"` |
| 400 | `"invalid metric or range parameter"` |
| 500 | `"failed to load timeseries"` |

---

### `GET /admin/overview/schools`

Top 10 school rankings by assessment count and user count.

**Access:** Any admin

**Response 200:**
```json
{
  "by_assessments": [
    { "school_id": "uuid", "school_name": "SMA Negeri 1 Jakarta", "count": 245 }
  ],
  "by_users": [
    { "school_id": "uuid", "school_name": "SMA Negeri 1 Jakarta", "count": 89 }
  ]
}
```

---

## Assessment QA

### `GET /admin/assessments`

Paginated assessment list for QA navigation.

**Access:** Any admin

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `limit` | int | Page size (default 20, max 100) |
| `cursor` | string | Opaque keyset cursor |
| `school_id` | uuid | Filter by school |
| `status` | string | `pending`, `processing`, `completed`, `failed` |
| `date_from` | datetime | Assessments created after |
| `date_to` | datetime | Assessments created before |
| `user_name` | string | ILIKE search on `users.full_name` |
| `user_email` | string | ILIKE search on `users.email` |
| `model` | string | Filter by the latest analysis run model (`created_at DESC, id DESC`) |

**Response 200:**
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

**Nullable fields:** `school_name`, `model_used` can be `null`.

**`next_cursor`:** omitted when no more pages.

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"invalid cursor parameter"` |
| 400 | `"invalid status filter: must be pending, processing, completed, or failed"` |
| 400 | `"invalid date range: date_from must be before date_to"` |
| 500 | `"failed to list assessments"` |

---

### `GET /admin/assessments/{id}/detail`

Full assessment detail for QA review. Returns everything except chat messages.

**Access:** Any admin

**Response 200:**
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
    "riasec": [{ "domain": "R", "score": 85 }],
    "ocean": [{ "domain": "O", "score": 78 }],
    "viais": [{ "domain": "Creativity", "score": 90 }]
  },
  "answers": {
    "riasec": {
      "R": [{ "question_number": 1, "question_text": "...", "answer": 4, "reverse_scored": false }]
    },
    "ocean": {
      "O": [{ "question_number": 61, "question_text": "...", "answer": 5, "reverse_scored": false }]
    },
    "viais": {
      "Creativity": [{ "question_number": 105, "question_text": "...", "answer": 4, "reverse_scored": false }]
    }
  },
  "analysis_result": {
      "profile_summary": {
        "signature_title": "The Analytical Creator",
        "signature_description": {
          "text": "A research-driven personality combining high intellectual curiosity with genuine care for others, excelling in environments that reward both depth of analysis and creative problem-solving.",
          "reference_ids": []
        },
        "learning_style": {
          "preference": "Self-directed exploration with structured milestones",
          "environment": "Quiet, resource-rich spaces with periodic collaborative sessions"
        }
      },
      "detailed_analysis": {
        "strengths": [
          {
            "text": "Exceptional ability to synthesize creative ideas with systematic execution",
            "reference_ids": []
          },
          {
            "text": "Strong interpersonal awareness that enhances team collaboration",
            "reference_ids": []
          },
          {
            "text": "Natural curiosity driving continuous learning and skill acquisition",
            "reference_ids": []
          }
        ],
        "team_dynamics": {
          "natural_role": "Strategic advisor who provides depth and rigor to team decisions",
          "collaboration_style": "Prefers small-group deep work over large-team coordination",
          "synergy_needs": "Needs action-oriented teammates who push past analysis paralysis"
        }
      },
      "career_pathing": {
        "top_industries": [
          "UX Research in EdTech",
          "Behavioral Science Consulting",
          "Clinical Data Analytics"
        ],
        "ideal_work_environment": "Autonomous role with clear goals, minimal bureaucracy, and access to mentorship from domain experts.",
        "role_prospects": [
          {
            "role_title": "UX Researcher",
            "match_reason": {
              "text": "High Investigative + Artistic + Openness creates natural fit for user-centered research",
              "reference_ids": []
            },
            "market_outlook": {
              "label": "growing",
              "sentence": "Research and interpretation may remain useful across industries; this is a general estimate, not market data."
            },
            "automation_risk": {
              "label": "low",
              "sentence": "Some routine tasks may be automated while interpretation and collaboration remain context-dependent."
            }
          },
          {
            "role_title": "Data Analyst",
            "match_reason": {
              "text": "High Conscientiousness + Investigative supports structured data interpretation",
              "reference_ids": []
            },
            "market_outlook": {
              "label": "growing",
              "sentence": "Research and interpretation may remain useful across industries; this is a general estimate, not market data."
            },
            "automation_risk": {
              "label": "medium",
              "sentence": "Some routine tasks may be automated while interpretation and collaboration remain context-dependent."
            }
          }
        ]
      },
      "student_recommendations": {
        "extracurricular_clubs": [
          {
            "club_name": "Design Thinking Lab",
            "relevance": "Channels Artistic and Investigative traits into structured creative problem-solving"
          },
          {
            "club_name": "Psychology Research Club",
            "relevance": "Develops research methodology skills aligned with high Openness and Investigative scores"
          }
        ],
        "immediate_actions": [
          {
            "action": "Start a research journal",
            "description": "Document one observation per day about user behavior in apps you use — builds research muscle"
          },
          {
            "action": "Take an online UX fundamentals course",
            "description": "Platforms like Coursera or Google UX Certificate provide structured entry into the field"
          }
        ]
      },
      "personal_growth": {
        "development_areas": [
          {
            "area": "Decision speed under ambiguity",
            "action_plan": "Practice 2-minute decision drills: set a timer and commit to a choice before it rings, starting with low-stakes daily decisions"
          },
          {
            "area": "Public speaking confidence",
            "action_plan": "Join a debate club or Toastmasters equivalent; present one finding per month to a small group"
          }
        ],
        "book_recommendations": [
          {
            "title": "Thinking, Fast and Slow",
            "author": "Daniel Kahneman",
            "relevance": "Directly addresses the analytical-intuitive tension visible in high Investigative + moderate Neuroticism"
          },
          {
            "title": "The Design of Everyday Things",
            "author": "Don Norman",
            "relevance": "Bridges Artistic creativity with systematic usability thinking — core UX foundation"
          }
        ]
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

**Narrative compatibility:** Claims use `{text, reference_ids}`; IDs are resolved reference UUIDs (an empty array means no cited retrieval). New career estimates use qualitative `{label, sentence}` objects, with no salary or measured market statistics. Historical string estimates retain their string JSON shape. The typed result omits retired `weaknesses` and `wage_structure` keys when serializing historical rows; reading never rewrites stored JSON. Keep the general-estimate disclaimer in views.

**Nullable fields:** `assessment.completed_at`, `user.school_name`, `user.grade`, `user.major`, `model_info` (entire object — null if not yet analyzed), `analysis_result` (entire object — null if not completed), `chat_summary` (entire object — null if no chat), `chat_summary.last_message_at`. See [Nullable & Omitted Fields](#nullable--omitted-fields) for omit vs null behavior.

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"valid assessment id is required"` |
| 404 | `"assessment not found"` |
| 500 | `"failed to load assessment detail"` |

---

### `GET /admin/assessments/{id}/chat`

Full chat message history for an assessment.

**Access:** Any admin

**Response 200:**
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

**Nullable fields:** `messages[].token_count` — omitted when nil (not serialized as `null`). See [Nullable & Omitted Fields](#nullable--omitted-fields).

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"valid assessment id is required"` |
| 404 | `"assessment not found"` |
| 404 | `"no chat session for this assessment"` |
| 500 | `"failed to load assessment chat"` |

---

## User Management

### `GET /admin/users`

Paginated user list.

**Access:** Any admin

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `limit` | int | Page size (default 20, max 100) |
| `cursor` | string | Keyset cursor |
| `name` | string | ILIKE search on `full_name` |
| `email` | string | ILIKE search on `email` |
| `school_id` | uuid | Filter by school |
| `registered_from` | datetime | Registered after |
| `registered_to` | datetime | Registered before |
| `verified` | bool | `true`/`false` (omit for all) |
| `suspended` | bool | `true`/`false` (omit for all) |
| `provider` | string | `email` or `google` |

**Response 200:**
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
      "deleted": false,
      "token_balance": 3,
      "assessment_count": 5,
      "last_assessment_at": "2026-05-14T10:30:00Z"
    }
  ],
  "next_cursor": "..."
}
```

**Nullable fields:** `school_name`, `last_assessment_at` can be `null`.

**`deleted`:** always a boolean. `true` marks an anonymized account; its
financial records remain available by the stable user ID.

**`assessment_count`:** always an integer (never `null`, `0` if none) — total assessments submitted by the user across all statuses, computed with a correlated subquery. For a completed/total split use `GET /admin/users/{id}` (`stats.assessments_total`, `stats.assessments_completed`).

**`next_cursor`:** omitted when no more pages.

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"invalid cursor"` |
| 400 | `"invalid provider: must be email or google"` |
| 400 | `"registered_from must be before registered_to"` |
| 400 | `"invalid date format, use RFC3339"` |
| 500 | `"failed to list users"` |

---

### `GET /admin/users/{id}`

User detail with aggregate stats, assessment list, chat sessions, and recent transactions.

**Access:** Any admin

**Response 200:**
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
    "deleted": false,
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
    { "id": "uuid", "status": "completed", "submitted_at": "...", "completed_at": "...", "model_used": "gemini-2.5-flash" }
  ],
  "chat_sessions": [
    { "id": "uuid", "assessment_id": "uuid", "model_used": "google/gemini-2.5-flash", "message_count": 12, "last_message_at": "..." }
  ],
  "recent_transactions": [
    { "id": "uuid", "amount": -1, "transaction_type": "assessment_debit", "description": "Assessment submission", "reference_id": "assessment-uuid", "balance_after": 2, "created_at": "..." }
  ]
}
```

**Nullable fields:** `user.school_id`, `user.school_name`, `user.grade`, `user.major`, `user.birthdate`, `stats.last_active_at`, `assessments[].completed_at`, `assessments[].model_used`, `chat_sessions[].last_message_at`.

**`user.deleted`:** always a boolean. `true` marks an anonymized account. User mutation endpoints treat deleted accounts as not found (`404`).

**`reference_id`:** omitted (omitempty) when empty string.

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"valid user id is required"` |
| 404 | `"user not found"` |
| 500 | `"failed to get user detail"` |

---

### `GET /admin/users/{id}/transactions`

Full token transaction ledger.

**Access:** Any admin

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `limit` | int | Page size (default 20, max 100) |
| `cursor` | string | Keyset cursor |
| `type` | string | Filter: `grant`, `purchase`, `assessment_debit`, `refund`, `admin_debit` |

**Response 200:**
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

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"valid user id is required"` |
| 400 | `"invalid cursor"` |
| 400 | `"invalid transaction type"` |
| 404 | `"user not found"` |
| 500 | `"failed to get user transactions"` |

---

### `PUT /admin/users/{id}`

Edit user profile fields.

**Access:** Any admin. Email edit requires superadmin.

**Body size limit:** 8 KB

**Request body (partial update — only provided fields):**
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

**Response 200:** `{"message": "User updated"}`

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"valid user id is required"` |
| 400 | `"invalid request body"` |
| 400 | `"no fields to update"` |
| 400 | `"field exceeds maximum length"` |
| 400 | `"invalid email format"` |
| 403 | `"email change requires superadmin role"` |
| 404 | `"user not found"` |
| 500 | `"failed to update user"` |

---

### `POST /admin/users/{id}/verify-email`

Force-verify a user's email.

**Access:** Any admin

**Response 200:** `{"message": "Email verified"}`

---

### `POST /admin/users/{id}/suspend`

Suspend a user and revoke all refresh tokens.

**Access:** Superadmin

**Response 200:** `{"message": "User suspended"}`

---

### `POST /admin/users/{id}/unsuspend`

Unsuspend a user.

**Access:** Superadmin

**Response 200:** `{"message": "User unsuspended"}`

---

### `POST /admin/users/{id}/revoke-sessions`

Force-logout without suspending. All refresh tokens revoked; user can log back in.

**Access:** Superadmin

**Response 200:** `{"message": "All sessions revoked"}`

---

### `POST /admin/users/{id}/reset-password`

Reset a user's password directly. Generates or accepts a new password, revokes all sessions.

**Access:** Superadmin

**Body size limit:** 4 KB

**Request body (optional — omit `password` for auto-generated):**
```json
{
  "password": "NewSecureP@ss123"
}
```

**Password validation (if provided):** 8-72 Unicode characters, at most 72 UTF-8 bytes for bcrypt, and must contain uppercase + lowercase + digit + special character.

**Response 200:**
```json
{
  "message": "Password reset successful",
  "temporary_password": "the-new-password",
  "sessions_revoked": true
}
```

**Side effects:** Updates password hash, revokes all refresh tokens, clears pending OTP keys in Redis.

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"valid user id is required"` |
| 400 | `"invalid request body"` |
| 400 | `"password must be at least 8 characters"` |
| 400 | `"password must not exceed 72 characters"` |
| 400 | `"password must contain uppercase, lowercase, digit, and special character"` |
| 400 | `"cannot reset password for OAuth-only user"` |
| 403 | `"superadmin role required"` |
| 404 | `"user not found"` |
| 500 | `"failed to reset password"` |

---

### `POST /admin/users/{id}/grant-tokens`

Grant tokens to a user.

**Access:** Superadmin

The balance update, `token_transactions` row, and admin activity row commit in one PostgreSQL transaction through Atlas `ledger`.

**Body size limit:** 4 KB

**Request body:**
```json
{
  "amount": 5,
  "reason": "Compensation for system error during assessment"
}
```

**Validation:** `amount` 1-10000, `reason` required (max 500 chars).

**Response 200:** `{"message": "Tokens granted"}`

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"valid user id is required"` |
| 400 | `"invalid request body"` |
| 400 | `"amount must be greater than 0"` |
| 400 | `"amount exceeds maximum allowed (10000)"` |
| 400 | `"reason is required"` |
| 400 | `"reason exceeds maximum length (500)"` |
| 403 | `"superadmin role required"` |
| 404 | `"user not found"` |
| 500 | `"failed to grant tokens"` |

---

### `POST /admin/users/{id}/deduct-tokens`

Deduct tokens from a user.

**Access:** Superadmin

**Body size limit:** 4 KB

**Request body:**
```json
{
  "amount": 2,
  "reason": "Policy violation: fraudulent assessment submission"
}
```

**Validation:** Same as grant-tokens. Fails if balance would go negative.

The balance update, `token_transactions` row, and admin activity row commit in one PostgreSQL transaction through Atlas `ledger`.

**Response 200:** `{"message": "Tokens deducted"}`

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"valid user id is required"` |
| 400 | `"invalid request body"` |
| 400 | `"amount must be greater than 0"` |
| 400 | `"amount exceeds maximum allowed (10000)"` |
| 400 | `"reason is required"` |
| 400 | `"reason exceeds maximum length (500)"` |
| 400 | `"insufficient token balance"` |
| 403 | `"superadmin role required"` |
| 404 | `"user not found"` |
| 500 | `"failed to deduct tokens"` |

---

## Runtime Config

### `GET /admin/config`

List all runtime config entries grouped by category.

**Access:** Any admin

**Query params (optional):** `?category=analysis` — filter by category name.

**Response 200:**
```json
{
  "config": {
    "analysis": [
      {
        "key": "analysis.gemini_model",
        "value": "gemini-2.5-flash",
        "description": "Gemini model for analysis generation",
        "value_type": "string",
        "updated_at": "2026-05-10T08:00:00Z",
        "updated_by": "admin-uuid"
      }
    ],
    "chat": [],
    "assessment": [],
    "payment": [],
    "general": []
  }
}
```

**Note:** `config` is a map keyed by category name. Categories with no entries may be absent from the map. `updated_at` is UTC formatted as `2006-01-02T15:04:05Z`. `updated_by` is an empty string `""` (not null, not omitted) when no admin has ever updated the key manually.

---

### `GET /admin/config/{key}/audit`

Change history for a specific config key.

**Access:** Any admin

**Query params:** `?limit=50` (default 50, max 200)

**Response 200:**
```json
{
  "key": "analysis.gemini_model",
  "audit": [
    {
      "id": 12,
      "old_value": "gemini-2.0-flash",
      "new_value": "gemini-2.5-flash",
      "changed_by": "admin-uuid",
      "changed_at": "2026-05-10T08:00:00Z",
      "reason": "Upgraded to 2.5 for better structured output"
    }
  ]
}
```

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"config key is required"` |
| 404 | `"config key not found"` |
| 500 | `"failed to load audit log"` |

---

### `PUT /admin/config/{key}`

Update a config value.

**Access:** Superadmin

**Body size limit:** 4 KB

**Request body:**
```json
{
  "value": "gemini-3.5-flash-lite",
  "reason": "Testing whether the lite model keeps claim support and structure compliance"
}
```

**Rules:** `value` required (non-empty string). Value validated against the key's declared `value_type` (string, int, float, bool, duration). For `analysis.gemini_model`, `analysis.gemini_fallback_model` and `analysis.embedding_model` the value must also be in a static allow-list (see `atlas/docs/rag-and-config.md`); unknown model names return 400. `analysis.max_retries` must be an integer 1–3 and `analysis.rag_top_k` 1–20 (Athena's own bounds); other values return 400. Publishes Redis invalidation after update.

**Response 200:**
```json
{
  "key": "analysis.gemini_model",
  "value": "gemini-3.5-flash-lite",
  "restart_warning": "this change requires an analysis-worker restart to take effect"
}
```

**`restart_warning`:** only present (omitempty) for the startup-only keys `analysis.worker_count`, `analysis.max_retries`, `analysis.rag_top_k` and the three Gemini model keys (read once at Athena startup).

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"config key is required"` |
| 400 | `"invalid request body"` |
| 400 | `"value is required"` |
| 400 | `"invalid value for config type"` |
| 403 | `"superadmin role required"` |
| 404 | `"config key not found"` |
| 500 | `"failed to update config"` |

---

### `POST /admin/config/reload`

Force reload config store from database.

**Access:** Superadmin

**Response 200:** `{"message": "config reloaded successfully"}`

**Errors:**

| Status | Message |
|--------|---------|
| 403 | `"superadmin role required"` |
| 500 | `"failed to reload config"` |

---

## Monitoring

### `GET /admin/monitoring`

Full infrastructure status. All checks run in parallel with 3s per-check timeout.

**Access:** Any admin

**Rate limited:** 10 req/min

**Response 200:**
```json
{
  "timestamp": "2026-05-15T08:30:00Z",
  "postgres": {
    "status": "healthy",
    "active_connections": 12,
    "max_connections": 100,
    "pool_total": 20,
    "pool_idle": 15,
    "pool_in_use": 5,
    "db_size_bytes": 524288000,
    "outbox_unpublished": 2,
    "outbox_stuck": 0
  },
  "redis": {
    "status": "healthy",
    "used_memory_mb": 45.0,
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
  "services": {
    "apollo": { "status": "healthy", "status_code": 200, "latency": "5.123ms" },
    "argus": { "status": "healthy", "status_code": 200, "latency": "8.456ms" }
  },
  "tunnel": {
    "api": { "status": "healthy", "status_code": 200, "latency": "120.789ms" }
  },
  "workers": [
    { "worker_id": "worker-abc123", "ttl_seconds": 25 }
  ]
}
```

Service checks default to `apollo=http://apollo:8080/health,argus=http://argus:8085/health` on the Docker network. The public tunnel check defaults to `api=https://api.futureguide.id/health` and reaches Apollo only; Argus is checked internally. Override via `ADMIN_SERVICE_HEALTH_URLS` / `ADMIN_SERVICE_TUNNEL_URLS` (`name=url` pairs).

**`services` and `tunnel`:** maps keyed by service name (not arrays). Each value is a `ServiceCheck`:
- `status`: `"healthy"`, `"unhealthy"`, or `"timeout"`
- `status_code`: HTTP status (omitted when 0 / unreachable)
- `latency`: Go duration string from `time.Duration.String()` — e.g. `"5.123ms"`, `"1.2s"` (omitted when unavailable)
- `error`: string — possible values: `"invalid request"`, `"connection failed"` (omitted when empty)

**`queue`:** PostgreSQL counts: `pending` = `ready`, `active` = `running`, `dlq` = `dead`, `stale_claims` = running rows with expired leases. JSON field names remain stable. `postgres.outbox_unpublished` now counts ready rows; `postgres.outbox_stuck` counts expired running leases. Old publication timestamps and Redis lists do not affect these counts.

**`workers`:** always an array (empty `[]` if no active workers); Redis heartbeats report liveness only, never job ownership.

**Status values for postgres/redis:** `"healthy"`, `"unhealthy"`, `"timeout"`.

**Errors:**

| Status | Message |
|--------|---------|
| 500 | `"failed to load monitoring status"` |

---

## Prompt Templates

### `GET /admin/prompts`

List all prompt templates. Content is omitted in list view.

**Access:** Any admin

**Response 200:**
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
      "updated_by": null,
      "created_at": "2026-05-01T00:00:00Z",
      "updated_at": "2026-05-10T08:00:00Z"
    }
  ]
}
```

**Nullable fields:** `updated_by` (null if never updated by an admin).

**Note:** `content` is not included in list responses. Use `GET /admin/prompts/{id}` for full content.

**Cache types:** `"cached"` — part of Gemini static cache; `"per_request"` — injected per-request.

**Errors:**

| Status | Message |
|--------|---------|
| 500 | `"failed to list templates"` |

---

### `GET /admin/prompts/{id}`

Full template detail with content.

**Access:** Any admin

**Response 200:**
```json
{
  "id": "uuid",
  "template_key": "analysis.role",
  "name": "Analysis Role Prompt",
  "description": "Defines the AI persona for analysis generation",
  "content": "You are a non-clinical assessment analysis assistant...",
  "variables": ["scores", "references"],
  "version": 3,
  "is_active": true,
  "cache_type": "cached",
  "updated_by": null,
  "created_at": "2026-05-01T00:00:00Z",
  "updated_at": "2026-05-10T08:00:00Z"
}
```

**Nullable fields:** `updated_by`.

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"valid template id is required"` |
| 404 | `"template not found"` |
| 500 | `"failed to get template"` |

---

### `GET /admin/prompts/{id}/versions`

Version history for a template.

**Access:** Any admin

**Query params:** `?limit=10` (default 10, max 50)

**Response 200:**
```json
{
  "template_key": "analysis.role",
  "current_version": 3,
  "versions": [
    {
      "id": "uuid",
      "template_id": "uuid",
      "template_key": "analysis.role",
      "content": "You are a non-clinical assessment analysis assistant...",
      "variables": ["scores", "references"],
      "version": 2,
      "changed_by": null,
      "change_reason": "Added emphasis on Indonesian cultural context",
      "created_at": "2026-05-10T08:00:00Z"
    }
  ]
}
```

**Nullable fields:** `versions[].changed_by`.

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"valid template id is required"` |
| 404 | `"template not found"` |
| 500 | `"failed to get versions"` |

---

### `PUT /admin/prompts/{id}`

Update a prompt template. Auto-creates a version record.

**Access:** Superadmin

**Body size limit:** 1 MB

**Request body:**
```json
{
  "content": "You are a non-clinical assessment analysis assistant specializing in...",
  "variables": [{"name": "scores"}, {"name": "references"}],
  "change_reason": "Added emphasis on Indonesian cultural context"
}
```

**Validation:** `content` required (max 100,000 chars), `change_reason` required (max 500 chars).

**Response 200:**
```json
{
  "message": "Template updated",
  "template_key": "analysis.role",
  "version": 4,
  "cache_type": "cached",
  "cache_warning": "This template is cached by Gemini. After prompt invalidation, Athena replaces the cache before the next analysis.",
  "variable_warnings": ["Variable \"references\" not found in content"]
}
```

**Optional fields (omitempty):** `cache_warning` (only for `cache_type: "cached"` templates), `variable_warnings` (only when declared variables are missing from content).

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"valid template id is required"` |
| 400 | `"invalid request body"` |
| 400 | `"template validation failed"` |
| 403 | `"superadmin role required"` |
| 404 | `"template not found"` |
| 500 | `"failed to update template"` |

---

### `POST /admin/prompts/{id}/revert`

Revert to a previous version. Creates a new version with old content (does not overwrite history).

**Access:** Superadmin

**Body size limit:** 4 KB

**Request body:**
```json
{
  "target_version": 2,
  "reason": "Claim-support regression in v3 — reverting to stable v2"
}
```

**Validation:** `target_version` must be > 0 and exist in version history. `reason` required (max 500 chars).

**Response 200:**
```json
{
  "message": "Template reverted",
  "template_key": "analysis.role",
  "version": 5,
  "reverted_from_version": 2,
  "cache_warning": "This template is part of the Gemini static cache..."
}
```

**Optional fields (omitempty):** `cache_warning`.

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"valid template id is required"` |
| 400 | `"invalid request body"` |
| 400 | `"template validation failed"` |
| 403 | `"superadmin role required"` |
| 404 | `"template not found"` |
| 404 | `"target version not found"` |
| 500 | `"failed to revert template"` |

---

### `POST /admin/prompts/{id}/toggle`

Activate or deactivate a template. When deactivated, analysis-worker falls back to hardcoded prompts.

**Access:** Superadmin

**Body size limit:** 4 KB

**Request body:**
```json
{
  "is_active": false
}
```

**Response 200:**
```json
{"message": "Template deactivated", "template_key": "analysis.role", "is_active": false}
```

Or when activating:
```json
{"message": "Template activated", "template_key": "analysis.role", "is_active": true}
```

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"valid template id is required"` |
| 400 | `"invalid request body"` |
| 403 | `"superadmin role required"` |
| 404 | `"template not found"` |
| 500 | `"failed to toggle template"` |

---

## Ledger

### `GET /admin/ledger`

Profit & loss summary.

**Access:** Any admin

**Query params:** `?month=2026-05` (format `YYYY-MM`, default: current UTC month)

**Response 200:**
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
        { "package_id": "basic_1", "label": "1 Token", "count": 10, "total_idr": 150000 }
      ]
    },
    "ai_costs": {
      "total_usd": 2.85,
      "total_idr": 47025,
      "breakdown": [
        { "category": "analysis", "model": "gemini-2.5-flash", "cost_usd": 1.80, "cost_idr": 29700, "call_count": 45 }
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

**Notes:**
- `exchange_rate.updated_at` can be empty string `""` if rate was never fetched.
- `exchange_rate.source`: `"auto"` (API refresh), `"manual"` (admin set), `"cached"` (stored value), `"fallback"` (hardcoded 16500).
- `monthly.revenue.breakdown` and `monthly.ai_costs.breakdown` can be empty arrays `[]`.
- `monthly.infra_costs.breakdown` always has 5 items (database, redis, server, domain, other); values may be 0.
- Float values (`ai_costs_usd`, `cost_usd`, `profit_margin_percent`) are rounded to 2 decimal places.

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"invalid month format, expected YYYY-MM"` |
| 500 | `"failed to load ledger data"` |

---

### `GET /admin/ledger/months`

List months with completed payment revenue or successful AI usage, newest first. Empty gaps are omitted; month boundaries use the database session timezone.

**Access:** Any admin

**Response 200:**
```json
{
  "months": [
    { "month": "2026-05", "has_revenue": true, "has_costs": true },
    { "month": "2026-04", "has_revenue": true, "has_costs": true },
    { "month": "2026-03", "has_revenue": false, "has_costs": true }
  ]
}
```

**Note:** `months` can be empty array `[]`.

**Errors:**

| Status | Message |
|--------|---------|
| 500 | `"failed to load available months"` |

---

### `GET /admin/ledger/compare?month=YYYY-MM&against=prev|YYYY-MM`

**Access:** Any admin

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

### `GET /admin/ledger/revenue?month=YYYY-MM&limit=&cursor=&package_id=`

**Access:** Any admin

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

### `GET /admin/ledger/ai-usage?month=YYYY-MM&limit=&cursor=&category=&model=&provider=`

**Access:** Any admin

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

### `GET /admin/ledger/infra-costs?month=YYYY-MM`

**Access:** Any admin

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

### `PUT /admin/ledger/infra-costs`

**Access:** Superadmin

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

### `DELETE /admin/ledger/infra-costs/{period_id}`

**Access:** Superadmin

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

### `GET /admin/ledger/exchange-rate`

**Access:** Any admin

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

### `PUT /admin/ledger/exchange-rate`

**Access:** Superadmin

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

### `POST /admin/ledger/exchange-rate/refresh`

**Access:** Superadmin

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

**Ledger drill-down pagination:** `/ledger/revenue` and `/ledger/ai-usage` return `rows` (not `items`); `next_cursor` is `""` or absent on the last page; an invalid cursor returns `400` `"ledger validation failed: invalid cursor"`.

**External call:** `GET /admin/ledger` and the refresh route may fetch `https://open.er-api.com/v6/latest/USD` (5 s timeout) when the stored rate is older than 24 h and not pinned manually.

---

## Admin User Management

### `GET /admin/admins`

List all admin users.

**Access:** Any admin

**Response 200:**
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

**Note:** All fields are always present (no omitempty on admin user struct). `admins` can be empty array `[]`.

**Errors:**

| Status | Message |
|--------|---------|
| 500 | `"internal error"` |

---

### `POST /admin/admins`

Create a new admin user.

**Access:** Superadmin

**Body size limit:** 4 KB

**Request body:**
```json
{
  "email": "newadmin@futureguide.id",
  "full_name": "New Admin",
  "password": "SecureP@ss123",
  "role": "admin"
}
```

**Validation:**
- `email`: valid format, max 254 chars, local part max 64, domain min 3 chars with dot, must be unique
- `full_name`: non-empty after trim, max 255 chars
- `password`: 8-72 Unicode characters, at most 72 UTF-8 bytes for bcrypt, and must contain uppercase + lowercase + digit + special character
- `role`: must be `"admin"` or `"superadmin"`

**Response 201:**
```json
{
  "message": "Admin created",
  "id": "uuid",
  "email": "newadmin@futureguide.id",
  "role": "admin",
  "must_change_password": true
}
```

**Note:** `must_change_password` is always `true` on creation.

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"invalid request body"` |
| 400 | `"invalid email format"` |
| 400 | `"no fields to update"` |
| 400 | `"field exceeds maximum length"` |
| 400 | `"role must be admin or superadmin"` |
| 400 | `"password must be 8-72 chars with upper, lower, digit, and special character"` |
| 403 | `"forbidden"` |
| 409 | `"email already in use"` |
| 500 | `"internal error"` |

---

### `PUT /admin/admins/me`

Self-edit for any admin. Updates own name and/or password.

**Access:** Any admin

**Body size limit:** 4 KB

**Request body (all fields optional, at least one required):**
```json
{
  "full_name": "My New Name",
  "current_password": "OldP@ss123",
  "new_password": "NewP@ss456"
}
```

**Rules:** `full_name` optional (non-empty after trim, max 255 chars). Password change requires `current_password` (bcrypt verified) + `new_password` (8-72 Unicode characters, at most 72 UTF-8 bytes, upper+lower+digit+special). Cannot change own email or role. If `must_change_password` is true, only this route with a non-empty `new_password` is allowed. A successful password change clears the flag and invalidates the current JWT, so the admin must log in again.

**Response 200:** `{"message": "Profile updated"}`

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"invalid request body"` |
| 400 | `"no fields to update"` |
| 400 | `"field exceeds maximum length"` |
| 400 | `"password must be 8-72 chars with upper, lower, digit, and special character"` |
| 401 | `"current password is incorrect"` |
| 404 | `"admin user not found"` |
| 500 | `"internal error"` |

---

### `PUT /admin/admins/{id}`

Update another admin user.

**Access:** Superadmin

**Body size limit:** 4 KB

**Request body (all fields optional, at least one required):**
```json
{
  "email": "updated@futureguide.id",
  "full_name": "Updated Name",
  "role": "superadmin"
}
```

**Validation:** Email unique if changed. Cannot demote the last superadmin (transactional guard).

**Response 200:** `{"message": "Admin updated"}`

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"invalid admin id"` |
| 400 | `"invalid request body"` |
| 400 | `"invalid email format"` |
| 400 | `"no fields to update"` |
| 400 | `"field exceeds maximum length"` |
| 400 | `"role must be admin or superadmin"` |
| 400 | `"cannot demote the last superadmin"` |
| 403 | `"forbidden"` |
| 404 | `"admin user not found"` |
| 409 | `"email already in use"` |
| 500 | `"internal error"` |

---

### `DELETE /admin/admins/{id}`

Delete an admin user.

**Access:** Superadmin

**Rules:** Cannot delete yourself. Cannot delete the last superadmin (transactional guard).

**Response 200:** `{"message": "Admin deleted"}`

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"invalid admin id"` |
| 400 | `"cannot delete yourself"` |
| 400 | `"cannot delete the last superadmin"` |
| 403 | `"forbidden"` |
| 404 | `"admin user not found"` |
| 500 | `"internal error"` |

---

### `POST /admin/admins/{id}/reset-password`

Reset another admin's password.

**Access:** Superadmin

**Body size limit:** 4 KB

**Request body:**
```json
{
  "new_password": "TempP@ss789"
}
```

**Validation:** Password must meet policy (8-72 Unicode characters, at most 72 UTF-8 bytes, upper+lower+digit+special). Cannot reset your own password (use self-edit instead). Sets `must_change_password = true` and invalidates the target's existing JWTs.

**Response 200:** `{"message": "Password reset", "must_change_password": true}`

**Errors:**

| Status | Message |
|--------|---------|
| 400 | `"invalid admin id"` |
| 400 | `"invalid request body"` |
| 400 | `"use self-edit to change your own password"` |
| 400 | `"password must be 8-72 chars with upper, lower, digit, and special character"` |
| 403 | `"forbidden"` |
| 404 | `"admin user not found"` |
| 500 | `"internal error"` |

---

## Common Error Responses

All errors follow the canonical format from `shared/pkg/httputil`:

```json
{"message": "Error description"}
```

| Status | Meaning |
|--------|---------|
| 400 | Validation error (bad request body, missing fields, invalid params) |
| 401 | Missing/invalid/expired JWT, or current password incorrect (self-edit) |
| 403 | Insufficient role (admin trying superadmin-only endpoint, or stale token after demotion) |
| 404 | Resource not found |
| 409 | Conflict (email duplicate) |
| 429 | Rate limit exceeded or cooldown active |
| 500 | Internal server error |
| 503 | Service unavailable (Redis down, rate limiter fail-closed) |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_ADDR` | Yes | Redis address |
| `JWT_SECRET` | Yes | HS256 signing key (min 32 chars) |
| `CORS_ALLOWED_ORIGINS` | No | Comma-separated allowed origins |
| `TRUSTED_PROXY_CIDRS` | No | CIDR ranges for rate limiter forwarding header trust |
| `ADMIN_SERVICE_HEALTH_URLS` | No | `name=url` pairs for service health checks |
| `ADMIN_SERVICE_TUNNEL_URLS` | No | `name=url` pairs for tunnel health checks |

---

## Admin Authentication

- Admin login returns a 15-minute access JWT and no refresh token.
- `must_change_password` is enforced by Argus. While true, only `PUT /admin/admins/me` with a new password is allowed.
- Password reset/change and role changes invalidate previously issued admin JWTs. Admins log in again after changing their password.
- Admin activity records include the actor email and resolved client IP.


## Potensi catalog (D42 / PS2-b-a)

Six routes manage the versioned 180-entry editorial catalog. Both admin roles
may read; only superadmin may mutate. All routes use normal REST deadlines,
admin JWT verification (including current role/password checks), and the existing
60/minute per-route rate limit.

| Method | Path | Role | Result |
|---|---|---|---|
| GET | `/admin/potensi/versions?limit=20&cursor=...` | admin/superadmin | `{versions:[...],next_cursor?}`; limit 1–50, descending `(created_at,id)` cursor |
| GET | `/admin/potensi/versions/{id}` | admin/superadmin | Version header plus `entries` |
| GET | `/admin/potensi/versions/{id}/audit?limit=20&cursor=...` | admin/superadmin | `{audit:[...],next_cursor?}`; limit 1–50, descending `(created_at,id)` cursor |
| POST | `/admin/potensi/versions` | superadmin | 201; `{label:"v2"}` clones all entries from the active version into a draft |
| PUT | `/admin/potensi/versions/{id}/entries/{cell_id}` | superadmin | 200 `{updated:true}`; replaces the five editorial fields of a draft entry |
| POST | `/admin/potensi/versions/{id}/publish` | superadmin | 200 `{published:true}`; draft becomes active, previous active becomes retired |

Version headers contain `id`, `label`, `status`, nullable `created_by`,
`created_at`, `updated_at`. Entries contain `cell_id`, `name`, `description`,
`example_activities`, `example_majors`. IDs are UUIDs; cell IDs are the fixed
RIASEC–OCEAN–virtue universe, e.g. `R-O-Wisdom`. Entry lists use stable cell-ID order;
heatmaps use the formula's display order. Names describe everyday tendencies in
one or two words; names are unique within a version. Examples are text with
semicolon-separated suggestions. All four text fields are required on PUT;
`cell_id` in the body is optional and must match the route when supplied.

Mutation JSON is limited to 16 KiB and rejects unknown fields/trailing JSON.
Labels are trimmed, nonblank, unique, and at most 80 characters; name/description/
activities/majors limits are 120/1000/1000/500 Unicode characters.

Active and retired versions are immutable. Create another draft to change the
published catalog. Publication checks all 180 distinct valid cells and their text
inside a version-row-locked transaction. A catalog advisory lock serializes
publication and draft cloning across Argus replicas. Edit and publish share the
version row lock. Draft creation, edit, and publication write actor email, trusted
client IP, resource version UUID, and details to `admin_activity_log` in the same
transaction (`potensi_create_draft`, `potensi_edit_entry`, `potensi_publish`).
A failed audit rolls back the mutation. Publication invalidates
`fg:potensi:invalidate` only after commit; Redis failure is logged and does not
undo the committed publication. Reader caches resync every 60 seconds and after
reconnect. Historical results/shared links/PDF will read the current catalog in
PS2-b-b; no score/formula change or stored-result backfill occurs.

Errors: 400 invalid body/cursor/UUID/cell/text or incomplete catalog; 403 forbidden
role; 404 unknown version/entry or no active source catalog; 409 immutable version
or duplicate label/name; 500 unexpected database failure. Missing scores are an
assessment-read concern (PS2-b-b), not a catalog mutation error.

PS3: audit rows expose `id`, `action`, `admin_email`, `ip_address`, `details`,
`created_at`, scoped to the version UUID and `resource_type=potensi_catalog`.
An existing version with no history returns `audit:[]`; an unknown version
returns 404. Both roles may read; no global activity log is exposed. Potensi
PUT preflight accepts the allowed admin origin; unlisted origins remain denied.
