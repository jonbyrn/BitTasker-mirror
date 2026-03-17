# USDT-BSC Implementation - Action Plan for Production Readiness

**Status:** Conditional Go for Testnet | Hold for Mainnet
**Overall Confidence:** 72%
**Last Updated:** March 15, 2026

---

## Critical Path to Mainnet (3-4 weeks)

### Phase 1: Security Hardening (Week 1)

#### 1.1 Upgrade wallet-core security 🔴 CRITICAL

**Priority:** P0 (Blocking mainnet)
**Effort:** 8-12 hours
**Owner:** DevOps/Security

**Action Items:**

```bash
# Step 1: Create wallet-core security fixes
1. Fix WebSocket JSON parsing (wallet-core/src/swaps/boltz/WebSocketClient.ts)
   - Add try-catch around JSON.parse()
   - Log parse errors
   - Disconnect on parse failure

2. Add address validation (ReverseSwapService, ChainSwapService)
   - Add ethers.isAddress() checks before API calls
   - Throw validation error with clear message
   - Unit test new validation

3. Fix API key exposure (BSCTransactions.ts)
   - Move apikey from URL to Authorization header
   - Update fetch call to use headers
   - Test with real API

4. Reduce sensitive logging
   - Remove console.log of addresses in production
   - Use debug library instead
   - Redact sensitive fields
```

**Verification:**

- [ ] All PRs merged to wallet-core
- [ ] NPM package published with fixes
- [ ] BitTasker upgraded to new version
- [ ] Security audit passes

---

#### 1.2 Implement USDT contract validation ⚠️ HIGH

**Priority:** P1 (Must before staging)
**Effort:** 2-3 hours
**Owner:** Engineering

**Current Issue:**

```typescript
// src/lib/utils/escrow/v1/createBscEscrow.ts
const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
// No validation that this is actually USDT
```

**Action Items:**

```typescript
// Create: src/lib/utils/escrow/v1/validateUsdtContract.ts
export async function validateUsdtContract(
	address: string,
	signer: ethers.Signer
): Promise<{ isValid: boolean; error?: string }> {
	try {
		const contract = new ethers.Contract(address, USDT_ABI, signer);

		// Verify it's USDT by checking name()
		const name = await contract.name();
		const symbol = await contract.symbol();

		if (symbol !== 'USDT') {
			return { isValid: false, error: `Expected USDT but got ${symbol}` };
		}

		return { isValid: true };
	} catch (error) {
		return { isValid: false, error: 'Failed to validate USDT contract' };
	}
}
```

**Integration:**

```typescript
// In createBscEscrow - call validation
const validation = await validateUsdtContract(contractAddress, signer);
if (!validation.isValid) {
	throw new EscrowCreationError(validation.error);
}
```

**Testing:**

```typescript
// Add tests for mainnet USDT address
it('should validate mainnet USDT address', async () => {
	const result = await validateUsdtContract(USDT_ADDRESS_MAINNET, mockSigner);
	expect(result.isValid).toBe(true);
});

it('should reject fake USDT address', async () => {
	const result = await validateUsdtContract('0x' + 'f'.repeat(40), mockSigner);
	expect(result.isValid).toBe(false);
});
```

---

#### 1.3 Set up monitoring & alerting ⚠️ HIGH

**Priority:** P1 (Must before staging)
**Effort:** 16-20 hours
**Owner:** DevOps

**Components to Implement:**

1. **Error Tracking (Sentry)**

   ```
   Installation:
   - npm install @sentry/sveltekit
   - Configure in src/app.ts
   - Set DSN from environment

   Events to track:
   - Escrow creation failures
   - Contract call errors
   - API failures
   - User validation errors

   Thresholds:
   - Error rate > 5%: Alert
   - Same error > 10 times/min: Page on call
   ```

2. **Performance Metrics (Prometheus)**

   ```
   Create: src/lib/utils/monitoring/metrics.ts

   Metrics:
   - escrow_creation_duration_seconds
   - escrow_creation_failures_total
   - contract_call_duration_seconds
   - api_call_duration_seconds
   - blockchain_rpc_latency_seconds

   Dashboard:
   - Escrow success rate (target: 99.5%)
   - Avg contract call time (target: < 2s)
   - API error rate (target: < 1%)
   ```

