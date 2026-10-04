# Argus Web

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
The editor warns for `skill`, `kelemahan`, and `diagnos` in all four text fields;
these are editorial warnings, while Argus validates and audits each mutation.
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
