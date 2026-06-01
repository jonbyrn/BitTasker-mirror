# Railway Disaster Recovery & Backup Pipeline

## Executive Summary

BitTasker's production infrastructure runs on Railway: one NestJS API and two Nostr relays (NestJS + Rust), all backed by PostgreSQL. Railway has no built-in cross-platform failover. When Railway is down, everything is down. This plan defines a phased approach to backup, disaster recovery, and failover.

**Bottom line**: Railway outages happen (~98.9% uptime in May 2026 = ~8h downtime/month). You're on the Hobby plan which has NO backup features — no PITR, no volume backups, no snapshots of any kind. The only backup mechanism available is external: automated `pg_dump` via GitLab CI to Cloudflare R2. This is fully implemented. Full automatic failover is significant engineering effort and may not be the right investment at this stage.

**Pipeline hardening (2026)**: Prefer full `postgresql://…` connection URIs for `pg_dump` (validated against libpq and Railway's public TCP proxy). Embed `sslmode=require` and optional keepalive/timeout query parameters for defense in depth — they help with flaky proxy connections but do not guarantee 100% success during proxy outages. See [Connection URLs, query parameters, and Railway](#connection-urls-query-parameters-and-railway).

---

## Key Concepts Explained

Before diving into the plan, here's what the terminology means in plain language:

### PITR (Point-in-Time Recovery)

PITR lets you restore a database to any specific moment in time — not just the last backup snapshot. Think of it as a "time machine" for your database.

**How it works**: PostgreSQL writes every change to a journal called the WAL (Write-Ahead Log). A PITR system keeps a complete archive of these WAL files plus periodic full snapshots (base backups). To restore to a specific time, you restore the most recent snapshot before your target time, then replay all the WAL journal entries up to your target moment.

**Example**: If a buggy deploy at 2:33 PM accidentally deletes critical Nostr events from the database, PITR lets you restore to exactly 2:32 PM — just before the bad deploy — losing only 1 minute of data instead of everything since the last nightly backup.

**On Railway Hobby**: PITR is NOT available. Railway's Hobby plan has no backup features at all — no PITR, no volume snapshots, no automated backups. The only way to back up your data is externally (pg_dump from outside Railway).

### RPO (Recovery Point Objective)

RPO answers: "How much data can you afford to lose?" It's measured in time — from the last good backup point to the moment of disaster.

| RPO       | What it means                      | Example                                  |
| --------- | ---------------------------------- | ---------------------------------------- |
| 5 minutes | You lose at most 5 minutes of data | Requires continuous WAL archiving (PITR) |
| 6 hours   | You lose up to 6 hours of data     | Twice-daily pg_dump                      |
| 24 hours  | You lose up to a day of data       | Daily pg_dump only                       |

**For BitTasker on Hobby**: Without PITR, your RPO equals the interval between pg_dump backups. Daily backups = 24-hour RPO. Every-6-hour backups = 6-hour RPO.

### RTO (Recovery Time Objective)

RTO answers: "How fast do you need to be back online?" It measures the time from "something broke" to "everything works again."

| RTO        | What it means         | Example                                              |
| ---------- | --------------------- | ---------------------------------------------------- |
| 15 minutes | Near-instant recovery | Warm standby already running, just flip DNS          |
| 1-2 hours  | Automated restore     | Download backup from R2, pg_restore, start services  |
| 4-8 hours  | Manual recovery       | Provision new server, install software, restore data |
| 24+ hours  | Rebuild from scratch  | No backup, reconstruct everything manually           |

### Volume Backups vs Logical Backups (pg_dump)

| Type                         | What it is                                                                           | Pros                                                                                                         | Cons                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Volume backup**            | Snapshot of the entire disk where database files live                                | Fast to create and restore; captures everything at once                                                      | Can't restore individual tables; tied to the same PostgreSQL version; stays within the same platform (Railway) |
| **Logical backup (pg_dump)** | SQL commands that recreate the database — tables, indexes, data as INSERT statements | Portable across PostgreSQL versions; can restore individual tables; can be stored anywhere (R2, your laptop) | Slower for large databases; no PITR (only restores to the dump moment); single-threaded                        |

**The strategy**: Since no backup features are available on the Hobby plan, the strategy is external `pg_dump` to Cloudflare R2 — portable, off-platform backups you can restore anywhere. This is the only backup mechanism, and it's sufficient.

### WAL (Write-Ahead Log)

PostgreSQL's internal journal. Before any change is written to the actual data files, it's first recorded in the WAL. This is what makes PITR possible — the WAL is a complete, sequential record of every database change.

- **Without WAL archiving**: Once a WAL segment is no longer needed for crash recovery, PostgreSQL recycles it. You can only restore to your last backup.
- **With WAL archiving**: WAL segments are copied to safe storage (S3, R2) before being recycled. You can replay them to restore to any point in time.

**On Railway Hobby**: WAL archiving is NOT configurable. Railway's managed PostgreSQL doesn't give you access to set `archive_mode = on` or `archive_command`. Combined with no volume backups, your only option is external logical dumps (pg_dump).

### Retention Policy / "Configure Retention"

Retention means: how many backups do you keep, and for how long before auto-deleting them?

**Common pattern — Grandfather-Father-Son**:
| Type | How often | Keep for | Example storage |
|------|-----------|----------|-----------------|
| Daily (son) | Every day | 7 days | `daily/api-2026-05-21.dump` |
| Weekly (father) | Every Sunday | 4 weeks (28 days) | `weekly/api-2026-05-17.dump` |
| Monthly (grandfather) | 1st of month | 3 months (90 days) | `monthly/api-2026-05-01.dump` |

**How to implement**: Cloudflare R2 lifecycle rules automatically delete objects older than a threshold:

```json
{
	"Rules": [
		{
			"ID": "Delete daily backups after 7 days",
			"Status": "Enabled",
			"Filter": { "Prefix": "daily/" },
			"Expiration": { "Days": 7 }
		},
		{
			"ID": "Delete weekly backups after 28 days",
			"Status": "Enabled",
			"Filter": { "Prefix": "weekly/" },
			"Expiration": { "Days": 28 }
		},
		{
			"ID": "Delete monthly backups after 90 days",
			"Status": "Enabled",
			"Filter": { "Prefix": "monthly/" },
			"Expiration": { "Days": 90 }
		}
	]
}
```

This means you set it once and R2 handles pruning automatically — no script needed.

### Cold Storage vs Hot Storage

| Type     | Access speed            | Cost     | Use case                                |
| -------- | ----------------------- | -------- | --------------------------------------- |
| **Hot**  | Milliseconds            | Higher   | Recent backups you might restore today  |
| **Cold** | Hours (retrieval delay) | Very low | Archive backups you keep "just in case" |

Cloudflare R2 is technically "hot" storage (instant access) but priced like cold storage ($0.015/GB/month, zero egress fees). For your scale, you don't need separate hot/cold tiers — R2 works for everything.

---

## Current Architecture

### Services on Railway (Production)

| Service                                  | Tech            | Database   | DNS                  | GitLab CI Branch    |
| ---------------------------------------- | --------------- | ---------- | -------------------- | ------------------- |
| bittasker-nestjs (API)                   | NestJS + Prisma | PostgreSQL | api.bittasker.com    | main → `railway up` |
| nostr-relay-nestjs (Tasks Relay)         | NestJS + Kysely | PostgreSQL | relay2.bittasker.com | main → `railway up` |
| bittasker-nostr-rs-relay (General Relay) | Rust + sqlx     | PostgreSQL | relay1.bittasker.com | main → `railway up` |

### Data at Risk (per service)

| Service           | Persistent Data                                                                            | Ephemeral Data                                                                                     | External Dependencies                                                       |
| ----------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **API**           | PostgreSQL: users, Nostr keys, devices, refresh tokens, notifications, email verifications | Redis: auth challenges (5min TTL), rate limits, translation cache (7d TTL), recovery OTPs (1h TTL) | Cloudflare R2 (files), Firebase (push), SparkPost (email), Google Translate |
| **Tasks Relay**   | PostgreSQL: Nostr events, generic_tags, NIP-05 identities                                  | In-memory: LazyCache (event cache 5min, filter cache 10s), tdigest metrics                         | MeiliSearch (optional, rebuildable from PG)                                 |
| **General Relay** | PostgreSQL: Nostr events, tags, NIP-05 verifications, pay-to-relay accounts/invoices       | In-memory: rate limiter state, NIP-05 caches, broadcast buffers                                    | None                                                                        |

### Each Service's PostgreSQL Schema

**API** (`bittasker-nestjs`, Prisma): User, UserLocation, NostrKey, NostrEvent, UserDevice, RefreshToken, EmailVerification, Notification, ScheduledNotification

**Tasks Relay** (`nostr-relay-nestjs`, Kysely): events (id, pubkey, author, created_at, kind, tags, generic_tags, content, sig, expired_at, d_tag_value, create_date), generic_tags, nip05

**General Relay** (`bittasker-nostr-rs-relay`, sqlx): event, tag, user_verification, account, invoice

---

## Threat Model

### Scenario 1: Railway Partial Outage (single service crash)

**Impact**: One service goes down. Railway auto-restarts up to 10 times. If the underlying PostgreSQL is healthy, data is safe. RTO: minutes (auto-restart). RPO: 0 (no data loss).

**What we need**: Nothing beyond what Railway already does.

### Scenario 2: Railway PostgreSQL Failure

**Impact**: Database corruption or failure. Can affect one or all three services.

**What we need**: External backups in R2 + documented recovery playbook. RTO: 30-60 min (download from R2, pg_restore, verify). RPO: Time since last pg_dump (daily = 24h RPO, reduce by scheduling more frequent backups).

### Scenario 3: Railway Platform Outage (region down)

**Impact**: Everything is unreachable. DNS points to dead services. Users can't access API or relays.

**What we need**: External standby + DNS failover. RTO: minutes to hours. RPO: depends on backup frequency.

### Scenario 4: Railway Returns After Outage

**Impact**: Railway services are back up but the external standby has been serving traffic and has newer data.

**What we need**: Failback process — sync data from external back to Railway, switch DNS back. This is the hardest scenario.

---

## Rethinking the Problem

### Nostr Relays: Decentralized by Design

The Nostr protocol is inherently decentralized. Clients connect to multiple relays simultaneously. When one relay goes down:

- Clients already have other relays they're connected to
- Events are signed by users — they can be re-broadcast to any relay
- The Nostr network does not depend on any single relay

This means: **for the two relays, automatic failover delivers less value than it first appears**. The main damage from a relay outage is:

1. Events _only_ stored on BitTasker's relays become temporarily unavailable
2. Users who _only_ connect to BitTasker's relays lose connectivity (unlikely for well-configured clients)

**Your current situation**: You're running your own relays and not yet broadcasting with other relays. This means your relay data IS the only copy. Backups protect against data loss, but the Nostr protocol naturally handles availability once you open up to other relays.

**Better approach for relay resilience**: Run additional relay instances on different infrastructure and encourage clients to use multiple relays. Backups protect against data loss; the Nostr protocol handles availability.

### The API: The Real Single Point of Failure

The NestJS API is a centralized service. When it's down:

- New user registration is blocked
- Push notifications are delayed
- File uploads fail (though R2 is independent of Railway)
- Saved search notifications are delayed
- Email verification links don't work

**This is where failover investment matters most.** However, the API's core auth uses Nostr keys — users who already have accounts can still sign events and interact via relays even when the API is down.

### Pragmatic Assessment

| Concern                  | Reality Check                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Railway uptime           | ~99% historically, ~8h downtime/month at worst                                                                                                       |
| Relay downtime impact    | Low — Nostr clients use multiple relays; your relays are currently the only ones but this is a client configuration issue, not an infrastructure one |
| API downtime impact      | Medium — core Nostr identity still works offline                                                                                                     |
| Data loss risk           | Low with external dumps to R2                                                                                                                        |
| Failback complexity      | High — bidirectional sync is the hardest problem in DR                                                                                               |
| Backend update frequency | Rare — you rarely push updates to backend or relay projects                                                                                          |
| Recovery approach        | Since updates are rare, deploying to a fresh server and restoring backups is practical — no need for always-on standby                               |

**Recommendation**: Invest in backup and a documented recovery playbook first. Since you rarely update backend services, the "deploy fresh + restore backup" approach is more practical than maintaining an always-on warm standby. Automatic failover is Phase 3+ and should only be built if downtime patterns justify it.

---

## Implementation Plan

### Phase 1: Document & Prepare (15 min, immediate)

Railway Hobby plan has **no backup features**. No PITR, no volume snapshots, no scheduled backups of any kind. This was confirmed against the actual Railway dashboard. The only backup mechanism available is external `pg_dump` (Phase 2).

This phase is about documenting what exists so you can recover if Railway goes down.

**Actions:**

1. **Document database connection details for all three PostgreSQL services**

   - Go to each PostgreSQL service in Railway dashboard → Connect tab
   - Copy the "Public Host" (looks like `interchange.proxy.rlwy.net:PORT`) for each
   - Copy the database name for each (usually `railway` by default)
   - Store these somewhere accessible (password manager)

2. **Document current Railway environment variables**

   ```bash
   railway variables list --service=bittasker-nestjs --environment=production
   railway variables list --service=nostr-relay-nestjs --environment=production
   railway variables list --service=bittasker-nostr-rs-relay --environment=production
   ```

   Store these securely. If Railway is completely down, you need these to deploy to a recovery server.

3. **Set low DNS TTL** on `api.bittasker.com`, `relay1.bittasker.com`, `relay2.bittasker.com`
   - In Cloudflare DNS dashboard, set TTL to 60-300 seconds
   - This enables fast DNS failover if you need to switch to a recovery server

**Verification:**

- [ ] Database hostnames and names documented for all 3 services
- [ ] Railway env vars documented and stored externally
- [ ] DNS TTL set to 60-300s on all 3 service domains

### Phase 2: Automated External Backups via GitLab CI (2-4 hours)

Railway Hobby has no backup features. You need backups _outside_ Railway. This phase sets up automated `pg_dump` → Cloudflare R2 via GitLab CI scheduled pipelines.

**Why Cloudflare R2 instead of Backblaze B2:**

| Factor                            | Cloudflare R2                                   | Backblaze B2                         |
| --------------------------------- | ----------------------------------------------- | ------------------------------------ |
| Storage cost                      | $0.015/GB/month                                 | $0.006/GB/month                      |
| Egress (download)                 | **Free, unlimited**                             | Free up to 3x storage volume         |
| Your ecosystem                    | Already using Cloudflare (DNS, Workers, Stream) | New vendor, new account, new bill    |
| Operational overhead              | Enable in existing dashboard, same billing      | Separate account, separate dashboard |
| For your scale (~5 GB of backups) | $0.075/month (likely within free 10 GB tier)    | $0.03/month                          |

At your backup volume, both are effectively free. R2 wins because you already use Cloudflare — zero new accounts, zero new vendors, single dashboard, single bill.

Backblaze B2 is a popular backup storage service (like AWS S3 but cheaper). It's what people commonly recommend because of low storage costs ($6/TB/month vs R2's $15/TB/month). For large-scale backups (1+ TB), B2's storage savings matter. For your scale, the difference is pennies, and R2's ecosystem integration matters more.