3. **Logging & Aggregation**

   ```
   Use existing debug library:
   - All errors logged with context
   - Structured logging for parsing
   - Sent to centralized logging (Datadog/ELK)

   Log events:
   - Escrow creation start/end
   - Contract calls with gas used
   - Payment validations
   - Error details with user ID
   ```

4. **Alerting Rules**

   ```
   Critical Alerts (page on call):
   - Error rate > 5% for 5 minutes
   - Same error > 5 times in 1 minute
   - Contract calls timing out
   - API unavailable

   Warning Alerts:
   - Error rate > 2% for 10 minutes
   - Response time > 5s
   - Payment volume unusual (spike detection)
   ```

---

### Phase 2: Code Improvements (Week 1-2)

#### 2.1 Add transaction timeout logic ⚠️ HIGH

**Priority:** P1
**Effort:** 4-5 hours
**Owner:** Engineering

**Current Issue:**

```typescript
// No timeout on contract calls
const createTx = await escrowContract.createEscrow(recipient, amount);
const receipt = await createTx.wait(); // Could hang forever
```

**Solution:**

```typescript
// Create: src/lib/utils/escrow/v1/contractCallWithTimeout.ts
export async function executeWithTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number = 30000,
	operation: string = 'Operation'
): Promise<T> {
	const timeoutPromise = new Promise<never>((_, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});

	return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutMs));
}

// Usage in createBscEscrow
const receipt = await executeWithTimeout(createTx.wait(), 30000, 'Escrow creation');
```

**Exponential Backoff:**

```typescript
export async function executeWithRetry<T>(
	fn: () => Promise<T>,
	maxRetries: number = 3
): Promise<T> {
	for (let i = 0; i < maxRetries; i++) {
		try {
			return await executeWithTimeout(fn(), 30000);
		} catch (error) {
			if (i === maxRetries - 1) throw error;

			const delayMs = Math.pow(2, i) * 1000; // 1s, 2s, 4s
			await sleep(delayMs);

			d.warn(`Retry ${i + 1}/${maxRetries} after ${delayMs}ms`, { error });
		}
	}
	throw new Error('Max retries exceeded');
}
```

---

#### 2.2 Fix fee tier hardcoding ⚠️ MEDIUM

**Priority:** P2
**Effort:** 2-3 hours
**Owner:** Engineering

**Current Issue:**

```typescript
// src/lib/utils/escrow/v1/escrowBid.ts line 53
const clientFeePercentage = FEE_TIERS[1].percentage; // Always tier 1
```

**Solution:**

```typescript
export function determineFeetier(amountUSD: number): number {
	// Tier selection based on amount
	// Lower fees for larger transactions
	if (amountUSD >= 10000) return 0; // 2%
	if (amountUSD >= 1000) return 1; // 2.5%
	if (amountUSD >= 100) return 2; // 3%
	return 3; // 3.5% default
}

// Usage
const feetier = determineFeetier(bid.amount);
const clientFeePercentage = FEE_TIERS[feetier].percentage;
```

**Configuration:**

```typescript
// Add to environment
VITE_ESCROW_FEE_TIER_STRATEGY = amount; // or 'fixed', 'user_tier', etc.
```

---

#### 2.3 Add minimum USDT amount check ⚠️ MEDIUM

**Priority:** P2
**Effort:** 1-2 hours
**Owner:** Engineering

**Implementation:**

```typescript
// src/lib/utils/helpers/validators.ts
const MINIMUM_USDT_AMOUNT = 0.01; // 1 cent
const MAXIMUM_USDT_AMOUNT = 1_000_000; // 1M USDT

export function validateUsdtAmountRange(amount: string | number): ValidationResult {
	const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

	if (numAmount < MINIMUM_USDT_AMOUNT) {
		return {
			isValid: false,
			error: `Minimum USDT amount is ${MINIMUM_USDT_AMOUNT}`
		};
	}

	if (numAmount > MAXIMUM_USDT_AMOUNT) {
		return {
			isValid: false,
			error: `Maximum USDT amount is ${MAXIMUM_USDT_AMOUNT}`
		};
	}

	return { isValid: true };
}
```

