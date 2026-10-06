# Argus Web

D43 rollout acceptance completed on the development laptop (2026-10-05).
The manually refreshed admin image includes PS3 Potensi and the existing
object/string estimate and Claim readers. Build/typecheck and all 317 tests
passed, including detail/compare compatibility regressions; the Docker gate
repeated the same build/tests before deployment. No UI/source or API contract
change was needed. Production-host timer activation remains P25b.

Public Vue 3 admin dashboard for FutureGuide. This repository is `WIS-futureguide/argus-web` and uses the `master` branch. It provides user, assessment, monitoring, prompt, Potensi catalog, ledger, and admin-management screens aligned with the current Argus API. Admin and authentication requests share `https://api.futureguide.id`. Set the public build-time `VITE_API_BASE_URL` to override this origin; an empty value uses the default. The dashboard production target is `https://admin.futureguide.id` behind Cloudflare Access.

Run `npm ci` to install dependencies, `npm run build` to build the app, and `npm run test:run` to run its tests.

Local Docker hot reload: run `../atlas/scripts/dev.sh --web up`; see `../atlas/docs/operations.md` (Dev mode).

## Container deployment (PW6-b)

`docker build -t argus-web:local .` runs `npm ci`, `npm run build`, and
`npm run test:run` in Docker. Only the public `VITE_API_BASE_URL` build argument
is supported (default `https://api.futureguide.id`); never pass secrets.
The runtime contains static assets only, runs nginx as a non-root user on port
80, and probes `/healthz`. Deep routes use SPA fallback; hashed assets cache for
one year and missing assets return 404. Security headers allow the existing
Google Fonts stylesheet/font origins.

Use the sibling Atlas application Compose `frontend` profile. The service has
no host port and joins the isolated web bridge; it receives no runtime `.env`
and cannot reach the datastore bridge. Read-only rootfs needs the provided
`/tmp` tmpfs. Argus deployment remains manual on the development laptop;
Atlas PW6-c implements the two-frontend pull deployer and host-a user timer;
production-host activation follows in P25b. The public repository is fetched
via HTTPS without private account credentials. Docker build/test gates,
in-container `/healthz`, rotated logs, three retained tags and automatic
rollback protect each release. A push to `master` becomes a production release
once that timer is enabled. The sibling Atlas `docs/deploy.md` section
"Frontend auto-deploy" covers prerequisites, timer pause and manual rollback.
The public admin hostname still needs its planned Cloudflare route.

## Potensi catalog (PS3)

`/app/potensi` lists versions with backend keyset cursors; each version detail
shows the 180 catalog entries, RIASEC/OCEAN/virtue filters and paginated audit
history. OCEAN's fifth catalog dimension is ES (emotional stability).
Admins read; superadmins clone the active version, edit draft entries, and
publish after explicit confirmation. Active and retired versions are immutable.
The editor warns for `skill|keterampilan|talenta|kelemahan|diagnos` in name,
description, example activities and example majors. Matching is case-insensitive
and deduplicated across fields (including the `diagnos` stem). Warnings remain
editorial: saving is allowed; no new API/publication restriction or approved
catalog change is introduced. Argus validates and audits each mutation.
Publication changes historical results, share links and future PDF reads.
Errors preserve unsaved form text; successful writes refetch detail and audit.

Verification: `npm run build && npm run test:run`; PS3 adds 18 component/client
cases (292 total). An isolated local Docker Argus/PG/Redis rehearsal exercises
draft → edit → confirmation → publish → audit, plus admin read-only access.
No fixtures or credentials belong in this public repository.

PS4-b-b-b-b-a: assessment detail/compare suppress legacy salary fields and label
career estimates “Perkiraan umum, bukan data pasar.”. Stored results and existing
role/persona narratives remain readable; qualitative schema follows next.

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

## Dependency verification gate (dev #109, 2026-10-06)

Before accepting a dependency patch, read `npm ls --all` and both audit reports.
Use the official registry with TLS verification explicitly enabled; keep device
npm configuration unchanged. Apply compatible fixes through npm, review the
manifest/lockfile diff, then require these checks from the repository root:

```bash
npm ci --registry=https://registry.npmjs.org --strict-ssl=true
npm run test:run -- src/lib/api-potensi.test.ts src/pages/PotensiDetailPage.test.ts
npm run build
npm run test:run
docker build --target gate .
npm audit --omit=dev --registry=https://registry.npmjs.org --strict-ssl=true --audit-level=high
npm audit --registry=https://registry.npmjs.org --strict-ssl=true --audit-level=high
```

The two audit checks are a separate acceptance gate; the Docker `gate` stage
runs build/tests, not an explicit blocking audit. Record every residual advisory
and its reachable path even below High. Audit failure, registry failure or TLS
failure must not count as clean. Do not use `--force`, disable TLS or remove
features to silence an advisory. Review public-repo changes for secrets and
internal hostnames before any separately authorized publish.

Dev #109 baseline: production graph **5 High**; full graph **8 High + 2 Moderate**.
`npm audit fix` resolved compatible transitive/tooling updates but left Vue and
its server renderer (2 High). Explicit Vue `3.5.34 → 3.5.42` resolved those.
Vue Test Utils requires `@vue/server-renderer` at module load despite its optional
peer declaration; a fresh install exposed its missing root module. Declare
`@vue/server-renderer ^3.5.42` in devDependencies to retain component testing.
It is also reached from Vue in the npm production graph; this does not add SSR
to the app. Final `npm ci`, typecheck/build, **19 focused / 324 total tests in
35 files**, and Docker gate pass. Final production and full audits each report
**0 vulnerabilities**, with no peer errors in `npm ls --all`.

Reachability of the original findings:

- Production dependency graph: Vue/server-renderer had an SSR attribute XSS
  advisory; this SPA uses `createApp`, not server rendering. Vue's compiler-SFC
  pulls PostCSS/source-map-js into that graph, but their source-map parsing is
  build tooling here. Registry production classification is not image runtime
  reachability: the nginx runtime copies only static `dist` assets.
- `radix-vue → nanoid` and `PostCSS → nanoid`: unsafe generator size paths were
  reported. No app import/call to `nanoid`, `customAlphabet` or `customRandom`
  was found in `src`; no attacker-controlled generator size path was found in
  the inspected app. This is a source review, not proof about every possible
  upstream consumer.
- Build/test tooling: Vite dev-server Windows path handling; Vitest/mocker
  redirect mocks; happy-dom's `ws`; vue-tsc's minimatch/brace-expansion. These
  tools do not run in the static nginx image. Development/build inputs and
  exposed tooling still matter, so all were patched rather than waived.

Relevant final lockfile versions: Vite **6.4.4**, Vitest/mocker **4.1.11**,
PostCSS **8.5.29**, nanoid **5.1.16 / 3.3.20**, source-map-js **1.2.2**,
brace-expansion **2.1.7**, ws **8.22.0**, Vue/server-renderer **3.5.42**.
All updates stay within existing major lines; npm also updated compatible Vue
compiler/shared and Babel/Vitest helper dependencies. No override or package
removal workaround is used. Audit results are a dated registry snapshot, not
future assurance. No deployment, container recreation, timer activation or
Git write was performed; deployment/PW7 acceptance remains separate.
