# mini: Unstarred search and rate-and-advance shortcuts

For a fresh session, start with [RESUME.md](../RESUME.md) for deployment state,
patch locations, history, and operational cautions.

Fork: <https://github.com/amiklosi/immich>, custom branch `mini`.
Keep `main` as untouched upstream. Rebase `mini` onto each deployed upstream
release; preserve exact deployed revisions using tags such as `v3.3.5-mini.2`.
Do not move existing deployment tags after rebasing.
Based on Immich `v3.3.5` (upstream commit `8303cb117e197c700332b33b61b45314c9cc5bb4`).

Build/image identifier: **v3.3.5-mini.2**. The upstream server version remains
3.3.5 for API compatibility and update checks. The `mini` suffix identifies our
local frontend revision; a new upstream release starts again at `mini.1`.

Changes:
- Adds an **Unstarred** button beside the existing 1–5 star search filters.
- Sets `searchManager.filter.rating` to `null`; a second click clears it to
  `undefined` (all ratings). Selecting a star replaces the unrated filter.
- Preserves all other filters and exposes selected state through `aria-pressed`.
- Adds an English label; other locales use Immich's English fallback.
- In the asset viewer, keys **1–5** save a rating, then use normal Next navigation.
  Already-assigned ratings also advance without another write. Failed saves do not
  advance. Keyboard auto-repeat and concurrent saves for the same asset are ignored.
  **0** clears the rating without advancing; clicking stars in the details panel is
  unchanged. Saves finishing after manual navigation or closing do not advance.
  At the end of the list, normal Next behavior applies (no forced wraparound).

Only static frontend assets change. The custom image layers them over the exact
stock v3.3.5 image, pinned by digest. No backend or database changes are included.

## Build

Run from this repository with Node 24:

```sh
npx --yes pnpm@11.27.1 --filter immich-web... install --frozen-lockfile
npx --yes pnpm@11.27.1 --filter @immich/sdk build
npx --yes pnpm@11.27.1 --filter immich-web exec vitest run \
  src/lib/components/shared-components/search-bar/SearchRatingsSection.spec.ts \
  src/lib/managers/search-manager.svelte.spec.ts \
  src/lib/services/asset.service.spec.ts
IMMICH_BUILD=v3.3.5-mini.2 npx --yes pnpm@11.27.1 --filter immich-web build
docker build --pull=false -f deployment/Dockerfile.mini \
  --build-arg MINI_SOURCE_COMMIT="$(git rev-parse HEAD)" \
  -t local/immich-server:v3.3.5-mini.2 web/build
```

The Docker build context is **web/build**, not the repository root. This excludes
source dependencies, configuration, credentials, and original photo storage.

## Deploy

`~/immich/docker-compose.override.yml` sets only `immich-server` to
`local/immich-server:v3.3.5-mini.2` with `pull_policy: never`.
All existing healthcheck timing and other services remain unchanged.

```sh
cd ~/immich
docker compose config -q
docker compose up -d --no-deps --pull never immich-server
curl -f https://immich.zekalogic.com/api/server/ping
```

Reload the browser after deployment, open search filters, and use **Unstarred**.
The search URL will contain a JSON query with `"rating":null`.

## Rollback

To keep Unstarred but remove rate-and-advance, change the override image tag back to
`local/immich-server:v3.3.5-unstarred.1` and recreate only `immich-server`.

For a full rollback to upstream, remove only the `image: local/immich-server:...` and `pull_policy: never` lines
from the `immich-server` section of `~/immich/docker-compose.override.yml`, then:

```sh
cd ~/immich
docker compose up -d --no-deps immich-server
```

The base Compose file then selects the stock image via `IMMICH_VERSION` again.
No database restore is necessary: the server version never changed.

## Upgrades

This image is pinned to **v3.3.5**. Changing `.env`'s `IMMICH_VERSION` alone will
not upgrade this custom server. Before upgrading Immich, either roll back to stock
or reapply the small source patch to the new release and build/tag a new image.
Do not reuse this v3.3.5 frontend on a newer backend.

The source checkout is at `/Users/mikl/Project/immich`. Git remotes:
- `upstream`: `https://github.com/immich-app/immich.git`
- `origin`: `https://github.com/amiklosi/immich.git`

For a new release, set `NEXT` to its tag, then replay only our local commits:

```sh
NEXT=vX.Y.Z # replace with the desired release tag
git fetch upstream --tags
git branch backup/mini-before-upgrade
git rebase --onto "$NEXT" v3.3.5 mini
```

Use a new backup branch name each time. On later upgrades, replace `v3.3.5` with
our previous upstream base tag. Resolve conflicts, run tests, and update the
Dockerfile's upstream tag/digest and all build/image identifiers before building.
Read upstream release notes and back up the database before upgrading the running
server. Update `.env`'s `IMMICH_VERSION` and any upstream Compose changes so the
server and machine-learning versions remain aligned. Database migrations can make
rollback to an older upstream image require restoring the database.

After a rebase, publish the custom branch with `git push --force-with-lease origin mini`.
After a successful deployment, tag the exact source commit used to build it and
push that tag separately. Do not tag a later documentation-only commit instead.
No image is published to a registry; it is built locally on mini.
