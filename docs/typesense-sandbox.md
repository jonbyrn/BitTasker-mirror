# Typesense on the BitTasker sandbox

Typesense 27.1 and the relay indexer come up from `deploy-sandbox` in `.gitlab-ci.yml`. The job runs `scripts/deploy-typesense-sandbox.sh`, which is idempotent: a later deploy reuses the same keys and the same Docker volume.

This repository does not push the sandbox branch to GitLab. GitHub is the source of this pull request.

## How the sandbox branch reaches GitLab

`.github/workflows/sync-to-gitlab.yml` runs on pushes to `sandbox/rgb-wasm-phase0` and `cursor/**`. It pushes that branch to `gitlab.com/bittasker/BitTasker` with `GITLAB_TOKEN`. There is no `push-gitlab-master.yml`.

`deploy-sandbox` runs only when `CI_COMMIT_BRANCH == "sandbox/rgb-wasm-phase0"`. A feature branch is not synced and does not deploy. After this work is merged into `sandbox/rgb-wasm-phase0` on GitHub, the sync workflow pushes that branch to GitLab and GitLab runs `deploy-sandbox`.

The job deploys the Worker with Wrangler, then starts Typesense. It uses runner tag `self-hosted` and image `node:24-bookworm-slim`. The documented runner is a Docker executor, so the job container does not have a Docker daemon unless `/var/run/docker.sock` is mounted. There are no SSH variables in the job today.

## Host, ports, and keys

| What | Value |
| --- | --- |
| Image | `typesense/typesense:27.1` |
| Live container | `bittasker-typesense` (plain `docker`, no Compose plugin on this VPS) |
| Checkout | `/opt/bittasker/frontend` |
| Published port | `127.0.0.1:8108` on the Docker host |
| Indexer | `--network host`, so it calls `http://127.0.0.1:8108` |
| Env file | `/opt/bittasker/typesense.env`, directory mode `0700`, file mode `0600`, root-owned |
| Indexer image | `docker/indexer.Dockerfile` |

The first deploy generates `TYPESENSE_API_KEY` on the host and, after Typesense answers `/health`, creates a key scoped to `documents:search`. Both values are written only to the env file. Later deploys reuse them. Logs show a 12-character SHA-256 fingerprint and nothing else. Do not run `docker compose config` in CI; it would print the admin key.

The sandbox indexer reads `wss://relay.bittasker.com`, `wss://relay2.bittasker.com`, `wss://nos.lol`, and `wss://relay.primal.net`, and writes the `rgb_` collections. A `rgb_` prefix uses that list even when `NOSTR_RELAY_URLS` is an older file that omits relay2. A dev indexer (`TYPESENSE_COLLECTION_PREFIX=dev_`) reads `wss://relay1-dev.bittasker.com` and `wss://relay2-dev.bittasker.com` and writes the `dev_` collections. Both refuse `wss://relay1.bittasker.com`. They send `REQ` only. Each relay is paged on its own `until` until that relay's page is short. A page that times out before EOSE is retried once and is not treated as the end. There is no page cap. Kind 0 and kind 30000 are requested only for pubkeys that authored a task (kind 31000) or a service (kind 30402 or 30403). `nos.lol` and `relay.primal.net` are not scanned for kind 5. Shift rows are upserted when they are open. A shift that fails a filter is skipped, not deleted, and kind 5 does not remove `shifts`. The deploy runs one backfill (`INDEXER_ONCE=true`) and then leaves the indexer container subscribed to catalog kinds. `INDEXER_ONCE` exits when that walk finishes.

When a Docker host is configured, the job fails if Typesense `/health` or `/api/search/counts` does not respond. The counts check reads the env file on that host. It is not a GitLab variable.

When `/var/run/docker.sock` is missing and `TYPESENSE_SSH_HOST` is unset, the script prints a `WARNING` that lists what is missing and exits 0. Wrangler has already deployed. The Worker stays on its current search vars, and `MEILI_SEARCH_KEY` inheritance is unchanged.

## What the job still needs

If the job cannot see Docker and `TYPESENSE_SSH_HOST` is unset, the warning lists:

