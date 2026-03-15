# Sponsor Service for USDT-BSC Direct-Send Payments

A production-ready Express.js service that sponsors and manages direct-send USDT payments on Binance Smart Chain (BSC).

## Overview

The Sponsor Service is a critical backend component that:

1. **Accepts signed direct-send requests** from the BitTasker wallet app
2. **Validates requests** for chain ID, expiry, and signature integrity
3. **Submits transactions** to the BSC blockchain on behalf of users (sponsoring gas fees)
4. **Tracks submission lifecycle** from acceptance through confirmation
5. **Provides status endpoints** for clients to monitor payment progress
6. **Implements rate limiting** to prevent abuse
7. **Maintains audit trails** for treasury reconciliation

## Architecture

### Database Schema

- **submissions**: Tracks all sponsor requests with unique `correlation_id` and `signed_raw_transaction_hash`
- **treasury_events**: Audit trail of all submission events (submission, confirmation, failure, fee collection)
- **sponsor_balances**: Cached sponsor USDT balance (optional, for optimization)
- **rate_limits**: Distributed rate limiting state (per IP, per sender)

### Services

#### BlockchainService
- Submits signed transactions to BSC
- Polls for transaction confirmation
- Queries chain state (balance, gas price)
- Handles RPC errors with retry logic

#### SubmitSendService
- Main business logic for direct-send sponsorship
- Implements idempotency by `signed_raw_transaction_hash`
- Validates chain ID, request expiry, sponsor balance
- Returns typed failure codes
- Manages submission lifecycle transitions

#### Rate Limiter
- Token bucket implementation
- Per-sender limit (10 req/min by default)
- Per-IP limit (50 req/min by default)
- Database-backed for distributed systems

## API Endpoints

### POST /v1/usdt-bsc/submit-send

Submit a signed direct-send request for sponsorship.

**Request:**
```json
{
  "correlationId": "unique-request-id",
  "signedRawTransaction": "0xf86f0182...",
  "signedRawTransactionHash": "0xabcd1234...",
  "chainId": 56,
  "requestExpiry": 1710511200,
  "expectedTargetContract": "0x1234567890...",
  "expectedMethodSelector": "0x12345678",
  "expectedTokenAddress": "0x55d398326f99059fF775485246999027B3197955"
}
```

**Success Response (202 Accepted):**
```json
{
  "status": "accepted",
  "submissionId": "sub-uuid",
  "correlationId": "unique-request-id",
  "txHash": "0x...",
  "lifecycleState": "submitted"
}
```

**Failure Response (400):**
```json
{
  "status": "rejected",
  "correlationId": "unique-request-id",
  "failureCode": "SPONSOR_UNAVAILABLE",
  "errorMessage": "Sponsor has insufficient balance"
}
```

### GET /v1/usdt-bsc/status/:correlationId

Get submission status.

**Response:**
```json
{
  "status": "accepted",
  "correlationId": "unique-request-id",
  "submissionId": "sub-uuid",
  "txHash": "0x...",
  "lifecycleState": "confirmed"
}
```

### GET /health

Health check endpoint.

### GET /ready

Kubernetes-style readiness probe.

## Failure Codes

The service returns typed failure codes for UI and retry logic:

- **WRONG_CHAIN**: Invalid chain ID (not 56 or 97)
- **SPONSOR_UNAVAILABLE**: Sponsor has insufficient balance or RPC error
- **ROUTER_ALLOWANCE_MISSING**: User hasn't approved router contract
- **INSUFFICIENT_USDT_BALANCE**: User lacks USDT for amount + fee
- **TOKEN_CONFIG_MISMATCH**: Wrong USDT token address
- **POLICY_REJECTED**: Transaction validation or signature check failed
- **REQUEST_EXPIRED**: Request timestamp is in the past
- **DUPLICATE_REQUEST**: Same signed transaction hash already submitted
- **SUBMISSION_FAILED**: Failed to broadcast to blockchain

## Submission Lifecycle States

1. **submission_pending**: Accepted, awaiting blockchain submission
2. **submitted**: Successfully sent to blockchain
3. **chain_pending**: Transaction in mempool or pending confirmation
4. **confirmed**: Transaction mined with success status
5. **submission_failed**: Failed to broadcast to blockchain
6. **chain_failed**: Transaction mined with failure status
7. **expired**: Request timestamp exceeded

