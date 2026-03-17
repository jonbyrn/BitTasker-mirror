# Deployment Checklist - Sponsor Service

This checklist ensures both Docker Compose and Cloudflare Workers deployments are properly configured and tested.

## Pre-Deployment

### Environment Setup

- [ ] Node.js 18+ installed
- [ ] Docker and Docker Compose installed (for Docker deployment)
- [ ] Cloudflare account created
- [ ] Wrangler CLI installed: `npm install -g @cloudflare/wrangler@latest`
- [ ] Wrangler authenticated: `wrangler login`
- [ ] All environment variables documented

### Code Review

- [ ] Code reviewed and approved
- [ ] Tests passing: `npm test`
- [ ] Build successful: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No security warnings: `npm audit`
- [ ] TypeScript compilation successful

## Docker Compose Deployment

### Database Setup

- [ ] PostgreSQL 16 image available or will be pulled
- [ ] Schema file exists: `src/sponsor-service/db/schema.sql`
- [ ] Backup of existing database created (if applicable)
- [ ] Database credentials configured in docker-compose.yml
- [ ] Volume paths verified and writable

### Configuration

- [ ] `.env` file created with all required variables
- [ ] BSC network RPC URLs configured and accessible
- [ ] Sponsor and router addresses configured
- [ ] Port 3001 available (or configured to different port)
- [ ] Redis port 6379 available (or configured)
- [ ] PostgreSQL port 5432 available (or configured)

### Container Setup

- [ ] Dockerfile reviewed and correct
- [ ] docker-compose.yml reviewed and correct
- [ ] Health checks configured properly
- [ ] Volume mounts correct
- [ ] Network configuration correct
- [ ] Resource limits set (memory, CPU)

### Testing

- [ ] Docker images build successfully
- [ ] All three containers start: `docker-compose up -d`
- [ ] Health check passes: `docker-compose ps`
- [ ] Database initialized: `docker-compose logs postgres`
- [ ] Redis running: `docker exec sponsor-service-cache redis-cli ping`
- [ ] Service listening: `curl http://localhost:3001/health`

### Monitoring Setup (Docker)

- [ ] Logs accessible: `docker-compose logs -f sponsor-service`
- [ ] Container resource usage monitored
- [ ] Database connection pool monitored
- [ ] Error tracking configured
- [ ] Request logging enabled

## Cloudflare Workers Deployment

### Account & Project Setup

- [ ] Cloudflare account has Workers enabled
- [ ] D1 (Databases) enabled on account
- [ ] KV (Key-Value) enabled on account
- [ ] Account ID available
- [ ] Zone configured (if using custom domain)

### Database Creation

- [ ] D1 database created: `wrangler d1 create sponsor-prod`
- [ ] Database ID noted and saved
- [ ] Schema initialized: `wrangler d1 execute sponsor-prod --file=src/workers/d1-schema.sql`
- [ ] Tables verified: `wrangler d1 execute sponsor-prod --command="SELECT name FROM sqlite_master WHERE type='table'"`
- [ ] Indexes created successfully

### KV Namespace Setup

- [ ] KV namespace created: `wrangler kv:namespace create sponsor-cache`
- [ ] Namespace ID noted and saved
- [ ] Preview namespace created for testing
- [ ] KV limits understood and acceptable

### wrangler.toml Configuration

- [ ] `wrangler.toml` created with correct bindings
- [ ] Account ID inserted
- [ ] D1 database_id inserted (development and production)
- [ ] KV namespace IDs inserted
- [ ] Environment variables configured
- [ ] Routes configured (if using custom domain)
- [ ] Cron triggers configured for confirmation poller

### Secrets Configuration

- [ ] All secrets set via `wrangler secret put`:
  - [ ] `BSC_MAINNET_RPC_URL`
  - [ ] `BSC_TESTNET_RPC_URL`
  - [ ] `BSC_MAINNET_SPONSOR_ADDRESS`
  - [ ] `BSC_TESTNET_SPONSOR_ADDRESS`
  - [ ] `BSC_MAINNET_ROUTER_ADDRESS`
  - [ ] `BSC_TESTNET_ROUTER_ADDRESS`
  - [ ] `BSC_TESTNET_USDT_ADDRESS`
- [ ] Secrets verified without committing to git

### Code Review

- [ ] `src/workers/index.ts` reviewed
- [ ] Handler logic correct
- [ ] Error handling comprehensive
- [ ] Database queries optimized
- [ ] Rate limiting implementation reviewed
- [ ] Idempotency implementation reviewed

### Local Testing

- [ ] Development server starts: `wrangler dev`
- [ ] Health endpoint works: `curl http://localhost:8787/health`
- [ ] Submit endpoint works with test data
- [ ] Status endpoint returns correct format
- [ ] Rate limiting triggers correctly
- [ ] Idempotency prevents duplicates

### Deployment

- [ ] Deployment command: `wrangler deploy --env production`
- [ ] Deployment successful (no errors)
- [ ] Worker URL accessible
- [ ] Health check responds: `curl https://your-worker.workers.dev/health`
- [ ] Database connections working
- [ ] KV cache accessible

### Monitoring Setup (Workers)

- [ ] Tail logs: `wrangler tail --env production`
- [ ] Metrics dashboard accessible in CF Dashboard
- [ ] Analytics Engine configured (optional)
- [ ] Error alerting configured
- [ ] Performance monitoring enabled