**Architecture:**

```
GitLab CI Scheduled Pipeline (cron)
    │
    ├── pg_dump API PostgreSQL ──────┐
    ├── pg_dump Tasks Relay PG ──────┤─── Upload to Cloudflare R2
    └── pg_dump General Relay PG ────┘    (daily/ weekly/ monthly/ prefixes)
                                              │
                                              ▼
                                    R2 Lifecycle Rules auto-prune
                                    old backups (7d / 28d / 90d)
```

**Setup steps:**

#### Step 1: Create an R2 bucket

In Cloudflare Dashboard → R2 → Create bucket:

- Name: `bittasker-backups`
- Region: Automatic

#### Step 2: Create R2 API token

In Cloudflare Dashboard → R2 → Manage R2 API Tokens → Create API Token:

- Permissions: "Object Read & Write"
- Scope: `bittasker-backups` bucket only
- Save the Access Key ID and Secret Access Key

#### Step 3: Create a read-only PostgreSQL user for backups

On each database, create a dedicated backup user (avoids using the full-access app credentials for backup jobs):

```sql
CREATE USER backup_user WITH PASSWORD 'strong_generated_password';
GRANT CONNECT ON DATABASE bittasker TO backup_user;
\c bittasker
GRANT USAGE ON SCHEMA public TO backup_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO backup_user;
```

