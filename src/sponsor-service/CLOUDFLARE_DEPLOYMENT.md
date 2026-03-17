# Cloudflare Workers Deployment Guide

This guide covers deploying the Sponsor Service to Cloudflare Workers with D1 (SQLite) and KV (key-value storage).

## Overview

The Sponsor Service can run on Cloudflare Workers in three modes:

1. **Workers only** - Stateless requests, caching in KV
2. **Workers + D1** - Persistent storage, full feature parity with Docker version
3. **Hybrid** - Docker for development, Workers for production

### Architecture

```
┌─────────────────────────────────────────────────────┐
│       Cloudflare Global Network                      │
├─────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────┐ │
│  │    Cloudflare Workers (Request Handler)        │ │
│  │  - Input validation & rate limiting (KV)       │ │
│  │  - Idempotency checks (KV)                     │ │
│  │  - Submission creation & status queries (D1)   │ │
│  └────────────────────────────────────────────────┘ │
│           ↓ (RPC calls)              ↓ (persists)   │
│  ┌──────────────────┐        ┌──────────────────┐   │
│  │  BSC Network     │        │  D1 Database     │   │
│  │  (mainnet/test)  │        │  (SQLite)        │   │
│  └──────────────────┘        └──────────────────┘   │
│                                     ↕ (replicate)   │
│                              ┌──────────────────┐   │
│                              │  KV Cache        │   │
│                              │  (Distributed)   │   │
│                              └──────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Prerequisites

1. **Cloudflare Account**

   - Free plan minimum (D1 available on paid plans)
   - Workers and KV enabled

2. **Wrangler CLI**

   ```bash
   npm install -g @cloudflare/wrangler@latest
   ```

3. **Environment Setup**
   ```bash
   # Authenticate with Cloudflare
   wrangler login
   ```

## Quick Start

### 1. Create a Cloudflare Project

```bash
cd src/sponsor-service

# Create a new Cloudflare Worker project
wrangler init sponsor-service-cf \
  --type="fetch" \
  --name="sponsor-service"
```

### 2. Create D1 Database

```bash
# Create a development database
wrangler d1 create sponsor-dev

# Create a production database
wrangler d1 create sponsor-prod

# Initialize schema
wrangler d1 execute sponsor-dev --file=src/workers/d1-schema.sql
wrangler d1 execute sponsor-prod --file=src/workers/d1-schema.sql
```

### 3. Create KV Namespace

```bash
# Create KV namespaces for rate limiting and caching
wrangler kv:namespace create sponsor-cache-dev
wrangler kv:namespace create sponsor-cache-prod

# For preview/testing
wrangler kv:namespace create sponsor-cache-dev --preview
wrangler kv:namespace create sponsor-cache-prod --preview
```

### 4. Update wrangler.toml

Update the `wrangler.toml` file with your IDs from steps 2 and 3:

```toml
# wrangler.toml
name = "sponsor-service"
main = "src/workers/index.ts"
compatibility_date = "2024-12-19"

account_id = "YOUR_ACCOUNT_ID"

[env.development]
vars = { ENVIRONMENT = "development" }
d1_databases = [{ binding = "DB", database_id = "YOUR_DEV_DB_ID" }]
kv_namespaces = [{ binding = "KV_CACHE", id = "YOUR_DEV_KV_ID" }]

[env.production]
vars = { ENVIRONMENT = "production" }
d1_databases = [{ binding = "DB", database_id = "YOUR_PROD_DB_ID" }]
kv_namespaces = [{ binding = "KV_CACHE", id = "YOUR_PROD_KV_ID" }]
```

### 5. Set Environment Variables

```bash
# Development environment variables
wrangler secret put BSC_MAINNET_RPC_URL --env development
# https://bsc-dataseed.binance.org

wrangler secret put BSC_TESTNET_RPC_URL --env development
# https://data-seed-prebsc.binance.org:8545

wrangler secret put BSC_TESTNET_SPONSOR_ADDRESS --env development
# 0x...

# Production variables (replace as needed)
wrangler secret put BSC_MAINNET_RPC_URL --env production
wrangler secret put BSC_MAINNET_SPONSOR_ADDRESS --env production
wrangler secret put BSC_TESTNET_SPONSOR_ADDRESS --env production
```

### 6. Deploy

```bash
# Development deployment
wrangler deploy --env development

# Production deployment
wrangler deploy --env production

# Watch mode for local development
wrangler dev --env development
```

## Testing Deployment

### Health Check

```bash
curl https://sponsor-service.your-domain.workers.dev/health
```

Expected response:

```json
{
	"status": "ok",
	"timestamp": "2024-01-15T10:30:00.000Z",
	"version": "1.0.0"
}
```

### Submit Direct Send Request

```bash
curl -X POST https://sponsor-service.your-domain.workers.dev/v1/usdt-bsc/submit-send \
  -H "Content-Type: application/json" \
  -d '{
    "correlationId": "test-123",
    "signedRawTransaction": "0x...",
    "signedRawTransactionHash": "0x...",
    "chainId": 97,
    "requestExpiry": '$(date +%s)'000000
  }'
