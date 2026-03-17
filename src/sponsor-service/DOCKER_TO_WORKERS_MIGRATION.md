# Docker to Cloudflare Workers Migration Guide

This guide helps you migrate from the Docker Compose deployment to Cloudflare Workers while maintaining API compatibility and data integrity.

## Migration Overview

The Sponsor Service supports seamless migration between two deployment models:

| Aspect            | Docker Compose | Cloudflare Workers  |
| ----------------- | -------------- | ------------------- |
| **Storage**       | PostgreSQL     | D1 (SQLite)         |
| **Caching**       | Redis          | KV Namespace        |
| **Rate Limiting** | PostgreSQL     | KV + D1             |
| **Idempotency**   | PostgreSQL     | KV Cache            |
| **Compute**       | Container      | Serverless Function |
| **Scaling**       | Manual         | Automatic           |
| **Cost**          | Infrastructure | Per-request         |

## Pre-Migration Checklist

- [ ] Current Docker deployment is running and healthy
- [ ] PostgreSQL database has data to migrate
- [ ] All environment variables documented
- [ ] Backup of PostgreSQL database created
- [ ] Cloudflare account with D1 access
- [ ] Wrangler CLI installed and configured
- [ ] Test environment ready

## Phase 1: Preparation

### 1.1 Backup Current Data

```bash
# Backup PostgreSQL database
docker exec sponsor-service-db pg_dump \
  -U sponsor \
  -h localhost \
  sponsor_service > backup_$(date +%s).sql

# Verify backup
file backup_*.sql
wc -l backup_*.sql

# Store backup securely
mkdir -p backups
mv backup_*.sql backups/
```

### 1.2 Document Environment Variables

Create a migration configuration file:

```bash
# Save current environment
cat > migration-config.env << 'EOF'
# Docker Environment Variables
DB_USER=sponsor
DB_PASSWORD=CHANGE_ME
DB_HOST=postgres
DB_PORT=5432
DB_NAME=sponsor_service
DB_POOL_SIZE=20

# Network Configuration
SPONSOR_SERVICE_PORT=3001
SPONSOR_SERVICE_HOST=0.0.0.0

# BSC Configuration
BSC_MAINNET_RPC_URL=https://bsc-dataseed.binance.org
BSC_TESTNET_RPC_URL=https://data-seed-prebsc.binance.org:8545
BSC_MAINNET_SPONSOR_ADDRESS=0x...
BSC_TESTNET_SPONSOR_ADDRESS=0x...
BSC_MAINNET_ROUTER_ADDRESS=0x...
BSC_TESTNET_ROUTER_ADDRESS=0x...
BSC_TESTNET_USDT_ADDRESS=0x...
EOF

# Keep secure
chmod 600 migration-config.env
```

### 1.3 Verify API Compatibility

Both versions expose identical endpoints:

```bash
# Docker version (running)
DOCKER_URL="http://localhost:3001"

# Test health endpoint
curl $DOCKER_URL/health

# Test with sample request
curl -X POST $DOCKER_URL/v1/usdt-bsc/submit-send \
  -H "Content-Type: application/json" \
  -d '{
    "correlationId": "migration-test-1",
    "signedRawTransaction": "0x...",
    "signedRawTransactionHash": "0x...",
    "chainId": 97,
    "requestExpiry": '$(date +%s)'
  }'
```

## Phase 2: Parallel Deployment

### 2.1 Deploy Workers Version

```bash
# Navigate to sponsor service
cd src/sponsor-service

# Create D1 database
wrangler d1 create sponsor-prod-migration

# Create KV namespaces
wrangler kv:namespace create sponsor-cache-prod-migration
wrangler kv:namespace create sponsor-cache-prod-migration --preview

# Update wrangler.toml with new IDs
# Edit wrangler.toml and add to [env.production]:
# - D1 database_id
# - KV namespace id and preview_id
```

### 2.2 Migrate Database Schema

```bash
# Initialize D1 schema
wrangler d1 execute sponsor-prod-migration \
  --file=src/workers/d1-schema.sql --env production
```

### 2.3 Verify Workers Deployment

