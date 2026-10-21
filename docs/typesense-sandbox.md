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

The sandbox indexer reads `wss://relay2-dev.bittasker.com`, `wss://nos.lol`, and `wss://relay.primal.net`. It refuses `wss://relay1.bittasker.com` and `wss://relay2.bittasker.com`. It sends `REQ` only. The deploy runs one backfill (`INDEXER_ONCE=true`) and then leaves the indexer container subscribed.

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

`rgb.bittasker.com` is a Cloudflare Worker. It cannot read `/opt/bittasker/typesense.env`. `[env.sandbox.vars]` stays on Meilisearch until a public Typesense URL exists. Pointing the Worker at Typesense would copy the search-only key into a Worker secret. That is not a GitLab CI variable, and this change does not do it, because the keys stay in the host file. Browse keeps the relay fallback until that Worker secret is approved.

## Local check

```bash
npm run search:benchmark
```

The in-memory p50 has to stay under 1s. A live sample runs only when `TYPESENSE_HOST` and a key are already in the environment.