**Configuration:**

```
Environment variables:
- VITE_USDT_MIN_AMOUNT=0.01
- VITE_USDT_MAX_AMOUNT=1000000
```

---

#### 2.4 Add timezone validation ⚠️ MEDIUM

**Priority:** P2
**Effort:** 3-4 hours
**Owner:** Engineering

**Current Issue:**

```typescript
// No validation that start/completion times make sense
const startTime = bidEscrowDetails.estimatedStartTime;
const completionTime = bidEscrowDetails.estimatedCompletionTime;
// Could be in past, too far future, or invalid
```

**Solution:**

```typescript
// Create: src/lib/utils/helpers/timeValidation.ts
export interface TimeValidationResult {
	isValid: boolean;
	errors: string[];
}

export function validateEscrowTimes(
	startTime: number, // Unix seconds
	completionTime: number // Unix seconds
): TimeValidationResult {
	const errors: string[] = [];
	const now = Math.floor(Date.now() / 1000);

	// Validate start time
	if (startTime < now) {
		errors.push('Start time cannot be in the past');
	}

	// Validate completion time
	if (completionTime <= startTime) {
		errors.push('Completion time must be after start time');
	}

	// Validate maximum duration (6 months)
	const maxDurationSeconds = 180 * 24 * 60 * 60; // 6 months
	if (completionTime - startTime > maxDurationSeconds) {
		errors.push('Duration cannot exceed 6 months');
	}

	// Validate future bound (not more than 1 year out)
	const maxFutureSeconds = 365 * 24 * 60 * 60; // 1 year
	if (startTime > now + maxFutureSeconds) {
		errors.push('Start time cannot be more than 1 year in future');
	}

	return {
		isValid: errors.length === 0,
		errors
	};
}
```

---

#### 2.5 Implement API rate limit handling ⚠️ MEDIUM

**Priority:** P2
**Effort:** 4-6 hours
**Owner:** Engineering

**Current Issue:**

```typescript
// No exponential backoff or deduplication
const url = `${explorerApiUrl}/addresses/${userAddress}/transactions`;
const response = await fetch(url);
// If Blockscout rate limits (5 req/sec), will fail
```

**Solution:**

```typescript
// Create: src/lib/utils/api/rateLimitHandler.ts
class RateLimitHandler {
	private inFlightRequests = new Map<string, Promise<any>>();
	private lastRequestTime = new Map<string, number>();
	private minRequestInterval = 200; // ms between requests to same endpoint

	async executeWithRateLimit<T>(url: string, fn: () => Promise<T>): Promise<T> {
		// Return in-flight request if already executing
		if (this.inFlightRequests.has(url)) {
			return this.inFlightRequests.get(url)!;
		}

		// Rate limit check
		const lastTime = this.lastRequestTime.get(url) || 0;
		const timeSinceLastRequest = Date.now() - lastTime;
		if (timeSinceLastRequest < this.minRequestInterval) {
			await sleep(this.minRequestInterval - timeSinceLastRequest);
		}

		// Execute with exponential backoff
		const promise = this.executeWithExponentialBackoff(fn);
		this.inFlightRequests.set(url, promise);

		try {
			return await promise;
		} finally {
			this.lastRequestTime.set(url, Date.now());
			this.inFlightRequests.delete(url);
		}
	}

	private async executeWithExponentialBackoff<T>(
		fn: () => Promise<T>,
		maxRetries: number = 3
	): Promise<T> {
		for (let i = 0; i < maxRetries; i++) {
			try {
				return await fn();
			} catch (error) {
				if (i === maxRetries - 1) throw error;

				// Check if error is rate limit
				if (error instanceof Error && error.message.includes('429')) {
					const delayMs = Math.pow(2, i + 1) * 1000; // 2s, 4s, 8s
					await sleep(delayMs);
				} else {
					throw error;
				}
			}
		}
		throw new Error('Max retries exceeded');
	}
}

export const rateLimitHandler = new RateLimitHandler();
```

**Usage:**