```bash
# Deploy Workers version
wrangler deploy --env production

# Test health endpoint
curl https://sponsor-service.YOURWORKER.workers.dev/health

# Should return:
# {
#   "status": "ok",
#   "timestamp": "2024-01-15T10:30:00.000Z",
#   "version": "1.0.0"
# }
```

## Phase 3: Data Migration

### 3.1 Export PostgreSQL Data

```bash
# Export as JSON for easier migration
docker exec sponsor-service-db psql \
  -U sponsor \
  -d sponsor_service \
  -c "COPY submissions TO STDOUT WITH CSV HEADER" > submissions.csv

docker exec sponsor-service-db psql \
  -U sponsor \
  -d sponsor_service \
  -c "COPY treasury_events TO STDOUT WITH CSV HEADER" > treasury_events.csv

docker exec sponsor-service-db psql \
  -U sponsor \
  -d sponsor_service \
  -c "COPY sponsor_balances TO STDOUT WITH CSV HEADER" > sponsor_balances.csv

# Check exported data
wc -l *.csv
head -5 submissions.csv
```

### 3.2 Convert to D1 Format

Create a migration script:

```bash
# File: migrate-data.sh
#!/bin/bash

# SQL INSERT statements for D1
cat > submissions-insert.sql << 'EOF'
-- Insert submissions data
EOF

# Parse CSV and generate SQL
while IFS=',' read -r id correlation_id signed_hash chain_id status lifecycle_state failure_code tx_hash sender_address recipient_address amount fixed_fee request_expiry created_at updated_at retry_count last_retry confirmation_checked; do
  [[ "$id" == "id" ]] && continue  # Skip header

  # Generate INSERT statement (handle quoting)
  echo "INSERT INTO submissions VALUES ('$id', '$correlation_id', '$signed_hash', '$chain_id', '$status', '$lifecycle_state', '$failure_code', '$tx_hash', '$sender_address', '$recipient_address', '$amount', '$fixed_fee', '$request_expiry', '$created_at', '$updated_at', '$retry_count', '$last_retry', '$confirmation_checked');" >> submissions-insert.sql
done < submissions.csv

# Execute in D1
wrangler d1 execute sponsor-prod-migration --file=submissions-insert.sql
```

### 3.3 Verify Migration

```bash
# Count records in D1
wrangler d1 execute sponsor-prod-migration \
  --command="SELECT COUNT(*) as count FROM submissions" \
  --env production

# Should match Docker count
docker exec sponsor-service-db psql \
  -U sponsor \
  -d sponsor_service \
  -c "SELECT COUNT(*) FROM submissions;"

# Sample records verification
wrangler d1 execute sponsor-prod-migration \
  --command="SELECT correlation_id, status, lifecycle_state FROM submissions LIMIT 5" \
  --env production
```

### 3.4 Test Idempotency

```bash
# Test that duplicate requests are handled correctly
CORRELATION_ID="migration-idempotency-test"
TX_HASH="0x$(openssl rand -hex 32)"

# Request 1
curl -X POST https://sponsor-service.YOURWORKER.workers.dev/v1/usdt-bsc/submit-send \
  -H "Content-Type: application/json" \
  -d '{
    "correlationId": "'$CORRELATION_ID'",
    "signedRawTransaction": "0x...",
    "signedRawTransactionHash": "'$TX_HASH'",
    "chainId": 97,
    "requestExpiry": '$(date +%s)'
  }' > response1.json

SUBMISSION_ID=$(jq -r '.submissionId' response1.json)

# Request 2 (duplicate)
curl -X POST https://sponsor-service.YOURWORKER.workers.dev/v1/usdt-bsc/submit-send \
  -H "Content-Type: application/json" \
  -d '{
    "correlationId": "'$CORRELATION_ID'",
    "signedRawTransaction": "0x...",
    "signedRawTransactionHash": "'$TX_HASH'",
    "chainId": 97,
    "requestExpiry": '$(date +%s)'
  }' > response2.json

# Both should have same submissionId
diff <(jq '.submissionId' response1.json) <(jq '.submissionId' response2.json)
# Should return nothing (files identical)
```

## Phase 4: Traffic Migration

### 4.1 Routing Strategy

**Option A: Blue-Green Deployment (Recommended)**