- `docker` CLI and a daemon visible to the job (`/var/run/docker.sock` on the `self-hosted` runner), or
- `TYPESENSE_SSH_HOST`
- `TYPESENSE_SSH_USER` (default `root`)
- `TYPESENSE_SSH_PRIVATE_KEY` (already provisioned; the job must not create it)
- `TYPESENSE_SSH_PORT` (optional, default `22`)
- `openssh-client` in the job image when the SSH host is set

The Docker host must allow root to create `/opt/bittasker`.

GitLab CI variables are not required for the Typesense keys. Do not add `TYPESENSE_API_KEY` or `TYPESENSE_SEARCH_ONLY_KEY` there.

`rgb.bittasker.com` is a Cloudflare Worker. It cannot read `/opt/bittasker/typesense.env`. `[env.sandbox.vars]` points search at `https://typesense-dev.bittasker.com` and the `rgb_` collections. `TYPESENSE_SEARCH_ONLY_KEY` is a Worker secret set with `npx wrangler secret put TYPESENSE_SEARCH_ONLY_KEY --env sandbox`. Do not commit the value and do not put it in GitLab CI. When that secret is missing, or Typesense returns an error, search uses Meilisearch if `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` are set, then the relay. Production is unchanged and stays on Meilisearch.

## Local check

```bash
npm run search:benchmark
```

The in-memory p50 has to stay under 1s. A live sample runs only when `TYPESENSE_HOST` and a key are already in the environment.

## Re-index people

Kind 0 profiles and kind 30000 skill lists are part of the indexer request (`INDEXER_KINDS` in `src/lib/search/index-plan.js`). `scripts/search-sync.mjs` requests kinds 0, 30000 only for task and service authors and writes them through `actionsFromEvent`. The Docker indexer (`scripts/typesense-indexer.mjs`) does the same and writes the `profiles` collection (`rgb_profiles` when the prefix is `rgb_`). Each page prints `relay=… kind=… page=… events=… applied=…` with an unbuffered write, so a non-TTY Docker log is not empty while the run is working.

Do not run this against the live server from a pull request. The VPS has no `docker compose`. Typesense is already the container `bittasker-typesense`. The git checkout is `/opt/bittasker/frontend`. One backfill fills the `rgb_` collections and exits. It does not start a second Typesense. `--network host` reaches the existing server at `http://127.0.0.1:8108`. `-e` after `--env-file` keeps the prefix `rgb_` even when the env file says something else.

```bash
cd /opt/bittasker/frontend
docker build -f docker/indexer.Dockerfile -t bittasker-typesense-indexer:sandbox .
docker run --rm --network host \
  --env-file /opt/bittasker/typesense.env \
  -e INDEXER_ONCE=true \
  -e TYPESENSE_COLLECTION_PREFIX=rgb_ \
  -e SEARCH_PROVIDER=typesense \
  -e TYPESENSE_HOST=http://127.0.0.1:8108 \
  bittasker-typesense-indexer:sandbox
```

The same one-shot from that checkout, when Node is on the host and can import the indexer (it has no npm dependencies of its own):

```bash
cd /opt/bittasker/frontend
INDEXER_ONCE=true TYPESENSE_COLLECTION_PREFIX=rgb_ SEARCH_PROVIDER=typesense TYPESENSE_HOST=http://127.0.0.1:8108 \
  node --env-file=/opt/bittasker/typesense.env scripts/typesense-indexer.mjs
```

It sends `REQ` only. Each relay is paged with its own `until` until that relay's page is short. There is no page cap. Profiles are limited to task and service authors. `rgb_` reads `relay.bittasker.com` and `relay2.bittasker.com` even if `NOSTR_RELAY_URLS` in the env file is older.

A running one-shot is safe to kill. It only sends `REQ` and upserts. Typesense is not locked, and documents already written stay. The process does not exit while it is still paging kind 0 on `nos.lol` or `relay.primal.net` with no author filter (that is the old image). A re-run needs this image rebuilt. The network profiles already stored in `rgb_profiles` stay until that collection is deleted. `ensureTypesense` creates it again on 404. Do not delete `rgb_shifts`.

```bash
curl -s -X DELETE \
  -H "X-TYPESENSE-API-KEY: $TYPESENSE_API_KEY" \
  http://127.0.0.1:8108/collections/rgb_profiles
```
