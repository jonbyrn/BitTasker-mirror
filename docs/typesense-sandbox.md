# Typesense on the BitTasker sandbox

Typesense is self-hosted. This repo cannot deploy it. A sandbox host has to run the compose file and the indexer.

## Host and ports

| What | Value |
| --- | --- |
| Image | `typesense/typesense:27.1` |
| HTTP | `8108` |
| Compose | `docker compose -f docker/docker-compose.typesense.yml up -d` |
| App host env | `TYPESENSE_HOST=http://127.0.0.1:8108` (inside compose the indexer uses `http://typesense:8108`) |
| Search route | The browser calls `/api/search`, `/api/search/counts`, and `/api/search/preview`. It does not talk to Typesense directly. |

## Environment variables

Set these on the server and the indexer. Do not commit real values.

| Name | Where | Purpose |
| --- | --- | --- |
| `TYPESENSE_API_KEY` | Indexer and server only | Admin key. Creates collections and writes documents. |
| `TYPESENSE_SEARCH_ONLY_KEY` | Server only | Optional. Scoped to `documents:search`. The server proxy uses it for reads when it is set. |
| `TYPESENSE_HOST` | Indexer and server | Typesense base URL. |
| `SEARCH_PROVIDER` | Server | `typesense` once the index has been backfilled. Until then browse stays on the relay. |
| `NOSTR_RELAY_URLS` | Indexer | Comma-separated relays. Default includes `wss://relay2.bittasker.com`. |
| `BITTASKER_TEST_PUBKEYS` | Indexer | Comma-separated pubkeys to leave out of the index. |
| `INDEXER_SECRET` | Server | Bearer token for `POST /api/search/index` and `/api/search/sync`. |
| `BTC_USD_RATE` | Indexer, optional | Converts BTC amounts when a listing is priced in bitcoin. |

`TYPESENSE_API_KEY` must not be placed in any `VITE_` variable. A search-only key may live in `TYPESENSE_SEARCH_ONLY_KEY` on the server. Prefer the `/api/search` proxy so the browser never holds a key.

Generate a search-only key once, from the indexer host:

```bash
TYPESENSE_CREATE_SEARCH_KEY=true node -e "import { ensureTypesense } from './src/lib/search/search-api.js'; await ensureTypesense(process.env)"
```

That prints `TYPESENSE_SEARCH_ONLY_KEY=...`. Store it as a server secret.

## Indexer

The indexer subscribes to kinds `31000` (tasks), `30402` (services), `31150` (shifts), and `5` (deletes). It only sends `REQ`. It does not publish Nostr events.

```bash
npm run search:index
```

Documents are upserted by replaceable address `kind:pubkey:d`, keeping the newest `created_at`. Kind 5 deletes remove that address. The indexer skips expired listings, probe listings (`t=bittasker-probe`, titles with `probe` or `TEST`, and `BITTASKER_TEST_PUBKEYS`), listings outside El Salvador, and listings without a numeric budget or price above zero.

## Benchmark

```bash
npm run search:benchmark
```

The script prints a p50. The in-memory check has to stay under 1s. When `TYPESENSE_HOST` and a key are set, it also samples Typesense.

## Rollback

Unset `SEARCH_PROVIDER` or set it back to `meilisearch`. Browse, search, and detail pages fall back to the relay when Typesense errors or does not answer within a second.