```typescript
const transactions = await rateLimitHandler.executeWithRateLimit(url, () =>
	fetch(url).then((r) => r.json())
);
```

---

### Phase 3: Documentation (Week 2)

#### 3.1 Create deployment guide ⚠️ HIGH

**Priority:** P1
**Effort:** 4-6 hours
**Owner:** DevOps/Engineering

**File:** `docs/DEPLOYMENT.md`

**Contents:**

````markdown
# USDT-BSC Deployment Guide

## Pre-Deployment Checklist

### Environment Configuration

- [ ] All required environment variables set
  - VITE_BSC_ESCROW_CONTRACT_ADDRESS
  - VITE_USDT_MIN_AMOUNT
  - VITE_USDT_MAX_AMOUNT
  - Other required vars...

### Contract Verification

- [ ] Contract address matches expected address
- [ ] Contract ABI loaded successfully
- [ ] Contract has sufficient funds for gas

### Feature Flags

- [ ] USDT payments enabled in config
- [ ] Testnet/mainnet mode correct
- [ ] Sponsor service configured

## Deployment Steps

1. Build:
   ```bash
   npm run build:production
   ```
````

2. Verify build:

   ```bash
   npm run test:unit
   npm run test:e2e
   ```

3. Deploy:

   ```bash
   wrangler deploy --env production
   ```

4. Verify deployment:
   - Test payment flow on staging
   - Check monitoring for errors
   - Verify transaction history loads

## Rollback Procedures

See INCIDENT_RESPONSE.md for detailed procedures.

Quick rollback:

```bash
git revert HEAD
npm run build:production
wrangler deploy --env production
```

## Post-Deployment Verification

- [ ] No errors in monitoring
- [ ] Transactions completing successfully
- [ ] Balance calculations correct
- [ ] Events being published to Nostr

````

---

#### 3.2 Create incident response guide ⚠️ HIGH
**Priority:** P1
**Effort:** 6-8 hours
**Owner:** Operations/Engineering

**File:** `docs/INCIDENT_RESPONSE.md`