## API Compatibility Testing

### Endpoint Testing

- [ ] `GET /health` returns 200 and correct format
- [ ] `GET /ready` returns 200 when ready
- [ ] `GET /ready` returns 503 when not ready
- [ ] `GET /v1/usdt-bsc/status/:correlationId` returns 200
- [ ] `GET /v1/usdt-bsc/status/:correlationId` returns 404 for unknown IDs
- [ ] `POST /v1/usdt-bsc/submit-send` returns 202 on success
- [ ] `POST /v1/usdt-bsc/submit-send` returns 400 on validation error
- [ ] `POST /v1/usdt-bsc/submit-send` returns 429 on rate limit

### Validation Testing

- [ ] Missing `correlationId` returns 400
- [ ] Missing `signedRawTransaction` returns 400
- [ ] Missing `signedRawTransactionHash` returns 400
- [ ] Invalid `chainId` returns 400
- [ ] Expired `requestExpiry` returns 400
- [ ] Error messages are consistent

### Data Integrity Testing

- [ ] Submissions stored correctly
- [ ] Treasury events created automatically
- [ ] Idempotency works (duplicate requests return same submissionId)
- [ ] Rate limiting enforced
- [ ] Request metadata preserved

## Cross-Deployment Testing

### Dual Deployment

- [ ] Both Docker and Workers running simultaneously
- [ ] Docker responding on localhost:3001
- [ ] Workers responding on custom domain
- [ ] Health endpoints both return 200

### Request Compatibility

- [ ] Same request payload works on both
- [ ] Response format identical
- [ ] HTTP status codes match
- [ ] Error messages consistent

### Performance Comparison

- [ ] Docker response time noted
- [ ] Workers response time noted
- [ ] Latency acceptable for both
- [ ] No timeout issues

## Data Migration (if applicable)

### Pre-Migration

- [ ] PostgreSQL backup created
- [ ] D1 schema initialized
- [ ] KV namespace ready
- [ ] Migration script tested

### Migration Execution

- [ ] Data exported from PostgreSQL
- [ ] Data imported to D1
- [ ] Row counts match
- [ ] Data integrity verified
- [ ] Indexes built successfully

### Post-Migration Verification

- [ ] Sample queries return expected results
- [ ] Recent submissions queryable
- [ ] Treasury events accessible
- [ ] No data corruption detected

## Security Verification

### Input Validation

- [ ] All required fields validated
- [ ] Type checking enforced
- [ ] Size limits enforced
- [ ] Format validation works

### Rate Limiting

- [ ] IP-based rate limiting works
- [ ] Sender-based rate limiting works (if applicable)
- [ ] Limits reset after window expires
- [ ] 429 responses include retry-after header

### Signature Verification

- [ ] Transaction hash verification implemented
- [ ] Invalid signatures rejected
- [ ] Edge cases handled

### Database Security

- [ ] Connection pooling limits enforced
- [ ] Connection timeouts configured
- [ ] Prepared statements used (no SQL injection)
- [ ] Sensitive data not logged

## Monitoring & Alerting

### Docker Deployment

- [ ] Container restart policy configured
- [ ] Health check configured
- [ ] Logs centralized (if applicable)
- [ ] Disk space monitoring setup
- [ ] Database backup scheduled

### Workers Deployment

- [ ] Wrangler tail command working
- [ ] Cloudflare Analytics Dashboard accessible
- [ ] Error tracking configured
- [ ] Cost monitoring setup
- [ ] D1 backup strategy defined

## Documentation

- [ ] `CLOUDFLARE_DEPLOYMENT.md` reviewed
- [ ] `DOCKER_TO_WORKERS_MIGRATION.md` reviewed
- [ ] `DEPLOYMENT_CHECKLIST.md` completed (this file)
- [ ] Environment variables documented
- [ ] API endpoints documented
- [ ] Troubleshooting guide available

## Rollback Plan

### Docker Deployment

- [ ] Database backups stored securely
- [ ] Rollback procedure documented
- [ ] Previous version available if needed
- [ ] Rollback tested in staging

### Workers Deployment

- [ ] Previous version saved
- [ ] DNS rollback procedures documented
- [ ] D1 backups available
- [ ] Rollback time < 5 minutes

## Sign-Off

- **Deployer Name**: ************\_\_\_************
- **Date**: ****************\_\_\_\_****************
- **Environment**: ☐ Development ☐ Staging ☐ Production
- **Status**: ☐ Ready ☐ Blocked (see notes)
- **Approved By**: ************\_\_\_\_************

### Notes

```


```

## Post-Deployment

### Day 1

- [ ] Monitor error rates
- [ ] Check response times
- [ ] Verify database health
- [ ] Monitor cost (Workers)
- [ ] Review logs for issues

### Week 1

- [ ] Error rate stable
- [ ] No unexpected behavior
- [ ] Performance meets SLA
- [ ] Cost within estimate
- [ ] Team confident in deployment

### Ongoing

- [ ] Weekly performance review
- [ ] Monthly cost analysis
- [ ] Regular security audits
- [ ] Backup integrity checks
- [ ] Update documentation as needed

---

**Checklist Version**: 1.0
**Last Updated**: March 2025