Repeat for each of the three databases.

#### Step 4: Add GitLab CI variables

In GitLab → Settings → CI/CD → Variables, add these **masked** variables:

| Variable                   | Value                                               | Type                   |
| -------------------------- | --------------------------------------------------- | ---------------------- |
| `CLOUDFLARE_ACCOUNT_ID`    | Your Cloudflare Account ID (found in dashboard URL) | Variable               |
| `R2_ACCESS_KEY_ID`         | R2 API token access key                             | Variable               |
| `R2_SECRET_ACCESS_KEY`     | R2 API token secret                                 | **Masked**             |
| `R2_BUCKET`                | `bittasker-backups`                                 | Variable               |
| `DATABASE_URL_API`         | Full public PostgreSQL URI for API DB (see below)   | **Masked** (protected) |
| `DATABASE_URL_RELAY_TASKS` | Full public PostgreSQL URI for Tasks Relay DB       | **Masked** (protected) |
| `DATABASE_URL_RELAY_GENERAL` | Full public PostgreSQL URI for General Relay DB   | **Masked** (protected) |

Remove any old `PG_HOST_*`, `PGUSER_BACKUP`, and `PGPASSWORD_BACKUP` variables after migrating — the script no longer reads them.

`R2_ENDPOINT` is derived in the script from `CLOUDFLARE_ACCOUNT_ID` — do not set it as a separate variable unless you have a custom endpoint.