## Setup and Deployment

### Prerequisites

- Node.js 20+
- PostgreSQL 13+
- Redis 7+ (optional, for distributed rate limiting)

### Local Development

1. **Copy environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Update configuration in .env**

3. **Start services with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

4. **Run database migrations:**
   ```bash
   psql -h localhost -U sponsor -d sponsor_service -f db/schema.sql
   ```

5. **Start the service:**
   ```bash
   npm run dev
   ```

6. **Verify it's running:**
   ```bash
   curl http://localhost:3001/health
   ```

### Docker Deployment

**Build image:**
```bash
docker build -f src/sponsor-service/Dockerfile -t sponsor-service:latest .
```

**Run container:**
```bash
docker run \
  -e DB_HOST=postgres \
  -e DB_USER=sponsor \
  -e DB_PASSWORD=secure_password \
  -e BSC_MAINNET_SPONSOR_ADDRESS=0x... \
  -p 3001:3001 \
  sponsor-service:latest
```

**With docker-compose:**
```bash
cd src/sponsor-service
docker-compose up -d
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sponsor-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: sponsor-service
  template:
    metadata:
      labels:
        app: sponsor-service
    spec:
      containers:
      - name: sponsor-service
        image: sponsor-service:latest
        ports:
        - containerPort: 3001
        env:
        - name: DB_HOST
          value: postgres.default.svc.cluster.local
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: sponsor-service-secrets
              key: db-user
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /ready
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 10
```

## Testing

**Run unit tests:**
```bash
npm run test
```

**Test specific service:**
```bash
npm run test src/sponsor-service/__tests__/submit-send.service.test.ts
```

**Test coverage:**
```bash
npm run test -- --coverage
```

## Monitoring and Observability

### Health Endpoints

- `GET /health` - Basic health check
- `GET /ready` - Kubernetes readiness probe

### Database Queries

Monitor submission pipeline:
```sql
SELECT lifecycle_state, COUNT(*) FROM submissions
GROUP BY lifecycle_state;
```

Check pending confirmations:
```sql
SELECT * FROM pending_submissions
WHERE confirmation_checked_at < NOW() - INTERVAL '5 minutes';
```

View treasury events:
```sql
SELECT event_type, COUNT(*), SUM(CAST(amount_atomic AS numeric))
FROM treasury_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type;
```

### Metrics to Track

- Request rate (req/sec)
- Accepted vs rejected ratio
- Average confirmation time
- Failure rates by code
- Sponsor balance trends
- Database connection pool utilization

## Security Considerations

1. **Never store private keys** - Only signed transactions are submitted
2. **Signature verification** - All transactions validated before submission
3. **Rate limiting** - Prevents abuse and DDoS
4. **Database transactions** - Atomic submission + event recording
5. **Input validation** - All fields validated before processing
6. **Environment secrets** - Use `.env` with proper access controls
7. **HTTPS in production** - All endpoints must use TLS
8. **CORS configuration** - Restrict to known frontend origins

## Performance Optimization

### Database
- Indexes on `correlation_id`, `signed_raw_transaction_hash`, `chain_id`
- Partitioning by `created_at` for large tables
- Connection pooling (20 max by default)

### Caching
- In-memory sponsor balance cache (with TTL)
- Redis for distributed rate limiting
- Transaction receipt caching (1-3 seconds)

### Async Processing
- Confirmation polling as background job
- Expired submission cleanup as scheduled task
- Treasury event batch aggregation

## Troubleshooting

### Database Connection Issues
```bash
# Test database connection
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1"
```

### RPC Connection Issues
```bash
# Test RPC endpoint
curl -X POST $BSC_MAINNET_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

### Confirmation Polling Stuck
```sql
-- Check pending submissions older than 30 minutes
SELECT * FROM pending_submissions
WHERE created_at < NOW() - INTERVAL '30 minutes';
```

## Maintenance Tasks

### Daily
- Monitor pending submission queue
- Check sponsor balance
- Review rate limit hits

### Weekly
- Analyze failure patterns
- Review database performance
- Clean up old rate limit records

### Monthly
- Archive confirmed submissions
- Generate treasury reconciliation report
- Review and update network configurations

## Contributing

See main project CONTRIBUTING.md for guidelines.

## License

See main project LICENSE.