```

Expected response (202 Accepted):

```json
{
	"status": "accepted",
	"correlationId": "test-123",
	"submissionId": "uuid-here",
	"lifecycleState": "submitted"
}
```

### Get Submission Status

```bash
curl https://sponsor-service.your-domain.workers.dev/v1/usdt-bsc/status/test-123
```

Expected response:

```json
{
	"status": "accepted",
	"correlationId": "test-123",
	"submissionId": "uuid-here",
	"lifecycleState": "submitted"
}
```

## Running Confirmation Poller

The confirmation poller runs as a scheduled Worker (every 5 minutes by default):

```bash
# Check scheduled execution logs
wrangler tail --env development
```

To customize the schedule, edit `wrangler.toml`:

```toml
[triggers]
crons = ["*/5 * * * *"]  # Every 5 minutes
# For hourly: ["0 * * * *"]
# For every 30 min: ["*/30 * * * *"]
```

## Migration from Docker to Workers

### Step-by-Step Migration

1. **Deploy Workers version in parallel**

   - Keep Docker running
   - Deploy Workers to staging environment
   - Test endpoints thoroughly

2. **Data Migration**

   ```bash
   # Export Docker PostgreSQL data
   docker exec sponsor-service-db pg_dump -U sponsor sponsor_service > backup.sql

   # Import to D1 (convert SQL format if needed)
   wrangler d1 execute sponsor-prod --file=converted-backup.sql
   ```

3. **Route Traffic**

   - Update DNS/CDN to point to Workers
   - Monitor error rates
   - Keep rollback plan ready

4. **Verification**

   - Test all endpoints
   - Verify rate limiting works
   - Check idempotency

5. **Cleanup**
   - Scale down Docker containers
   - Archive PostgreSQL backups
   - Update documentation

### Rollback Plan

If issues occur during migration:

```bash
# Immediate rollback: update DNS back to Docker IP
# Or disable Workers route in Cloudflare

# Redeploy previous version
wrangler deploy --env production
```

## Monitoring & Debugging

### View Logs

```bash
# Real-time tail
wrangler tail --env production --format json

# Filter for errors
wrangler tail --env production --status ok
```

### Check Metrics

In Cloudflare Dashboard:

1. Navigate to Workers > your-worker > Metrics
2. View: Requests, Errors, CPU Time, Wall Time

### Debug Locally

```bash
# Start local development server
wrangler dev --env development

# Test in another terminal
curl http://localhost:8787/health
```

### D1 Query Debugging

```bash
# Execute raw SQL for debugging
wrangler d1 execute sponsor-dev --command="SELECT COUNT(*) FROM submissions"

# Export all data
wrangler d1 export sponsor-dev > backup.sql
```

## Performance Optimization

### KV Caching Strategy

**Rate Limiting**:

- Cache for 1 minute (window duration)
- Keys: `ratelimit:ip:{ip}` and `ratelimit:sender:{address}`

**Idempotency**:

- Cache for 24 hours
- Keys: `idempotency:{txHash}`

**Status Queries**:

- Cache for 5 minutes
- Keys: `status:{correlationId}`

### D1 Query Optimization

Indexes created for:

- `correlation_id` (fast lookup)
- `signed_raw_transaction_hash` (idempotency checks)
- `lifecycle_state` (filtering pending submissions)
- `created_at DESC` (time-based queries)

### CPU Time Optimization

- Pre-cache frequently accessed data
- Use D1 prepared statements
- Batch database operations
- Minimize JSON serialization

## Cost Estimation

**Monthly costs (estimated):**

| Component | Free Tier       | Paid Tier                        |
| --------- | --------------- | -------------------------------- |
| Workers   | 100,000 req/day | $0.50/M requests                 |
| D1        | Not included    | $1.25/M reads, $5/M writes       |
| KV        | 100,000 ops/day | $0.50/M read ops, $5/M write ops |
| Bandwidth | Included        | $0.20/GB (excess)                |

For moderate load (100K requests/day):

- **Workers**: ~$15/month
- **D1**: ~$40/month (est.)
- **KV**: ~$5/month
- **Total**: ~$60/month

## Troubleshooting

### Database Connection Errors

```
Error: D1_BIND is not defined
```

**Solution**: Check `wrangler.toml` has correct binding name `DB`

### KV Binding Issues

```
Error: KV_CACHE is not defined
```

**Solution**: Verify KV namespace ID in `wrangler.toml`

### Rate Limiting Not Working

**Check**: KV is accessible and TTLs are set correctly

```bash
wrangler kv:key list --namespace-id YOUR_ID
```

### Missing Scheduled Trigger Logs

**Check**: Cron schedule in `wrangler.toml` is valid

```bash
# Valid cron format: "0 * * * *" (Cloudflare format)
# Not standard crontab format
```

### D1 Transaction Conflicts

**Issue**: Idempotency checks failing
**Solution**: Use KV for temporary request tracking with longer TTL

## Advanced Configuration

### Custom Domain

```bash
# Add custom domain in Cloudflare Dashboard
# Or via Wrangler:
wrangler route create sponsor-service.example.com --pattern '*'
```

### Rate Limiting with Firewall Rules

In Cloudflare Dashboard:

1. Security > WAF > Rate Limiting Rules
2. Set threshold: 50 req/min per IP
3. Action: Challenge or Block

### Analytics Engine Integration

```toml
[analytics_engine_datasets]
submissions = "submissions"
events = "events"
```

Then log events:

```typescript
// In Worker code
event.waitUntil(
	env.ANALYTICS_ENGINE_BINDINGS.writeDataPoint({
		indexes: [correlationId],
		blobs: [JSON.stringify(submission)]
	})
);
```

## Support & Resources

- **Wrangler CLI Docs**: https://developers.cloudflare.com/workers/wrangler/
- **D1 Documentation**: https://developers.cloudflare.com/d1/
- **KV Documentation**: https://developers.cloudflare.com/kv/
- **Workers Runtime APIs**: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/

## Next Steps

1. Set up monitoring and alerts
2. Implement custom domain
3. Add analytics engine for metrics
4. Configure backup strategy for D1
5. Set up staging environment for testing

---

**Last Updated**: March 2025
**Version**: 1.0.0