#### Step 5: GitLab CI backup job (implemented)

The backup job is a single unified job in `.gitlab-ci.yml` that runs `scripts/backup-databases.sh`. The `RETENTION_TYPE` variable (set in each pipeline schedule) controls which R2 prefix is used.

**Job** (`db-backup`, stage: `backup`):

- Runs only on `schedules` (never on branch push or MR)
- `timeout: 1 hour` (three databases × retries; raise if dumps grow)
- Uses `postgres:16-alpine` image (pg_dump included)
- Installs `awscli` via pip for R2 upload
- Calls `bash scripts/backup-databases.sh`

The script (`scripts/backup-databases.sh`) loops through all three databases (API, relay_tasks, relay_general), runs `pg_dump --verbose` with full `DATABASE_URL_*` connection strings (`--format=custom --compress=9`), retries failed dumps with exponential backoff, and uploads to `s3://bittasker-backups/${RETENTION_TYPE}/${LABEL}/`.

**Why one job instead of three**: GitLab schedules each set `RETENTION_TYPE` as a schedule variable. The same job runs with `daily`, `weekly`, or `monthly` based on which schedule triggered it. This avoids duplicating the job definition.

**Pipeline hardening (implemented)**:

| Change | Why |
| ------ | --- |
| `timeout: 1 hour` on `db-backup` | Backups can run several minutes per DB; retries add wall time |
| `pg_dump --verbose` | GitLab can kill jobs with no log output for ~60 minutes; verbose mode streams progress |
| Full connection URI via `-d "$DATABASE_URL_*"` | Railway public proxy port + SSL + keepalives in one string |
| `schedule-skip` on `build` and `build-production` | Scheduled pipelines run backup only, not frontend builds |

**Design constraint**: Backups stay **outside** Railway (GitLab CI → TCP proxy → `pg_dump` → R2). Do not move dumps onto Railway cron/services — the goal is recoverability when Railway is down, not dependence on Railway during an outage.

---

### Connection URLs, query parameters, and Railway

This section validates the proposed full-URL approach and each libpq query parameter for **external** backups over Railway's public TCP proxy (`*.proxy.rlwy.net`).

#### Why use a full connection URI instead of `--host` / `--port` flags?