```
1. Keep Docker running (Blue)
2. Workers in production (Green)
3. Route 10% traffic to Workers for 1 day
4. Route 50% traffic to Workers for 1 day
5. Route 100% traffic to Workers
6. Monitor for 3 days
7. Scale down Docker
```

**Option B: Canary Deployment**

```
1. Route to Workers based on correlation_id hash
2. Start with 5% of traffic
3. Increase 5% every 12 hours
4. Monitor error rates and latency
5. Full cutover after 48 hours
```

### 4.2 Update Load Balancer/DNS

If using a reverse proxy:

```nginx
# nginx.conf - Initial 10% to Workers
upstream docker_backend {
  server localhost:3001;
}

upstream workers_backend {
  server sponsor-service.workers.dev;
}

# Split traffic by user
split_clients "${http_x_correlation_id}" $backend {
  10% workers_backend;
  *   docker_backend;
}

server {
  listen 8080;
  location /v1/usdt-bsc/ {
    proxy_pass http://$backend;
  }
}
```

### 4.3 Monitor Metrics

```bash
# Docker logs
docker logs -f sponsor-service

# Workers logs
wrangler tail --env production --format json

# Compare response times
# Parse logs and calculate p50, p99 latency
# Monitor error rates (5xx responses)
# Check rate limit hit counts
```

## Phase 5: Verification & Cutover

### 5.1 Comprehensive Testing

```bash
# 1. Health checks
curl https://sponsor-service.workers.dev/health
curl http://localhost:3001/health

# 2. Submit request test
TEST_ID="cutover-test-$(date +%s)"
curl -X POST https://sponsor-service.workers.dev/v1/usdt-bsc/submit-send \
  -H "Content-Type: application/json" \
  -d '{
    "correlationId": "'$TEST_ID'",
    "signedRawTransaction": "0x...",
    "signedRawTransactionHash": "0x...",
    "chainId": 97,
    "requestExpiry": '$(date +%s)'
  }' | jq .

# 3. Status check
curl https://sponsor-service.workers.dev/v1/usdt-bsc/status/$TEST_ID | jq .

# 4. Rate limiting test
for i in {1..60}; do
  curl -s https://sponsor-service.workers.dev/v1/usdt-bsc/submit-send \
    -H "Content-Type: application/json" \
    -d '{"correlationId":"'$TEST_ID-$i'","signedRawTransaction":"0x...","signedRawTransactionHash":"0x...","chainId":97,"requestExpiry":'$(date +%s)'}' \
    | jq '.status' || echo "Rate limited (expected)"
done
```

### 5.2 Performance Comparison

```bash
# Benchmark Docker version
ab -c 10 -n 100 -p request.json -T application/json http://localhost:3001/v1/usdt-bsc/submit-send

# Benchmark Workers version
ab -c 10 -n 100 -p request.json -T application/json https://sponsor-service.workers.dev/v1/usdt-bsc/submit-send

# Compare results (latency, throughput)
```

### 5.3 Full Cutover

```bash
# 1. Update DNS/load balancer to 100% Workers
# 2. Monitor for 1 hour
# 3. Check error rates are acceptable (< 0.1%)
# 4. Verify all submissions are being recorded

# Query D1 for recent submissions
wrangler d1 execute sponsor-prod-migration \
  --command="SELECT COUNT(*) as recent_count FROM submissions WHERE created_at > datetime('now', '-1 hour')" \
  --env production

# Should show submissions from Workers
```

## Phase 6: Cleanup

### 6.1 Scale Down Docker

```bash
# Stop but don't remove (keep for rollback)
docker-compose -f src/sponsor-service/docker-compose.yml down

# Archive database backups
tar -czf sponsor-db-backup-$(date +%Y%m%d).tar.gz backups/

# Document final state
echo "Docker deployment shut down: $(date)" > MIGRATION_COMPLETE.log
```

### 6.2 Archive Old Infrastructure

```bash
# Keep PostgreSQL backup for 30 days minimum
# Option: Keep Redis running for other services
docker-compose -f src/sponsor-service/docker-compose.yml down -v  # Remove volumes

# Keep Docker Compose file as reference
git commit -m "Archive: Docker Compose deployment superseded by Cloudflare Workers"
```

