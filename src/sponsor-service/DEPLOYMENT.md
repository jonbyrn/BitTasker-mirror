# Sponsor Service Deployment Guide

## Pre-Deployment Checklist

- [ ] All tests passing locally
- [ ] Environment variables configured
- [ ] Database backups scheduled
- [ ] Monitoring and alerting configured
- [ ] Rate limits configured for production
- [ ] Sponsor address funded with USDT
- [ ] Router contract deployed and verified
- [ ] Network RPC endpoints validated

## Staging Deployment (BSC Testnet)

### 1. Prepare Environment

```bash
# Copy environment template
cp src/sponsor-service/.env.example .env.staging

# Edit for testnet
export DEPLOY_ENV=staging
```

### 2. Database Setup

```bash
# Create RDS instance or managed database
# Connection string: postgresql://user:pass@db-staging.example.com/sponsor_service

# Initialize schema
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -f src/sponsor-service/db/schema.sql
```

### 3. Build and Deploy

```bash
# Build Docker image
docker build -f src/sponsor-service/Dockerfile -t sponsor-service:staging .

# Push to registry
docker push registry.example.com/sponsor-service:staging

# Deploy with docker-compose or Kubernetes
docker-compose -f docker-compose.staging.yml up -d
```

### 4. Verify Deployment

```bash
# Wait for service to be ready
for i in {1..30}; do
  curl http://staging-sponsor.example.com/ready && break
  sleep 2
done

# Run smoke tests
npm run sponsor:test

# Check logs
tail -f /var/log/sponsor-service/access.log
```

## Production Deployment (BSC Mainnet)

### 1. Security Review

Before production deployment, ensure:

```
- [ ] Private keys are not in environment variables
- [ ] All secrets are in secure vault (AWS Secrets Manager, etc)
- [ ] Database encryption at rest enabled
- [ ] HTTPS/TLS configured
- [ ] CORS properly restricted
- [ ] Rate limits tuned for production traffic
- [ ] Backup strategy documented
```

### 2. Database Configuration

```sql
-- Production database settings
ALTER DATABASE sponsor_service SET log_min_duration_statement = 1000;
ALTER DATABASE sponsor_service SET shared_preload_libraries = 'pg_stat_statements';

-- Create backup user
CREATE USER backup_user WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE sponsor_service TO backup_user;
GRANT USAGE ON SCHEMA public TO backup_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_user;
```

### 3. Multi-Region Setup

```bash
# Primary region
export PRIMARY_REGION=us-east-1
export SECONDARY_REGION=eu-west-1

# Deploy to both regions with failover
docker-compose -f docker-compose.production.yml -p sponsor-primary up -d
docker-compose -f docker-compose.production.yml -p sponsor-secondary up -d

# Configure load balancer
# - Primary: 70% of traffic
# - Secondary: 30% of traffic
# - Automatic failover on health check failures
```

### 4. Monitoring Setup

```bash
# Deploy Prometheus scrape config
cat > /etc/prometheus/sponsor-service.yml <<EOF
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'sponsor-service-prod'
    static_configs:
      - targets: ['sponsor.example.com:3001']
    metrics_path: '/metrics'
EOF

# Deploy Grafana dashboards
# - Request rate and latency
# - Error rate by failure code
# - Pending submission queue depth
# - Sponsor balance trends
```

### 5. Alerting Rules

```yaml
# Prometheus alert rules
groups:
  - name: sponsor_service
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(sponsor_requests_failed[5m]) > 0.05
        for: 5m
        annotations:
          summary: "Sponsor service error rate > 5%"

      - alert: SponsorBalanceLow
        expr: sponsor_balance_usdt < 100000000000
        for: 10m
        annotations:
          summary: "Sponsor USDT balance < $100"

      - alert: PendingQueueBacklog
        expr: sponsor_pending_submissions > 100
        for: 15m
        annotations:
          summary: "Pending submission queue > 100"

      - alert: DatabaseConnectionPoolExhausted
        expr: sponsor_db_connections_active >= 20
        for: 5m
        annotations:
          summary: "Database connection pool exhausted"
```

## Kubernetes Deployment

### Helm Chart Structure

```
sponsor-service-chart/
├── Chart.yaml
├── values.yaml
├── values-staging.yaml
├── values-production.yaml
├── templates/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml
│   ├── pdb.yaml
│   └── servicemonitor.yaml
```

### Install Chart