`pg_dump` accepts a [connection string as `dbname`](https://www.postgresql.org/docs/current/app-pgdump.html) (positional argument or `-d`). Internally, libpq parses URIs and discrete flags the same way, but **several resilience parameters have no `pg_dump` CLI flag** — they are only available as libpq connection parameters (URI query string or keyword/value string).

| Parameter | `pg_dump` flag? | URI query param? | Env var? |
| --------- | --------------- | ---------------- | -------- |
| host, port, user, dbname | Yes (`-h`, `-p`, `-U`, database name) | Yes | `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` |
| `sslmode` | No | Yes | `PGSSLMODE` |
| `connect_timeout` | No | Yes | `PGCONNECT_TIMEOUT` |
| `keepalives`, `keepalives_idle`, `keepalives_interval`, `keepalives_count` | No | Yes | **No** (URL or keyword string only) |
| `tcp_user_timeout` | No | Yes | `PGTCPUSER_TIMEOUT` (PostgreSQL 12+) |

Source: [libpq connection parameters](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-PARAMKEYWORDS).

**Script invocation** (what `backup-databases.sh` runs):

```bash
pg_dump --verbose \
  -d "$DATABASE_URL_API" \
  --format=custom --compress=9 --no-owner --no-acl \
  --file="${TEMP_FILE}"
```

Use **single quotes** in the shell if typing a URI literally; in CI, pass the URL via a masked variable (no shell interpolation of special characters).

**Passwords with special characters**: Percent-encode `@`, `#`, `&`, `=`, spaces, etc. in the password segment, or omit the password from the URI and set `PGPASSWORD` separately. See [libpq URI encoding](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING-URIS).

#### Example URI for Railway (public TCP proxy)

Build from Railway → PostgreSQL service → **Connect** → **Public Network** (copy host, port, database, user). Use the backup user created in Step 3, not the application superuser.

```text
postgresql://backup_user:PASSWORD@ballast.proxy.rlwy.net:46255/bittasker?sslmode=require&connect_timeout=60&keepalives=1&keepalives_idle=30&keepalives_interval=10&keepalives_count=5&tcp_user_timeout=30000
```

Railway's own template sets `DATABASE_PUBLIC_URL` to the same `postgresql://…@${RAILWAY_TCP_PROXY_DOMAIN}:${RAILWAY_TCP_PROXY_PORT}/…` shape ([railwayapp-templates/postgres](https://github.com/railwayapp-templates/postgres)).

#### Per-parameter validation (libpq + Railway)

| Parameter | Value (example) | Valid for libpq? | Railway / proxy notes | Confidence |
| --------- | ----------------- | ---------------- | --------------------- | ---------- |
| `sslmode=require` | `require` | Yes | **Required pattern for external TCP proxy.** Railway uses **self-signed** TLS on the proxy; `verify-full` / `verify-ca` fail with "self-signed certificate in certificate chain". Railway staff confirm CA-signed certs are not available on TCP proxy ([Station thread](https://station.railway.com/questions/verify-full-ssl-mode-on-postgres-databse-4d035b2c)). Use `require` (encrypt, do not verify CA). | **High** |
| `sslmode=disable` | `disable` | Yes | **Avoid** for public proxy — community reports of immediate disconnects / "server closed the connection unexpectedly" when SSL is disabled externally. | **High** (avoid) |
| `connect_timeout` | `60` (seconds) | Yes | Limits time spent establishing TCP + SSL per connection attempt. Minimum effective value is 2 seconds if set to `1`. Helps fail fast during proxy black-holes instead of hanging indefinitely. | **High** |
| `keepalives` | `1` | Yes | Enables client-side TCP keepalive (`SO_KEEPALIVE`). libpq default is already `1`; explicit `1` is documentation-only unless something disabled keepalives. | **High** |
| `keepalives_idle` | `30` | Yes | Seconds before first keepalive probe. May help proxies/NAT that drop **idle** TCP sessions during long `pg_dump` runs. Not a fix for active-transfer stalls. | **Medium** |
| `keepalives_interval` | `10` | Yes | Seconds between probes. Same as above. | **Medium** |
| `keepalives_count` | `5` | Yes | Failed probes before client treats connection as dead. Same as above. | **Medium** |
| `tcp_user_timeout` | `30000` (ms) | Yes (Linux) | Caps time unacknowledged **sent** data blocks before TCP gives up. Useful for detecting half-open connections during large streams. **Ignored on Windows**; GitLab `postgres:16-alpine` on Linux supports it. Can interact with keepalive behavior — tune as a set, not in isolation ([Instacart engineering post](https://tech.instacart.com/the-vanishing-thread-and-postgresql-tcp-connection-parameters-93afc0e1208c)). | **Medium** |

**PostgreSQL 17+ client note**: Some external clients default to "direct SSL" and hit `received direct SSL connection request without ALPN`. The backup image is **PostgreSQL 16**, so this is unlikely today. If you upgrade the CI image to 17+, and connections fail with ALPN errors, add `sslnegotiation=postgres` to the URI or set `PGSSLNEGOTIATION=postgres` ([Railway Station](https://station.railway.com/questions/postgres-ssl-connection-issue-from-exter-9cc94f3f)).

#### What these parameters cannot fix

Railway's public TCP proxy is a **known weak link** for long-running `pg_dump` / `pg_restore` sessions:

- Intermittent `ECONNRESET`, "server closed the connection unexpectedly", and multi-minute connect timeouts after proxy restarts ([proxy timeout thread](https://station.railway.com/questions/railway-proxy-timeout-ceeceadb))
- Railway staff: edge proxies **will restart**; private networking is recommended **between services in the same project** — not available to external GitLab runners
- No libpq tuning guarantees success during a full proxy outage ("black hole" period)

**Implication for BitTasker**: URL parameters are **defense in depth** — they improve odds on flaky connections but do not replace retries or accepting occasional schedule failures. Optional bash retry with exponential backoff in `backup-databases.sh` is still worthwhile.

**Explicitly rejected for this project**: Running `pg_dump` **inside** Railway (cron job / one-off service) as the primary backup path — that defeats the goal of backups independent of Railway uptime. Railway-internal dumps remain a possible **supplement**, not the disaster-recovery source of truth.

#### GitLab CI timeouts and log output

| Mechanism | Behavior |
| --------- | -------- |
| Job `timeout:` in `.gitlab-ci.yml` | Hard limit for the job; on exceed, runner sends SIGTERM, then SIGKILL after grace period |
| Runner `maximum_timeout` | Caps project/job timeout (lowest wins) |
| "No output" / stuck job | Long silent phases can cause jobs to be treated as stuck; use `pg_dump --verbose` so logs keep updating during large table dumps |
| Project `default: timeout:` | Known GitLab bug ([#387528](https://gitlab.com/gitlab-org/gitlab/-/issues/387528)) — set `timeout:` on **`db-backup` directly**, not only under `default:` |

**Configured in `.gitlab-ci.yml`**:

```yaml
db-backup:
  image: postgres:16-alpine
  stage: backup
  timeout: 1 hour
```

If dumps outgrow one hour, raise `timeout` and confirm the self-hosted runner's `maximum_timeout` allows it.

#### Step 6: Create GitLab CI schedules

In GitLab → Build → Pipeline schedules → New schedule:

| Schedule       | Cron                                | Target branch | Variables (required)        |
| -------------- | ----------------------------------- | ------------- | --------------------------- |
| Daily backup   | `0 3 * * *` (3 AM UTC daily)        | `dev` or `master` | `RETENTION_TYPE` = `daily` |
| Weekly backup  | `0 3 * * 0` (3 AM UTC Sundays)      | `dev` or `master` | `RETENTION_TYPE` = `weekly` |
| Monthly backup | `0 3 1 * *` (3 AM UTC 1st of month) | `dev` or `master` | `RETENTION_TYPE` = `monthly` |

Use a branch that has **protected** CI variables available to the runner. If variables are protected, the schedule target branch must be protected too.

**Stagger the times**: Using `3` instead of `0` avoids the "everyone schedules at midnight" problem that creates load spikes.

#### Step 7: Configure R2 lifecycle rules for automatic retention (implemented)

The lifecycle rules are in `config/r2-lifecycle.json`. Apply them once:

```bash
# Using wrangler (you already have this for Cloudflare Workers)
npx wrangler r2 bucket lifecycle set bittasker-backups --file config/r2-lifecycle.json

# Verify
npx wrangler r2 bucket lifecycle list bittasker-backups
```

#### Step 8: Set up failure notifications

GitLab automatically notifies you of pipeline failures if you configure it:

1. In GitLab → Settings → Integrations → Pipeline status emails: enable and add your email
2. Or use GitLab's Slack integration for real-time alerts

**Automated (implemented):**

- [x] Backup script: `scripts/backup-databases.sh`
- [x] Restore helper: `scripts/restore-from-r2.sh`
- [x] R2 lifecycle config: `config/r2-lifecycle.json`
- [x] GitLab CI job: `db-backup` in `.gitlab-ci.yml` (stage: `backup`, runs on schedules)

**Manual (see checklist above):**

- [ ] R2 bucket created + API token
- [ ] PostgreSQL hostnames documented from Railway dashboard (Phase 1)
- [ ] Read-only PostgreSQL backup user created on each database
- [ ] GitLab CI variables added
- [ ] Three pipeline schedules created (daily, weekly, monthly)
- [ ] R2 lifecycle rules applied with wrangler
- [ ] Failure notifications configured
- [ ] Manual backup test: trigger pipeline, verify dumps in R2
- [ ] Restore test: download a dump, restore to local PostgreSQL, verify

### Phase 3: External Warm Standby (4-8 hours, optional)

A "warm standby" is a VM with PostgreSQL that receives regular dumps from Railway. It doesn't serve traffic normally. When Railway goes down, you promote it.

Since you rarely update backend/relay projects, a simpler approach works: **keep the deploy config ready, but don't run the services 24/7**. Instead, document the recovery playbook so you can deploy fresh when needed.

**Architecture:**

```
Railway (production)
    │
    │  pg_dump every 6-24h to R2
    ▼
Cloudflare R2 (backup storage)
    │
    │  On recovery: download latest dump
    ▼
Standby VM (Hetzner / DigitalOcean / Fly.io)
    ├── PostgreSQL (fresh restore)
    ├── bittasker-nestjs (deploy on demand)
    ├── nostr-relay-nestjs (deploy on demand)
    └── bittasker-nostr-rs-relay (deploy on demand)
```

Because you rarely push updates to backend services, the deploy-and-restore approach is simpler than maintaining always-running standbys: when Railway goes down, you deploy the services to a different host, restore the latest R2 backup, and switch DNS. Total RTO: however long it takes to deploy + restore (likely 30-60 minutes).

**VM sizing**: 4 vCPU, 8 GB RAM, 80 GB SSD (~$24/month at Hetzner, ~$48/month at DigitalOcean). Enough to run all three services in degraded mode during an outage.

**Actions:**

- [ ] Provision external VM (or document how to provision one quickly)
- [ ] Write restore-from-R2 script
- [ ] Write deploy-services script (using railway CLI or docker-compose)
- [ ] Document DNS failover procedure
- [ ] Test full recovery on the standby VM once

### Phase 4: Continuous Replication (Future, significant effort)

For near-zero RPO, implement logical replication from Railway PostgreSQL to external standby.

**Challenge**: Railway's managed PostgreSQL on Hobby plan does not expose `wal_level=logical`. Without this, logical replication is not possible. Options:

- Upgrade to Railway Pro or Enterprise to request `wal_level=logical`
- Use trigger-based CDC (Debezium) — heavy for this scale
- Application-level double-write — complex and error-prone
- Accept the RPO gap from periodic dumps (Phase 2)

**Recommendation**: Skip this phase. For ~8h/month of Railway downtime and services you rarely update, periodic dumps to R2 with a documented recovery playbook is the right tradeoff.

---

## Recovery Playbook (When Railway Is Down)

### Detection

Railway outage signs:

- `railway status` returns errors or hangs
- Services return 502/503 or timeout
- `status.railway.com` shows active incident

### Decision Matrix

| Downtime Expected             | Action                                                                     |
| ----------------------------- | -------------------------------------------------------------------------- |
| < 1 hour                      | Wait. Railway auto-recovers most issues.                                   |
| 1-4 hours                     | Prepare recovery. Don't execute yet unless critical functions are blocked. |
| > 4 hours                     | Execute recovery — deploy to standby and restore from R2.                  |
| Any duration, data corruption | Recover immediately.                                                       |

### Step-by-Step Recovery

1. **Confirm the outage is Railway-specific**

   ```bash
   curl -s https://status.railway.com/api/v2/summary.json | jq .
   railway connect --service=bittasker-nestjs --environment=production
   ```

2. **Provision or wake standby server**
   If you have a persistent standby VM:

   ```bash
   ssh standby-host
   ```

   If not, provision a new one (Hetzner/DigitalOcean/Fly.io). Keep deployment configs (Dockerfiles, docker-compose.yml, env vars) in the respective service repositories so this step can use them.

3. **Download and restore latest backups from R2**

   ```bash
   # For each database
   LATEST_DUMP=$(aws s3 ls "s3://${R2_BUCKET}/daily/api/" \
     --endpoint-url "${R2_ENDPOINT}" \
     | sort | tail -1 | awk '{print $4}')

   aws s3 cp "s3://${R2_BUCKET}/daily/api/${LATEST_DUMP}" /tmp/ \
     --endpoint-url "${R2_ENDPOINT}"

   pg_restore -c -d bittasker_api /tmp/${LATEST_DUMP}
   # Repeat for relay_tasks, relay_general
   ```

4. **Deploy services to standby**

   ```bash
   # Deploy from respective repos (or use pre-built Docker images)
   cd /opt/bittasker-nestjs && docker compose up -d
   cd /opt/nostr-relay-nestjs && docker compose up -d
   cd /opt/bittasker-nostr-rs-relay && docker compose up -d
   ```

5. **Verify services are healthy**

   ```bash
   curl -s https://standby-api.bittasker.com/api/v1/health-check
   curl -s -H "Accept: application/nostr+json" https://standby-relay1.bittasker.com/
   curl -s -H "Accept: application/nostr+json" https://standby-relay2.bittasker.com/
   ```

6. **Switch DNS**
   Update DNS records in Cloudflare to point to standby IPs. With low TTL (60-300s), propagation is fast.

7. **Monitor**
   Watch Sentry for error spikes. Monitor standby resource usage. Post status update to users.

### Caveats

- **Redis is NOT replicated**: Auth challenges, rate limits, recovery OTPs, and translation cache are lost. Users mid-login will need to restart. Rate limits reset. Recovery OTPs become invalid (users can request new ones).
- **Cloudflare R2 is unaffected**: File uploads/downloads continue working (R2 is independent of Railway).
- **Firebase/SparkPost are unaffected**: Push notifications and emails continue from the standby API (same credentials).
- **Data written to standby during recovery MUST be synced back to Railway when it comes back.**

---

## Data That Does NOT Need Backup

| Data                                                                   | Reason                                                                                         |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Redis (auth challenges, rate limits, translation cache, recovery OTPs) | Ephemeral by design. Max TTL 7 days (translation cache), rest < 1 hour. Not worth replicating. |
| MeiliSearch index (tasks relay)                                        | Rebuildable from PostgreSQL. Just re-index after restore.                                      |
| In-memory caches (LazyCache, rate limiters, broadcast buffers)         | Process-local, rebuilt on startup.                                                             |
| Container filesystems                                                  | Stateless. Rebuilt from Docker images.                                                         |
| Logs (stdout)                                                          | Not persisted. Sentry captures errors separately.                                              |
| Nostr relay events (from other people's relays)                        | Not your data. Other relays have it. The network fills gaps naturally.                         |

---

## Monitoring & Alerting

### What to Monitor

| What                    | Tool                          | Alert Threshold                                           |
| ----------------------- | ----------------------------- | --------------------------------------------------------- |
| Railway service health  | Uptime Kuma                   | 2 consecutive failures, 60s interval                      |
| PostgreSQL connectivity | Custom health endpoint        | Connection refused for > 5 min                            |
| Backup job success      | GitLab pipeline notifications | Any failure (you already get emails for failed pipelines) |
| Backup freshness        | Manual check or GitLab CI job | Latest dump > 24 hours old                                |
| Railway status page     | status.railway.com RSS/API    | Any incident at "High" severity                           |

### External Monitoring

Railway health checks only run at deploy time, not continuously. Set up:

- **Uptime Kuma** (free, self-hosted): Monitor `api.bittasker.com/api/v1/health-check`, `relay1.bittasker.com/`, `relay2.bittasker.com/`
- **Better Uptime** (freemium): More polished, includes status pages

---

## Cost Estimate

| Item                                           | Monthly Cost                               |
| ---------------------------------------------- | ------------------------------------------ |
| Cloudflare R2 (external dumps, ~5 GB retained) | $0.00 (within free 10 GB tier)             |
| GitLab CI pipeline (backup jobs)               | $0.00 (self-hosted runner)                 |
| External VM for recovery (Hetzner CX42)        | ~$24 (only if running a warm standby 24/7) |
| **Total (Phase 1-2)**                          | **$0.00/month**                            |
| **Total (Phase 1-3, with warm standby)**       | **~$24/month**                             |

The backup pipeline itself costs nothing — R2 free tier covers storage, and the self-hosted GitLab runner handles the CI jobs.

---

## Phase Prioritization

```
                    Effort    Impact    Priority
Phase 1 (Document)  15 min    MEDIUM    ██████████ DO NOW
Phase 2 (R2 Dumps)  2-4 hrs   HIGH      ██████████ THIS WEEK
Phase 3 (Standby)   4-8 hrs   MEDIUM    ██████     AS NEEDED
Phase 4 (Repl)      Days      LOW       ██         FUTURE (UNLIKELY NEEDED)
```

---

## Appendix: Quick-Start Commands

### Manual pg_dump via Railway CLI

```bash
railway connect --service=bittasker-nestjs --environment=production -- \
  pg_dump -Fc -v -f bittasker-api-$(date +%Y%m%d).dump
```

### Test restore to local PostgreSQL

```bash
createdb bittasker_restore_test
pg_restore -d bittasker_restore_test bittasker-api-20260521.dump
# Verify tables:
psql -d bittasker_restore_test -c "\dt"
```

### Create R2 bucket via wrangler

```bash
npx wrangler r2 bucket create bittasker-backups
```

### Set R2 lifecycle rules

```bash
npx wrangler r2 bucket lifecycle set bittasker-backups --file r2-lifecycle.json
npx wrangler r2 bucket lifecycle list bittasker-backups
```

### Upload a backup to R2 manually

```bash
aws s3 cp backup.dump "s3://bittasker-backups/daily/api/backup.dump" \
  --endpoint-url "https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
```

### Download latest backup from R2

```bash
LATEST=$(aws s3 ls "s3://bittasker-backups/daily/api/" \
  --endpoint-url "https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  | sort | tail -1 | awk '{print $4}')
aws s3 cp "s3://bittasker-backups/daily/api/${LATEST}" . \
  --endpoint-url "https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
```

---

## Implemented Files

These files have been created or modified in the BitTasker repository as part of Phase 2 and pipeline hardening:

| File                          | Purpose                                                                                                                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/backup-databases.sh` | `DATABASE_URL_*` full URIs, `pg_dump --verbose`, retries, `PGOPTIONS` statement_timeout=0, R2 upload with one retry |
| `scripts/restore-from-r2.sh`  | Recovery helper — finds and downloads the latest backup for a given database, optionally restores it. Usage: `bash scripts/restore-from-r2.sh api [target_db_url]`                                                                                                    |
| `config/r2-lifecycle.json`    | R2 lifecycle rules — auto-prunes daily (7d), weekly (28d), monthly (90d). Apply: `npx wrangler r2 bucket lifecycle set bittasker-backups --file config/r2-lifecycle.json`                                                                                             |
| `.gitlab-ci.yml`              | `db-backup` (schedules only, `timeout: 1 hour`). `build` and `build-production` skip scheduled pipelines. Deploy jobs pass through Cloudflare variables for self-hosted runners. |

### Related frontend / deploy pipeline (not backup)

- **Cloudflare Pages** Git integration stays active alongside Workers until the Workers migration is complete — do not disable Pages-only deploys prematurely.
- **Scheduled pipelines** run `db-backup` only; `build`, `build-production`, and deploy jobs skip schedules.

---

## Manual Setup Checklist (User TODO)

These steps require manual actions in external dashboards. Complete them in order.

### Cloudflare Dashboard

- [ ] **Create R2 bucket** `bittasker-backups`
  - Cloudflare Dashboard → R2 → Create bucket
- [ ] **Create R2 API token**
  - R2 → Manage R2 API Tokens → Create API Token
  - Permissions: "Object Read & Write", scope to `bittasker-backups` bucket
  - Save the **Access Key ID** and **Secret Access Key** (you'll paste them into GitLab)
  - Note your **Account ID** (found in dashboard URL: `dash.cloudflare.com/<account-id>`)

### Railway Dashboard

- [ ] **Build full public connection URIs** for each database (Phase 1)
  - Each PostgreSQL service → Connect → **Public Network** → copy host, port, database name
  - Construct three `postgresql://backup_user:PASSWORD@HOST:PORT/DBNAME?sslmode=require&…` URIs (see [Example URI](#example-uri-for-railway-public-tcp-proxy))
- [ ] **Create read-only backup user** on each database
  - Connect to each database (via Railway CLI or psql) and run:
    ```sql
    CREATE USER backup_user WITH PASSWORD 'generate_a_strong_password_here';
    GRANT CONNECT ON DATABASE <dbname> TO backup_user;
    GRANT USAGE ON SCHEMA public TO backup_user;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO backup_user;
    ```
  - Use the **same password** for all three (simplifies CI variable setup)
  - Verify role exists: `SELECT rolname FROM pg_roles;`
  - Database names: The API DB is `railway` (default Railway name) or check in `.env` for the exact name. The relay DBs may also use `railway` or custom names — verify in their respective Railway dashboard.

### GitLab CI

- [ ] **Add CI/CD variables** (Settings → CI/CD → Variables)

  | Variable | Value | Protected | Masked |
  |----------|-------|-----------|--------|
  | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID (dashboard URL) | Yes | No |
  | `R2_ACCESS_KEY_ID` | R2 API token access key | Yes | No |
  | `R2_SECRET_ACCESS_KEY` | R2 API token secret | Yes | **Yes** |
  | `R2_BUCKET` | `bittasker-backups` | Yes | No |
  | `DATABASE_URL_API` | Full URI for API DB (see **Example URI for Railway** under Connection URLs) | Yes | **Yes** |
  | `DATABASE_URL_RELAY_TASKS` | Full URI for Tasks Relay DB | Yes | **Yes** |
  | `DATABASE_URL_RELAY_GENERAL` | Full URI for General Relay DB | Yes | **Yes** |

  Deploy-related variables (`CLOUDFLARE_API_TOKEN`, etc.) are documented in [zapstore-pipeline.md](./zapstore-pipeline.md) and `.gitlab-ci.yml`; they are separate from backup variables.

  > **Important for self-hosted runners**: Protected CI/CD variables may not automatically propagate to Docker executor containers on self-hosted GitLab runners. The deploy jobs (`deploy-development`, `deploy-production`) in `.gitlab-ci.yml` explicitly re-declare `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in their `variables:` blocks to force injection:
  >
  > ```yaml
  > variables:
  >   CLOUDFLARE_API_TOKEN: $CLOUDFLARE_API_TOKEN
  >   CLOUDFLARE_ACCOUNT_ID: $CLOUDFLARE_ACCOUNT_ID
  > ```
  >
  > This is Cloudflare's [officially recommended pattern](https://developers.cloudflare.com/workers/ci-cd/external-cicd/gitlab-cicd/) for GitLab CI/CD. If you add new jobs that use `wrangler deploy`, apply the same pattern.
  >
  > `CLOUDFLARE_API_TOKEN` must be a Cloudflare API token (not a Global API Key) with at minimum the "Edit Cloudflare Workers" account-level permission. Create it at: https://dash.cloudflare.com/profile/api-tokens

- [ ] **Create pipeline schedules** (Build → Pipeline schedules → New schedule)
      | Schedule | Cron | Target branch | Add variable |
      |----------|------|---------------|-------------|
      | Daily backup | `0 3 * * *` | `dev` (or `main`) | `RETENTION_TYPE` = `daily` |
      | Weekly backup | `0 3 * * 0` | `dev` (or `main`) | `RETENTION_TYPE` = `weekly` |
      | Monthly backup | `0 3 1 * *` | `dev` (or `main`) | `RETENTION_TYPE` = `monthly` |

- [ ] **Enable failure notifications**
  - Settings → Integrations → Pipeline status emails: add your email
  - Or: use GitLab Slack integration for real-time alerts

### Apply R2 Lifecycle Rules

- [ ] Run from your machine (after the R2 bucket and API token are set up):
  ```bash
  export CLOUDFLARE_ACCOUNT_ID="<your-account-id>"
  npx wrangler r2 bucket lifecycle set bittasker-backups --file config/r2-lifecycle.json
  npx wrangler r2 bucket lifecycle list bittasker-backups  # verify
  ```

### Test the Pipeline

- [ ] **Test pg_dump connectivity locally** (recommended: full public URI from Railway Connect tab)

  ```bash
  # Replace with your Railway public URL; quote the URI. Add query params as in the example above.
  export DATABASE_URL_API='postgresql://backup_user:PASSWORD@HOST:PORT/bittasker?sslmode=require&connect_timeout=60'

  pg_dump --verbose \
    -d "$DATABASE_URL_API" \
    --format=custom --compress=9 --no-owner --no-acl \
    --file=dist/test-api.dump

  pg_restore --list dist/test-api.dump | head -20
  ```

  Or run the full script locally:

  ```bash
  export CLOUDFLARE_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=bittasker-backups
  export DATABASE_URL_API=… DATABASE_URL_RELAY_TASKS=… DATABASE_URL_RELAY_GENERAL=…
  RETENTION_TYPE=daily bash scripts/backup-databases.sh
  ```

  Use the **TCP proxy port** from Railway (often five digits), not `5432`, unless Railway shows `5432` for public access.

- [ ] **Trigger a manual pipeline test**

  - GitLab → Build → Pipeline schedules → Click "Play" on the daily schedule
  - Or: CI/CD → Pipelines → Run pipeline → Variables: `RETENTION_TYPE` = `daily`
  - Verify the job succeeds and files appear in R2: `aws s3 ls "s3://bittasker-backups/daily/" --endpoint-url "https://<account-id>.r2.cloudflarestorage.com"`

- [ ] **Test restore from R2**
  ```bash
  # Set R2 env vars first, then:
  bash scripts/restore-from-r2.sh api
  # This will find and download the latest backup, then print the restore command.
  # To actually restore (to a test database):
  createdb restore_test
  bash scripts/restore-from-r2.sh api "postgresql://postgres:password@localhost:5432/restore_test"
  # Verify: psql -d restore_test -c "\dt"
  ```
