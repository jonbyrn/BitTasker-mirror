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
| Compose | `docker compose --env-file /opt/bittasker/typesense.env -f docker/docker-compose.typesense.yml -p bittasker-typesense up -d` |
| Published port | `127.0.0.1:8108` on the Docker host |
| Indexer | `network_mode: host`, so it calls `http://127.0.0.1:8108` |
| Env file | `/opt/bittasker/typesense.env`, directory mode `0700`, file mode `0600`, root-owned |
| Indexer image | `docker/indexer.Dockerfile` |

The first deploy generates `TYPESENSE_API_KEY` on the host and, after Typesense answers `/health`, creates a key scoped to `documents:search`. Both values are written only to the env file. Later deploys reuse them. Logs show a 12-character SHA-256 fingerprint and nothing else. Do not run `docker compose config` in CI; it would print the admin key.

The sandbox indexer reads `wss://relay.bittasker.com`, `wss://relay2.bittasker.com`, `wss://nos.lol`, and `wss://relay.primal.net`, and writes the `rgb_` collections. A `rgb_` prefix uses that list even when `NOSTR_RELAY_URLS` is an older file that omits relay2. A dev indexer (`TYPESENSE_COLLECTION_PREFIX=dev_`) reads `wss://relay1-dev.bittasker.com` and `wss://relay2-dev.bittasker.com` and writes the `dev_` collections. Both refuse `wss://relay1.bittasker.com`. They send `REQ` only. The backfill pages with `until` until a short page. The deploy runs one backfill (`INDEXER_ONCE=true`) and then leaves the indexer container subscribed.

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

Kind 0 profiles and kind 30000 skill lists are part of the indexer request (`INDEXER_KINDS` in `src/lib/search/index-plan.js`). `scripts/search-sync.mjs` already requests those kinds and writes them through `actionsFromEvent`. The Docker indexer (`scripts/typesense-indexer.mjs`) now keeps those events in `planIndexBatch` and writes the `profiles` collection (`rgb_profiles` when the prefix is `rgb_`).

Do not run this against the live server from a pull request. After the indexer image is rebuilt on the sandbox host, one backfill fills the `rgb_` collections (tasks and profiles). `INDEXER_ONCE` exits after the paged backfill. The prefix stays `rgb_`:

```bash
docker compose --env-file /opt/bittasker/typesense.env -f docker/docker-compose.typesense.yml -p bittasker-typesense build indexer
docker compose --env-file /opt/bittasker/typesense.env -f docker/docker-compose.typesense.yml -p bittasker-typesense run --rm --no-deps -e INDEXER_ONCE=true -e TYPESENSE_COLLECTION_PREFIX=rgb_ indexer
```

The same backfill on a machine that already has `TYPESENSE_HOST` and `TYPESENSE_API_KEY`:

```bash
INDEXER_ONCE=true TYPESENSE_COLLECTION_PREFIX=rgb_ npm run search:index
```

`npm run search:index` is `node scripts/typesense-indexer.mjs`. It sends `REQ` only. Each kind is paged with `until` until the relay page is short. There is no page cap.
