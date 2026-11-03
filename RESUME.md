# Resume: mini's custom Immich webapp

Last verified: 2026-11-03. This is a handoff for a fresh coding-agent session.
Read this file first, then `deployment/MINI.md` for full build/deploy/upgrade commands.
Verify live state before making changes; this document records a point in time.

## Locations and current deployment

- Host: `mini` (macOS / Apple Silicon), user `mikl`; Docker runs through OrbStack.
- **Source checkout:** `/Users/mikl/Project/immich` (this repository).
- **Running Compose project:** `/Users/mikl/immich` (a different directory).
- Live URL: <https://immich.zekalogic.com> via Caddy and the tailnet.
- Direct LAN URL: <http://192.168.1.36:2283>.
- Custom image: `local/immich-server:v3.3.5-mini.2`.
- Web build identifier: `v3.3.5-mini.2`; upstream server/API version stays `3.3.5`.
- Container: `immich_server`, last checked healthy.
- Only the static webapp is modified. Backend code, database schema, and ML image
  are stock v3.3.5. No production Node/Vite dev server is needed.
- `~/immich/docker-compose.override.yml` pins the custom server image and sets
  `pull_policy: never`. The base Compose file and `.env` select the other services.
- No custom image has been published to a registry: rebuild locally if it is lost.

## Git: source of truth and history

- Fork: <https://github.com/amiklosi/immich>.
- `origin`: `https://github.com/amiklosi/immich.git`.
- `upstream`: `https://github.com/immich-app/immich.git`.
- Long-lived customization branch: **`mini`**.
- Keep `main` untouched upstream; do not deploy it accidentally.
- Old branch `mini/unstarred-search` was renamed/removed on GitHub.
- Upstream base tag: `v3.3.5`, commit `8303cb117e197c700332b33b61b45314c9cc5bb4`.
- **Deployed tag:** `v3.3.5-mini.2`, pointing to source commit
  `de134db503e0d7fec22f4bb4f2d56e9c9a7f9978`.
- Later branch commits update documentation/defaults, not the running image.
  Do not move the deployment tag to the latest docs commit.

Local patch commits, deliberately separated for future rebases:

1. `37610b6` — Unstarred search filter and component tests.
2. `5701b51` — Keyboard rate-and-advance and regression tests.
3. `de134db` — Custom image build and version naming.
4. `af20ff4` — Branch naming/defaults and deployment-tag policy.

The policy is `<upstream-version>-mini.<revision>` (e.g. `v3.3.5-mini.2`).
A new upstream base starts at `mini.1`. Preserve deployment tags across rebases.

## What the custom features do

### Unstarred search

Search's star-rating section has an **Unstarred** button beside 1–5 stars.
It sets `searchManager.filter.rating = null`; a second click clears the filter to
`undefined`, meaning all ratings. Existing filters are preserved. The API already
supports `rating: null`; the missing control was purely frontend work.

Files:
- `web/src/lib/components/shared-components/search-bar/SearchRatingsSection.svelte`
- `web/src/lib/components/shared-components/search-bar/SearchRatingsSection.spec.ts`
- `i18n/en.json` (`unstarred` label; other languages fall back to English)

### Keyboard rating advances to next image

In the asset viewer, pressing **1–5** assigns that rating and then uses the normal
Next navigation, only after the save succeeds. Selecting an already-assigned
rating advances without another API write. **0** clears the rating without moving.
Mouse clicks on stars in the details panel retain stock behavior.

Safeguards: failed saves do not advance; auto-repeat is ignored; concurrent rating
writes for the same asset are ignored; callbacks after closing/manual navigation
must not move the wrong image. At the final image, normal Next behavior applies,
not forced wrapping. The owner/ratings-preference shortcut checks remain stock.

Files:
- `web/src/lib/services/asset.service.ts` — rating shortcut, save result, in-flight guard
- `web/src/lib/services/asset.service.spec.ts` — save-before-advance, failures, retries,
  already-set rating, zero, repeated keys, concurrent requests, non-keyboard invocation
- `web/src/lib/components/asset-viewer/AssetViewerNavBar.svelte` — forwards `onRated`
- `web/src/lib/components/asset-viewer/AssetViewer.svelte` — guarded Next callback
- `i18n/en.json` — updated shortcut help text

User tested both features in the real webapp and confirmed they work.

## Build, deploy, validate

Exact commands: `deployment/MINI.md`. Build definition: `deployment/Dockerfile.mini`.

- Node 24, pnpm **11.27.1** (pinned in upstream `package.json`).
- Install with `--filter immich-web... --frozen-lockfile`; build `@immich/sdk` first.
- Targeted regression suite: **25 passing tests in 3 files**; TypeScript check passed.
- Build with `IMMICH_BUILD` matching the custom image identifier.
- The custom Dockerfile starts from the **digest-pinned stock server image** and
  replaces only `/build/www`. Docker build context MUST be `web/build`, not repo root.
- Pass `--build-arg MINI_SOURCE_COMMIT="$(git rev-parse HEAD)"` so image source links
  identify the exact corresponding source commit in the fork.
- Deploy from `~/immich`, recreating only `immich-server` for web-only changes:
  `docker compose up -d --no-deps --pull never immich-server`.
- Brief HTTP 502 responses during container restart are expected.
- Verify health, ping, and `/_app/version.json`; reload the browser for new assets.

Fresh-context checks (safe/read-only):

```sh
cd /Users/mikl/Project/immich
git status --short
git branch --show-current
git remote -v
git log -5 --oneline

docker inspect immich_server --format '{{.Config.Image}} {{.State.Health.Status}}'
curl -fsS https://immich.zekalogic.com/api/server/ping
curl -fsS https://immich.zekalogic.com/_app/version.json
```

## Future upstream upgrades

Do NOT just change `IMMICH_VERSION` and assume the custom server upgraded: the
Compose override pins its image separately.

1. Read upstream release notes and take/verify a fresh database backup.
2. Fetch upstream tags. Create a uniquely named backup branch before rebasing.
3. Rebase only our patch commits: `git rebase --onto NEW_TAG OLD_BASE mini`.
   `OLD_BASE` is currently `v3.3.5`, not fork `main` and not the custom deployment tag.
4. Resolve conflicts; run the tests, TypeScript check, and frontend build.
5. Update the Dockerfile's stock base tag AND digest, custom build identifier/image
   tag, and any version-dependent build commands. Do not reuse old web assets.
6. Account for upstream Compose changes and keep server/ML versions aligned.
7. Build locally, update the Compose override, deploy and verify.
8. Push the rebased branch with `--force-with-lease`; tag/push the exact deployed
   source commit. Never rewrite old deployment tags.

Same-upstream web-only rollback needs no DB restore. A later upstream upgrade may
run migrations; rolling that back can require restoring the matching DB backup.

## Operational cautions

- Keep photo storage and database volumes untouched. Do not run `docker compose down -v`.
- `/Volumes/media/Immich` is mounted at `/data` (read/write).
- `/Volumes/media/Photos` is mounted at `/external/photos` (read-only).
- Preserve Compose healthcheck timing overrides: 5-minute steady-state checks,
  fast startup checks. These work around a previously observed OrbStack VM issue.
- Preserve `pull_policy: never` for local custom images.
- Do not commit `.env`, credentials, DB dumps, original photos, or generated builds.
- Existing legacy images `v3.3.5-unstarred.1` and `v3.3.5-unstarred.2` may remain
  locally as rollback options; they predate the general `mini` naming convention.
- The mini-status dashboard is a separate repo at `/Users/mikl/Project/mini-status`.
  Do not accidentally put Immich changes there just because an agent starts there.