**Contents:**
```markdown
# Incident Response Runbook

## Severity Classification

### Critical (Page on-call immediately)
- Contract compromised or exploited
- User funds stuck and unrecoverable
- Payment service completely down
- Data breach or security incident

### High (Alert within 15 minutes)
- Payment failures > 5% for > 5 minutes
- Sponsor service unavailable
- Database unavailable
- API key exposed

### Medium (Alert within 1 hour)
- Payment failures > 1% for > 10 minutes
- Slow performance (> 5s response time)
- Partial feature outage

### Low (Alert within business hours)
- Minor bugs
- Documentation issues
- Performance degradation

## Response Procedures

### Payment Service Down

**Detection:**
- Error rate spike in monitoring
- Users reporting failed payments

**Immediate Actions (0-5 min):**
1. Check monitoring dashboard
2. Verify Sponsor service status
3. Check Blockscout API status
4. Disable USDT payments: Set VITE_USDT_PAYMENTS_ENABLED=false
5. Notify support team
6. Post status update

**Diagnosis (5-15 min):**
1. Check recent logs in Sentry
2. Identify specific error
3. Determine if temporary or persistent
4. Estimate recovery time

**Recovery (15-60 min):**
- If temporary: Wait and monitor
- If persistent: Deploy fix or rollback
- Re-enable USDT payments
- Verify success rate

**Follow-up:**
- Schedule post-mortem
- Update runbook
- Add monitoring to prevent recurrence

### Contract Compromise

**Detection:**
- Unusual transaction patterns
- Large unexpected transfers
- Users reporting missing funds

**Immediate Actions:**
1. CRITICAL: Disable USDT payments immediately
2. Halt escrow creation
3. Page on-call security team
4. Notify executive team

**Investigation:**
1. Review contract code and events
2. Identify vulnerability or exploit
3. Estimate damage
4. Contact blockchain security firm if needed

**Recovery:**
1. Deploy emergency contract update (if available)
2. Or implement workaround
3. Communicate with users
4. Reimburse affected users if necessary

### User Funds Stuck in Escrow

**Detection:**
- User support ticket
- Monitoring alert

**Immediate Actions:**
1. Verify funds are actually stuck
2. Identify which escrow contract
3. Check if it's timing/permission issue
4. Assign to on-call engineer

**Resolution:**
1. Call releaseEscrow() or acceptTask() if possible
2. Or request contract owner to admin-release
3. Verify funds received
4. Follow up with user

## Contact List

- On-call Engineer: [Page via PagerDuty]
- Security Team: [Contact list]
- DevOps: [Contact list]
- Executive: [Contact list]

## Communication Templates

[Example templates for each incident type]
````

---

#### 3.3 Create troubleshooting guide ⚠️ MEDIUM

**Priority:** P2
**Effort:** 4-5 hours
**Owner:** Support/Engineering

**File:** `docs/TROUBLESHOOTING.md`

---

### Phase 4: Testing & Validation (Week 2-3)

#### 4.1 Add race condition tests ⚠️ HIGH

**Priority:** P1
**Effort:** 6-8 hours
**Owner:** Engineering

**Test:** `src/lib/tests/integration/escrow-race-conditions.test.ts`

```typescript
describe('Escrow race conditions', () => {
  it('should handle concurrent bid acceptances', async () => {
    // Setup: Two users accept same bid simultaneously
    const bid = createTestBid();

    // Submit both acceptances
    const [result1, result2] = await Promise.allSettled([
      acceptBid(bid, user1),
      acceptBid(bid, user2)
    ]);

    // Verify: One succeeds, one fails gracefully
    expect(result1.status === 'fulfilled' || result2.status === 'fulfilled').toBe(true);
    expect(result1.status === 'rejected' || result2.status === 'rejected').toBe(true);
  });

  it('should prevent duplicate escrow creation', async () => {
    // Setup: User submits twice rapidly
    const createTx = createEscrowOnBsc({...});

    // Verify: Second submission rejected
    expect(() => submitDuplicateEscrow()).toThrow('Duplicate submission');
  });

  it('should handle concurrent fund releases', async () => {
    // Verify: Multiple release calls don't double-spend
  });
});
```

---

#### 4.2 Add load testing ⚠️ MEDIUM

**Priority:** P2
**Effort:** 8-10 hours
**Owner:** DevOps/Engineering

**File:** `scripts/load-test.js` (using k6)

```javascript
import http from 'k6/http';
import { check } from 'k6';

export let options = {
	stages: [
		{ duration: '30s', target: 100 }, // Ramp up
		{ duration: '1m', target: 100 }, // Stay at 100
		{ duration: '30s', target: 200 }, // Spike to 200
		{ duration: '1m', target: 200 }, // Stay at 200
		{ duration: '30s', target: 0 } // Ramp down
	],
	thresholds: {
		http_req_duration: ['p(95)<2000'], // 95th percentile under 2s
		http_req_failed: ['rate<0.1'] // Error rate < 0.1%
	}
};

export default function () {
	// Test 1: Create escrow
	const createResponse = http.post(
		'https://api.example.com/escrow/create',
		JSON.stringify({ amount: 100, recipient: '0x...' }),
		{ headers: { 'Content-Type': 'application/json' } }
	);

	check(createResponse, {
		'escrow creation status is 200': (r) => r.status === 200,
		'escrow creation time < 2s': (r) => r.timings.duration < 2000
	});

	// Test 2: Get balance
	const balanceResponse = http.get('https://api.example.com/balance');
	check(balanceResponse, {
		'balance retrieval successful': (r) => r.status === 200
	});
}
```

**Run:**

```bash
k6 run scripts/load-test.js
```

---

### Phase 5: Security Review (Week 3)

#### 5.1 Internal security audit ⚠️ MEDIUM

**Priority:** P2
**Effort:** 8-12 hours
**Owner:** Security/Senior Engineer

**Checklist:**

```
[ ] Code review for common vulnerabilities
  [ ] Reentrancy in contract interactions
  [ ] Integer overflow/underflow
  [ ] Unvalidated external calls
  [ ] Missing input validation

[ ] Cryptography review
  [ ] Proper use of ethers.Signer
  [ ] No hardcoded secrets
  [ ] Proper key derivation

