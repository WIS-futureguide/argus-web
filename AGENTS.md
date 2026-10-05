# AGENTS.md — argus-web

> Workspace rules: `../AGENTS.md`. Structure map: `CODEMAP.md`.
> Domain vocabulary: `CONTEXT.md` (in this repo). API contract:
> `docs/api-admin.md` and `../docs/api-admin.md`.
> Vue testing conventions: `.agents/skills/vue-testing-best-practices/SKILL.md`.

## Overview

Admin dashboard UI for FutureGuide. Consumes the Argus admin API
(`https://api.futureguide.id`) and Apollo authentication API
(`https://api.futureguide.id`). Second-largest repo in the workspace by graph
size (1392 nodes, 93 communities), with a test file beside almost every page.

**Repo:** `WIS-futureguide/argus-web` · **Branch:** `master` ·
**Package name:** `argus-web`

## ⚠ This Repo Is PUBLIC

`argus-web` is a **public** GitHub repository in the `WIS-futureguide` org.

Never commit `.env` values, payment or LLM API keys, token-signing secrets, SMTP
credentials, tunnel tokens or IDs, database URLs, real user data, or admin
credentials. `.gitguardian.yaml` is present but does not replace reviewing the diff.

## Repo Status In This Workspace

Plain clone, **not** a git submodule, excluded from the superproject via
`.git/info/exclude`. Commit and push it on its own, on `master`.

It ships its own `.agents/skills/` and `skills-lock.json`. Those are the repo's
own harness and are left in place deliberately — the workspace harness rules do
not require removing them.

## Tech Stack

| Area | Implementation |
|---|---|
| Framework | Vue 3.5 (`<script setup>`), TypeScript ~5.7 |
| Build | Vite, `vue-tsc -b` typecheck on build |
| Routing | vue-router 4.5 |
| State | Pinia 2.3 (`src/stores/auth.ts`) |
| Server state | `@tanstack/vue-query` 5.62 |
| Styling | Tailwind CSS 4 |
| UI primitives | radix-vue 1.9 |
| Charts | chart.js 4.5 + vue-chartjs |
| Animation | GSAP 3.15 |
| Tests | vitest + `@vue/test-utils` + happy-dom |

## Layout

```
src/pages/         one page per admin module, each with a .test.ts beside it:
                   Overview, Assessments (+Detail, +Chat, +Compare), Users
                   (+Detail), Config, Monitoring, Prompts (+Detail), Potensi (+Detail), Ledger,
                   Admins, Login, ChangePassword
src/lib/api*.ts    one typed API client per admin module (api-overview,
                   api-assessments, api-users, api-config, api-monitoring,
                   api-prompts, api-potensi, api-admins, api-ledger)
src/lib/api.ts     shared fetch wrapper, auth header, error shape
src/stores/auth.ts Pinia auth store (JWT from POST /auth/admin/login)
src/components/    shared components + ledger/ and users/ subtrees
src/composables/   reusable logic
src/layouts/ src/router/ src/assets/
docs/              ADRs and module plans/audits (ledger, responsive, WCAG, Vue 3)
```

## Working Rules

- **One API client module per admin module.** A new endpoint goes into the
  matching `src/lib/api-*.ts`, not into a page component.
- Server state goes through `@tanstack/vue-query`; Pinia holds auth/session only.
- List views must use the backend's **keyset pagination** (`limit`, `cursor`).
  There is no offset pagination on the admin API — do not fake one client-side.
- The API returns errors as `{"message": "..."}` (`shared/pkg/httputil`). Handle
  that shape; do not invent error envelopes.
- Superadmin-only actions (runtime config writes, config reload, admin account
  create/update/delete) must be gated in the UI by the role claim, and the
  backend enforces it again — never rely on UI gating alone.
- Follow `.agents/skills/vue-testing-best-practices/SKILL.md`: black-box component
  testing, `flushPromises` for async, Pinia store setup per test, no
  snapshot-only tests.
- Every new page gets a `.test.ts` beside it — that is the repo's existing
  convention, not an aspiration.

## Verify

```bash
npm ci
npm run build      # vue-tsc -b && vite build
npm test           # vitest
npm run dev
```

Local development proxies `/admin` and `/payments` to Argus, and `/auth` to
Apollo. Override `VITE_ARGUS_API_TARGET` or `VITE_APOLLO_API_TARGET` when the
backend services are not reachable at their default local addresses. The
production API origin remains `https://api.futureguide.id`.

## Container contract (PW6-b)

`Dockerfile` has deps/build/gate/runtime stages. The runtime depends on the gate
(build + 274 tests), contains only Vite static output, and runs non-root nginx
on port 80. Keep `/healthz`, SPA fallback, hashed asset caching, missing asset
404s and security headers. `VITE_API_BASE_URL` is public build-time config only;
Docker context excludes `.env*`, keys and local tooling. Atlas supplies the
read-only root, `/tmp` tmpfs, private web network and memory/capability limits.
No host port or datastore network belongs on this service. Auto-deploy for
Argus remains PW6-c/P25b; laptop 1 keeps manual Argus deployment (D41).

PS3: Potensi versions/detail use Vue Query and keyset list/audit pagination.
Keep superadmin edits limited to drafts, publication confirmation explicit,
RIASEC/OCEAN/virtue filters (ES, not raw N), and D42 editorial warnings.
All catalog reads are available to admins; backend authorization remains final.
Build + 292 tests include 18 Potensi component/API cases.

PS4-b-b-b-b-a: assessment detail/compare never render `wage_structure`, including
legacy results with populated, empty or missing salary fields. The view-facing
API type omits wages; backend persistence is unchanged. Career estimates carry
“Perkiraan umum, bukan data pasar.”. New qualitative schema follows in
PS4-b-b-b-b-b. Keep regressions for both pages; no salary assumptions in templates.

PS4-b-b-b-b-b-b-a: assessment estimates accept historical strings or new
`{label,sentence}` objects. Detail renders Indonesian enum labels plus sentences;
comparison retains its existing role/match content for both shapes. Missing/null
estimates render empty. Keep “Perkiraan umum, bukan data pasar.” and suppress
salary figures. Live producer activation remains PS4-b-b-b-b-b-b-b.

PS4-b-b-b-b-b-b-b-b-b-a (R19 Claim): assessment detail/compare render narrative
`Claim {text,reference_ids}` values via `claimText()`, with historical string
compatibility for `signature_description`, `strengths[]` and `match_reason`.
Reference UUIDs stay out of visible narrative. Retired `weaknesses` is omitted
from the view type and both templates; `development_areas` remains readable.
Object/string estimate readers and the estimate qualifier are preserved.
Synthetic typed fixtures follow Argus's direct Atlas-model JSONB scan; detail
and compare regressions cover object, string and mixed claims, plus both
estimate shapes. Template/Potensi/worker rollout remains a separate backend unit.