### 6.3 Update Documentation

```bash
# Update README
# - Remove Docker setup section
# - Reference Workers deployment guide
# - Keep migration guide for reference

# Update deployment procedures
# - Point to CLOUDFLARE_DEPLOYMENT.md
# - Remove Docker instructions

# Update CI/CD
# - Remove Docker image builds
# - Update deployment workflows
```

## Rollback Plan

If issues occur at any point:

### Immediate Rollback (< 1 hour)

```bash
# 1. Revert DNS/LB to Docker
# Edit load balancer config or DNS records

# 2. Restart Docker containers
docker-compose -f src/sponsor-service/docker-compose.yml up -d

# 3. Verify Docker is operational
curl http://localhost:3001/health

# 4. Notify team
echo "Rolled back to Docker deployment: $(date)" | mail -s "Deployment Rollback" team@example.com
```

### Extended Rollback (1+ hours)

```bash
# If data corruption occurred:
# 1. Stop Workers (disable in CF dashboard)
# 2. Restore PostgreSQL from backup
docker exec sponsor-service-db psql \
  -U sponsor \
  -d sponsor_service \
  -f backup_TIMESTAMP.sql

# 3. Verify data integrity
docker exec sponsor-service-db psql \
  -U sponsor \
  -d sponsor_service \
  -c "SELECT COUNT(*) FROM submissions;"

# 4. Resume normal operation
```

## Comparison: Before & After

### Before (Docker)

```
docker-compose up
↓
3 containers (postgres, redis, app)
↓
Local/VPS infrastructure
↓
Manual scaling
↓
$200-500/month (infrastructure)
```

### After (Cloudflare Workers)

```
wrangler deploy
↓
Serverless on global CDN
↓
Automatic scaling
↓
Pay per request
↓
$50-150/month (typical)
```

## Monitoring Post-Migration

### Daily Checks (First Week)

- Error rate < 0.1%
- P95 latency < 500ms
- Database size growing as expected
- Rate limiting working correctly
- Idempotency preventing duplicates

### Weekly Checks

- Submission success rate > 99%
- No data discrepancies
- Cost trends acceptable
- Performance stable

### Monthly Review

- Overall cost vs Docker
- Performance trends
- Scaling effectiveness
- Backup integrity

## Troubleshooting Migration Issues

### Issue: Data Missing After Migration

```bash
# Check source data count
docker exec sponsor-service-db psql -U sponsor -d sponsor_service \
  -c "SELECT COUNT(*) FROM submissions;"

# Check destination data count
wrangler d1 execute sponsor-prod-migration \
  --command="SELECT COUNT(*) FROM submissions"

# If mismatch, re-run migration from backup
```

### Issue: Idempotency Not Working

```bash
# Verify KV is accessible
wrangler kv:key list --namespace-id YOUR_KV_ID

# Check D1 unique constraints
wrangler d1 execute sponsor-prod-migration \
  --command="SELECT COUNT(*) FROM submissions WHERE signed_raw_transaction_hash = 'TEST'"

# Both should enforce uniqueness
```

### Issue: Rate Limiting Too Aggressive

```bash
# Check KV rate limit records
wrangler kv:key list --namespace-id YOUR_KV_ID --prefix "ratelimit:"

# Adjust limits in src/workers/index.ts:
# perIpLimit: 50 (requests per minute)
# perSenderLimit: 10 (requests per minute)

# Redeploy after adjusting
wrangler deploy --env production
```

## Validation Checklist

- [ ] All submissions migrated successfully
- [ ] Treasury events migrated
- [ ] Rate limiting working
- [ ] Idempotency enforced
- [ ] Error handling identical
- [ ] API responses match Docker version
- [ ] Performance acceptable
- [ ] Cost within budget
- [ ] Monitoring in place
- [ ] Rollback plan tested

## Next Steps

1. Monitor Workers deployment for 1 week
2. Scale down Docker completely
3. Implement Workers-specific optimizations
4. Set up advanced monitoring/analytics
5. Plan for future enhancements

---

**Migration Date**: ******\_\_\_******
**Completion Date**: ******\_\_\_******
**Status**: ☐ In Progress ☐ Complete ☐ Rolled Back

**Notes**:
