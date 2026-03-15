# Sponsor Service Quick Start

## 5-Minute Setup

### Prerequisites
- Docker and Docker Compose installed
- Node.js 20+ (for local development)

### Option 1: Docker Compose (Recommended)

```bash
cd src/sponsor-service
docker-compose up -d
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)
- Sponsor Service (port 3001)

Verify it's running:
```bash
curl http://localhost:3001/health
# Should return: {"status":"ok","timestamp":"...","version":"1.0.0"}
```

### Option 2: Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp src/sponsor-service/.env.example .env
   # Edit .env with your database and network settings
   ```

3. **Initialize database:**
   ```bash
   npm run sponsor:init-db
   ```

4. **Start the service:**
   ```bash
   npm run sponsor:dev
   ```

5. **In another terminal, start the confirmation poller:**
   ```bash
   npm run sponsor:poll
   ```

## Testing the API

### 1. Submit a Direct-Send Request

```bash
curl -X POST http://localhost:3001/v1/usdt-bsc/submit-send \
  -H "Content-Type: application/json" \
  -d '{
    "correlationId": "test-'"$(date +%s)"'",
    "signedRawTransaction": "0xf86f01821234567890abcdef",
    "signedRawTransactionHash": "0xabcdef1234567890abcdef1234567890abcdef12",
    "chainId": 97,
    "requestExpiry": '"$(( $(date +%s) + 3600 ))"',
    "expectedTargetContract": "0x1234567890123456789012345678901234567890",
    "expectedMethodSelector": "0x12345678",
    "expectedTokenAddress": "0x337610d27ae4ca0cd180003c4de79d4b47663363"
  }'
```

Expected response (202 Accepted):
```json
{
  "status": "accepted",
  "submissionId": "550e8400-e29b-41d4-a716-446655440000",
  "correlationId": "test-1234567890",
  "txHash": "0x...",
  "lifecycleState": "submitted"
}
```

### 2. Check Submission Status

```bash
curl http://localhost:3001/v1/usdt-bsc/status/test-1234567890
```

Expected response:
```json
{
  "status": "accepted",
  "correlationId": "test-1234567890",
  "submissionId": "550e8400-e29b-41d4-a716-446655440000",
  "txHash": "0x...",
  "lifecycleState": "confirmed"
}
```

### 3. Check Service Health

```bash
curl http://localhost:3001/health
curl http://localhost:3001/ready
```

## File Structure

```
src/sponsor-service/
├── api/
│   └── routes.ts                 # Express routes
├── config/
│   └── networks.ts              # Network configurations
├── db/
│   ├── connection.ts            # Database pool
│   ├── schema.sql               # Database schema
│   ├── submissions.repository.ts # Submission queries
│   └── treasury-events.repository.ts # Event queries
├── middleware/
│   └── rate-limiter.ts          # Rate limiting
├── models/
│   └── types.ts                 # TypeScript types
├── services/
│   ├── blockchain.service.ts    # Blockchain interaction
│   └── submit-send.service.ts   # Business logic
├── utils/
│   └── signature-verification.ts # Signature checks
├── workers/
│   └── confirmation-poller.ts   # Background jobs
├── scripts/
│   ├── init-db.ts               # Database setup
│   └── verify-startup.ts        # Health checks
├── __tests__/
│   ├── submit-send.service.test.ts
│   └── api.integration.test.ts
├── Dockerfile                    # Docker image
├── docker-compose.yml           # Docker Compose setup
├── .env.example                 # Environment template
├── index.ts                     # Main entry point
├── README.md                    # Full documentation
└── QUICKSTART.md               # This file
```

## Common Tasks

### View Database
```bash
# Connect to PostgreSQL
psql -h localhost -U sponsor -d sponsor_service

# See all submissions
SELECT correlation_id, status, lifecycle_state, created_at FROM submissions;

# See pending submissions
SELECT * FROM pending_submissions;

# Count by status
SELECT lifecycle_state, COUNT(*) FROM submissions GROUP BY lifecycle_state;
```

### View Logs
```bash
# With Docker Compose
docker-compose logs -f sponsor-service

# Local development
npm run sponsor:dev
```

### Run Tests
```bash
# All tests
npm test

# Sponsor service only
npm test -- src/sponsor-service

# With coverage
npm test -- --coverage
```

### Reset Database
```bash
# With Docker Compose
docker-compose down -v
docker-compose up -d

# Local
npm run sponsor:init-db
```

## Environment Variables

Key variables for production deployment:

```env
# Server
SPONSOR_SERVICE_PORT=3001
NODE_ENV=production

# Database (required)
DB_USER=sponsor
DB_PASSWORD=<secure-password>
DB_HOST=db.example.com
DB_PORT=5432
DB_NAME=sponsor_service

# BSC Testnet
BSC_TESTNET_RPC_URL=https://data-seed-prebsc.binance.org:8545
BSC_TESTNET_ROUTER_ADDRESS=0x...
BSC_TESTNET_SPONSOR_ADDRESS=0x...
BSC_TESTNET_USDT_ADDRESS=0x337610d27ae4ca0cd180003c4de79d4b47663363

# BSC Mainnet (optional, for staging)
BSC_MAINNET_RPC_URL=https://bsc-dataseed.binance.org
BSC_MAINNET_ROUTER_ADDRESS=0x...
BSC_MAINNET_SPONSOR_ADDRESS=0x...
```

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 3001
lsof -i :3001

# Kill it
kill -9 <PID>
```

### Database Connection Error
```bash
# Check PostgreSQL is running
docker-compose ps

# Check connection
psql -h localhost -U sponsor -d sponsor_service -c "SELECT 1"
```

### RPC Connection Error
```bash
# Test RPC endpoint directly
curl -X POST https://data-seed-prebsc.binance.org:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

## Next Steps

1. Review [README.md](./README.md) for full documentation
2. Set up continuous integration in CI/CD pipeline
3. Configure health monitoring and alerting
4. Perform load testing before production deployment
5. Set up database backups and recovery procedures

## Support

For issues or questions:
1. Check the README.md troubleshooting section
2. Review database schema in `db/schema.sql`
3. Check service logs
4. Verify environment configuration