[ ] Smart contract review
  [ ] Contract audit results reviewed
  [ ] Known vulnerabilities checked
  [ ] Permission model reviewed

[ ] Third-party dependencies
  [ ] Vulnerability scan (npm audit)
  [ ] Outdated dependencies identified
  [ ] License compliance
```

---

## Tracking & Metrics

### Completion Metrics

```
Week 1 Goals:
- [ ] wallet-core security fixes merged
- [ ] USDT contract validation implemented
- [ ] Monitoring/alerting deployed
- [ ] All critical items 80%+ complete

Week 2 Goals:
- [ ] All code improvements merged
- [ ] Deployment guide complete
- [ ] Incident response guide complete
- [ ] 90%+ of action items complete

Week 3 Goals:
- [ ] Load tests passed (95th p < 2s)
- [ ] Security audit passed
- [ ] All documentation complete
- [ ] Ready for staging deployment

Week 4 Goals:
- [ ] Staging deployment successful
- [ ] 48-hour stability run passed
- [ ] Sign-off from product/security/ops
- [ ] Ready for production deployment
```

### Risk Dashboard

| Risk                 | Status         | Owner    | Target Date |
| -------------------- | -------------- | -------- | ----------- |
| wallet-core security | 🟡 In Progress | DevOps   | Mar 22      |
| Monitoring setup     | 🟡 In Progress | DevOps   | Mar 22      |
| Code improvements    | 🟡 In Progress | Eng      | Mar 23      |
| Documentation        | 🟡 In Progress | Ops      | Mar 23      |
| Testing              | 🟡 Planned     | QA       | Mar 30      |
| Security audit       | 🟡 Planned     | Security | Mar 30      |
| Staging deploy       | ⚪ Planned     | DevOps   | Apr 2       |
| Production deploy    | ⚪ Planned     | DevOps   | Apr 6       |

---

## Success Criteria for Each Phase

### Testnet Deployment (Ready Now)

- [x] All code compiles
- [x] Unit tests pass
- [x] E2E scenarios pass
- [x] No critical bugs found
- [ ] Basic monitoring deployed

### Staging Deployment (1 week)

- [ ] All critical fixes merged
- [ ] Code improvements tested
- [ ] Monitoring/alerting operational
- [ ] Deployment procedures documented
- [ ] Incident response procedures documented

### Production Deployment (3-4 weeks)

- [ ] All above complete
- [ ] Load testing passed
- [ ] Security audit passed
- [ ] 48-hour stability run
- [ ] Executive sign-off
- [ ] Legal/compliance review complete

---

## Questions & Decisions Needed

1. **Fee tier strategy**: Based on amount or user profile?
2. **Rate limiting**: What's acceptable API call frequency?
3. **Timeout values**: 30s for contract calls or different?
4. **Maximum amount**: Cap on single escrow?
5. **Monitoring tool**: Prometheus/Grafana or Datadog?
6. **On-call rotation**: Who will handle incidents?

---

## Estimated Timeline

```
Current Week (Mar 15-21):
  Week 1: Critical fixes, monitoring setup
  Hours: 40-50 (4-5 engineers + 1 DevOps)

Next Week (Mar 22-28):
  Week 2: Code improvements, documentation
  Hours: 30-40 (3-4 engineers + 1 operations)

Week 3 (Mar 29 - Apr 4):
  Week 3: Testing, security audit
  Hours: 40-50 (2-3 engineers + security)

Week 4 (Apr 5-11):
  Week 4: Staging testing, production prep
  Hours: 20-30 (2 engineers + DevOps)

Total Effort: 130-170 hours (~3-4 weeks)
Team Size: 4-6 people
```

---

## Sign-Off Criteria

**Before Testnet:**

- Product Lead: Review features
- Engineering Lead: Code review complete
- QA Lead: Test plan approved

**Before Staging:**

- DevOps Lead: Monitoring operational
- Security Lead: Code audit passed
- Operations Lead: Runbooks ready

**Before Production:**

- CTO: Architecture approved
- Security Officer: Security audit passed
- COO: Operations ready
- Legal: Compliance approved

---

**Document Owner:** Engineering Lead
**Last Updated:** March 15, 2026
**Next Review:** After each phase completion
