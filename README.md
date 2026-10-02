# Argus Web

Public Vue 3 admin dashboard for FutureGuide. This repository is `WIS-futureguide/argus-web` and uses the `master` branch. It provides user, assessment, monitoring, prompt, ledger, and admin-management screens aligned with the current Argus API. Admin and authentication requests share `https://api.futureguide.id`. Set the public build-time `VITE_API_BASE_URL` to override this origin; an empty value uses the default. The dashboard production target is `https://admin.futureguide.id` behind Cloudflare Access.

Run `npm ci` to install dependencies, `npm run build` to build the app, and `npm run test:run` to run its tests.

Local Docker hot reload: run `../atlas/scripts/dev.sh --web up`; see `../atlas/docs/operations.md` (Dev mode).