```bash
# Staging
helm install sponsor-service ./sponsor-service-chart \
  -f sponsor-service-chart/values-staging.yaml \
  -n sponsor-service \
  --create-namespace

# Production
helm install sponsor-service ./sponsor-service-chart \
  -f sponsor-service-chart/values-production.yaml \
  -n sponsor-service \
  --create-namespace
```

### Production Values

```yaml
# values-production.yaml
replicaCount: 3
image:
  tag: "1.0.0"

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 250m
    memory: 256Mi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

affinity:
  podAntiAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchExpressions:
            - key: app
              operator: In
              values:
                - sponsor-service
        topologyKey: kubernetes.io/hostname

env:
  NODE_ENV: production
  LOG_REQUESTS: "false"
  CONFIRMATION_MAX_RETRIES: "15"

secrets:
  dbPassword: /path/to/secret
  bscMainnetRpc: /path/to/secret
  sponsorPrivateKey: /path/to/secret
```

## Rollback Procedure

If deployment fails:

```bash
# Kubernetes
kubectl rollout undo deployment/sponsor-service -n sponsor-service

# Docker Swarm
docker service rollback sponsor-service

# Manual
docker-compose down
docker pull sponsor-service:previous-version
docker-compose up -d
```

## Maintenance Windows

### Weekly
- Review error logs
- Check database query performance
- Verify backup completion
- Test disaster recovery

### Monthly
- Analyze submission patterns
- Optimize database indexes
- Review rate limit effectiveness
- Update dependencies

### Quarterly
- Full backup verification
- Load testing
- Security audit
- Capacity planning

## Disaster Recovery

### Database Backup Strategy

```bash
# Automated daily backup
0 2 * * * /usr/local/bin/backup-sponsor-db.sh

# Backup script
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump -h $DB_HOST -U $DB_USER $DB_NAME | \
  gzip > /backups/sponsor_$TIMESTAMP.sql.gz

# Keep last 30 days
find /backups -name "sponsor_*.sql.gz" -mtime +30 -delete
```

### Recovery Procedure

```bash
# If database is corrupted
gzip -d /backups/sponsor_20240101_020000.sql.gz
psql -h $DB_HOST -U $DB_USER $DB_NAME < sponsor_20240101_020000.sql

# Verify recovery
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT COUNT(*) FROM submissions"
```

## Performance Tuning

### Database Connection Pool

```typescript
// Adjust based on load
database: {
  max: 50,  // staging: 20, production: 50
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
}
```

### Rate Limiting for Production

```typescript
{
  perSenderLimit: 5,      // staging: 10, production: 5
  perSenderWindow: 60000, // 1 minute
  perIpLimit: 25,         // staging: 50, production: 25
  perIpWindow: 60000      // 1 minute
}
```

### Transaction Confirmation Polling

```typescript
{
  pollInterval: 5000,     // 5 seconds
  batchSize: 20,          // staging: 10, production: 20
  maxAge: 30 * 60 * 1000  // 30 minutes
}
```

## Post-Deployment

### 1. Smoke Tests

```bash
# Submit test transaction
curl -X POST https://sponsor.example.com/v1/usdt-bsc/submit-send \
  -H "Content-Type: application/json" \
  -d @test-payload.json

# Check status
curl https://sponsor.example.com/v1/usdt-bsc/status/test-correlation-id
```

### 2. Monitor First Hour

- Watch error logs
- Monitor pending queue
- Check confirmation time
- Verify sponsor balance

### 3. Enable Alerting

- Notifications to Slack/PagerDuty
- Auto-escalation on critical errors
- Dashboard refresh rate: 30 seconds

## Troubleshooting Deployment Issues

### Service won't start
```bash
# Check logs
docker logs sponsor-service

# Check database connectivity
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1"

# Check RPC endpoints
curl -X POST $BSC_MAINNET_RPC_URL \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### High error rate after deployment
```bash
# Revert to previous version
helm rollout undo release/sponsor-service

# Investigate logs
kubectl logs -l app=sponsor-service -f --tail=100

# Check database load
psql -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10"
```

### Database performance degradation
```bash
# Analyze query performance
EXPLAIN ANALYZE SELECT * FROM submissions
WHERE lifecycle_state = 'chain_pending';

# Rebuild indexes if needed
REINDEX TABLE submissions;

# Vacuum if necessary
VACUUM ANALYZE submissions;
```
