# USDT-BSC Feature Flags & Gradual Rollout

**Document Version:** 1.0
**Last Updated:** 2026-03-14
**Owner:** Platform Engineering
**Audience:** DevOps, Site Reliability Engineers, Product Managers

## Overview

USDT-BSC payments are deployed with a phased rollout strategy using feature flags to minimize risk and enable rapid rollback if issues arise. This document describes how feature flags work, enable gradual adoption, and provide operational control over the USDT-BSC payment system.

## Feature Flag: USDT_BSC_ENABLED

### Environment Variable Configuration

```bash
# Enable USDT-BSC payments for all users
USDT_BSC_ENABLED=true

# Disable USDT-BSC payments (default for gradual rollout)
USDT_BSC_ENABLED=false
```

### Default Behavior

By default, `USDT_BSC_ENABLED` is **disabled** (`false`) on production. This ensures:
- Only users explicitly enrolled see USDT-BSC payment options
- Existing Lightning Network payments continue to work unaffected
- No disruption to current user workflows
- Zero risk for unauthenticated features

### Runtime Toggle (No Deployment Required)

USDT-BSC can be enabled or disabled at runtime using your platform's configuration service:

```bash
# Datadog Feature Flag Example
POST /api/v1/feature-flags/usdt-bsc
{
  "enabled": true,
  "percentage": 5,
  "targeting_rules": [
    {
      "user_segment": "internal_team",
      "enabled": true
    }
  ]
}

# Or via environment variable hot-reload
# (If your deployment platform supports it)
curl -X POST https://api.bittasker.com/ops/feature-flags \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -d '{"flag": "USDT_BSC_ENABLED", "value": true}'
```

## Gradual Rollout Phases

### Phase 0: Disabled (Default)

**Status:** Pre-launch
**Duration:** Until launch approval
**Affected Users:** None

**Actions:**
- Feature is disabled in all environments
- USDT-BSC components are deployed but inactive
- Monitoring infrastructure is running
- Team conducts final testing

**Verification:**
```javascript
// Users should NOT see USDT-BSC options
if (featureFlags.isEnabled('USDT_BSC_ENABLED')) {
  // This block should NOT execute
  showUSDTBSCPaymentOptions();
}
```

---

### Phase 1: Internal Testing (0% → 5%)

**Status:** Launch
**Duration:** 2-4 hours
**Affected Users:** BitTasker internal team only (~20 users)

**Enablement:**
```javascript
USDT_BSC_ENABLED=true

// Targeting rule: Internal team only
featureFlags.targeting = {
  'USDT_BSC_ENABLED': {
    user_segment: 'internal_team',
    enabled: true,
    percentage: 100  // All internal users see it
  }
}
```

**Test Scenarios:**
- [ ] Internal team creates USDT-BSC payments
- [ ] Send/receive USDT flows complete successfully
- [ ] Balance updates reflect correctly
- [ ] Transaction history displays properly
- [ ] Escrow contracts execute without errors
- [ ] All monitoring dashboards emit expected metrics

**Success Metrics:**
- 100% transaction success rate
- Zero error logs related to USDT-BSC
- Sponsor balance stable
- No user complaints

**Rollback Trigger:** Any P0 error; error rate > 10%

---

### Phase 2: Early Adopters (5%)

**Status:** Scaling
**Duration:** 4-8 hours
**Affected Users:** ~5,000 users (5% of random sample)

**Enablement:**
```javascript
featureFlags.targeting = {
  'USDT_BSC_ENABLED': {
    percentage: 5,
    // Hash-based rollout for consistent distribution
    hash_algorithm: 'user_id_modulo_100',
    rollout_group: 'gradual'
  }
}
```

**Monitoring Focus:**
- Transaction success rate (target: >= 98%)
- Sponsor balance depletion rate
- Error distribution by failure mode
- Support ticket volume for USDT-BSC issues
- Wallet balance reconciliation

**Success Criteria:**
- >= 95% transaction success rate
- < 1% sponsor-related failures
- < 0.5% router-related failures
- Fees reconciling within 0.1%

**Escalation:** If success rate drops below 95%, pause rollout and investigate

---

### Phase 3: Broad Adoption (25%)

**Status:** Scaling
**Duration:** 4-12 hours
**Affected Users:** ~25,000 users (25% of random sample)

**Enablement:**
```javascript
featureFlags.targeting = {
  'USDT_BSC_ENABLED': {
    percentage: 25,
    hash_algorithm: 'user_id_modulo_100',
    rollout_group: 'gradual'
  }
}
```

**Monitoring Focus:**
- All Phase 2 metrics at scale
- Database query performance impact
- Smart contract gas usage patterns
- Geographic distribution of issues
- Payment method adoption rate

**Success Criteria:**
- >= 98% transaction success rate
- < 0.5% critical failures
- Database latency p95 < 500ms
- Smart contract calls executing within gas budget

**Escalation:** If metrics diverge from Phase 2, pause and investigate

---

### Phase 4: Full Rollout (100%)

**Status:** Production
**Duration:** Ongoing
**Affected Users:** All users

**Enablement:**
```javascript
featureFlags.targeting = {
  'USDT_BSC_ENABLED': {
    percentage: 100,
    rollout_group: 'default'
  }
}
```

**Monitoring:** All critical metrics remain active

**Success Metrics:**
- >= 98% transaction success rate
- Sponsor balance > 1 day supply
- Treasury fees reconciled daily
- Zero catastrophic failures

## Feature Flag Implementation

### Client-Side Check

```typescript
// src/lib/utils/features.ts
export const featureFlags = {
  isUSDTBSCEnabled(): boolean {
    const env = import.meta.env.VITE_USDT_BSC_ENABLED;
    return env === 'true' || env === true;
  },

  shouldShowUSDTPaymentOption(): boolean {
    // Only show if:
    // 1. Feature is enabled globally
    // 2. User is not on a network that doesn't support it
    // 3. Sponsor service is healthy
    return this.isUSDTBSCEnabled()
      && !userPreferences.disableUSDT
      && sponsorServiceHealth.isHealthy;
  }
};

// Usage in components
{#if featureFlags.shouldShowUSDTPaymentOption()}
  <USDTPaymentOptions />
{/if}
```

### Server-Side Enforcement

```typescript
// src/routes/api/payment/+server.ts
import { isUSDTBSCEnabled } from '$lib/utils/features';

export async function POST({ request }) {
  const { paymentMethod } = await request.json();

  // Reject USDT payments if feature flag is disabled
  if (paymentMethod === 'USDT-BSC' && !isUSDTBSCEnabled()) {
    return new Response('USDT-BSC not available', { status: 403 });
  }

  // Process payment
  return processPayment({ paymentMethod, ...rest });
}
```

### Database Feature Flag Registry

Store feature flags in a database for real-time updates without redeployment:

```sql
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(255),
  change_reason TEXT
);

CREATE TABLE feature_flag_targeting (
  id UUID PRIMARY KEY,
  flag_id UUID NOT NULL REFERENCES feature_flags(id),
  user_segment VARCHAR(255),
  percentage INTEGER CHECK (percentage >= 0 AND percentage <= 100),
  targeting_rules JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Example: Enable for 5% of random users
INSERT INTO feature_flags (name, enabled) VALUES ('USDT_BSC_ENABLED', true);

INSERT INTO feature_flag_targeting (flag_id, percentage, targeting_rules)
VALUES (
  (SELECT id FROM feature_flags WHERE name = 'USDT_BSC_ENABLED'),
  5,
  '{"hash_algorithm": "user_id_modulo_100", "rollout_group": "gradual"}'::jsonb
);
```

## Monitoring Feature Flag Impact

### Dashboard: USDT-BSC Rollout Status

Set up a Grafana dashboard to track rollout progress:

```json
{
  "dashboard": {
    "title": "USDT-BSC Rollout Status",
    "panels": [
      {
        "title": "Feature Flag Status",
        "targets": [
          {
            "expr": "feature_flag_enabled{flag=\"USDT_BSC_ENABLED\"}"
          }
        ]
      },
      {
        "title": "Percentage Rollout",
        "targets": [
          {
            "expr": "feature_flag_percentage{flag=\"USDT_BSC_ENABLED\"}"
          }
        ]
      },
      {
        "title": "Affected Users",
        "targets": [
          {
            "expr": "count(users_in_rollout_group{flag=\"USDT_BSC_ENABLED\"})"
          }
        ]
      },
      {
        "title": "Transactions by Flag State",
        "targets": [
          {
            "expr": "rate(usdt_bsc_transactions_total{feature_enabled=\"true\"}[5m])"
          },
          {
            "expr": "rate(usdt_bsc_transactions_total{feature_enabled=\"false\"}[5m])"
          }
        ]
      }
    ]
  }
}
```

### Key Metrics to Track

1. **Flag Deployment Time**
   - How long between flag change and user visibility
   - Target: < 30 seconds

2. **User Adoption Rate**
   - Percentage of exposed users actively using USDT-BSC
   - Expected: 10-15% in Phase 1, 20-30% by Phase 4

3. **Feature Success Rate**
   - Percentage of USDT transactions that complete successfully
   - Target: >= 98%

4. **Error Tracking**
   - Errors per 1000 USDT transactions
   - Track by error type (sponsor, router, user balance)

5. **Performance Impact**
   - API latency with feature enabled vs. disabled
   - Database query latency impact
   - Smart contract execution costs

## Rollback Procedure

### Fast Rollback (< 2 minutes)

```bash
# Disable the feature flag immediately
curl -X POST https://api.bitaskier.com/ops/feature-flags \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -d '{
    "flag": "USDT_BSC_ENABLED",
    "enabled": false,
    "reason": "Critical issue detected - rolling back to Phase N-1"
  }'

# Verify users no longer see USDT options
curl https://api.bitasker.com/ops/metrics/feature-flags/disabled-count \
  -H "Authorization: Bearer $OPS_TOKEN" \
  | grep USDT_BSC_ENABLED

# Confirm users seeing Lightning-only options
verify_user_experience() {
  # Check 10 random user sessions
  for user_id in $(sample_users 10); do
    session=$(get_user_session $user_id)
    assert_no_usdt_option "$session"
  done
}
verify_user_experience
```

### Full Rollback (Feature Disabled)

See **docs/rollback-procedures.md** for comprehensive rollback steps.

## Rollout Decision Framework

### Go Criteria for Each Phase

Use this checklist before advancing to the next phase:

**Phase 0 → Phase 1:**
- [ ] All P0 and P1 tests passing on testnet
- [ ] Code review completed (2+ reviewers)
- [ ] Security audit passed
- [ ] Monitoring dashboards verified
- [ ] Rollback procedure tested
- [ ] Team trained on monitoring

**Phase 1 → Phase 2:**
- [ ] 24+ hours of Phase 1 with zero critical errors
- [ ] Transaction success rate >= 99% for Phase 1 users
- [ ] Sponsor balance stable (no unexpected depletion)
- [ ] No error patterns or anomalies detected
- [ ] Support team reports zero USDT-BSC issues

**Phase 2 → Phase 3:**
- [ ] 4+ hours of Phase 2 with >= 95% success rate
- [ ] Database performance metrics stable
- [ ] Smart contract costs within budget
- [ ] Error distribution consistent with expectations
- [ ] Product team confidence in user experience

**Phase 3 → Phase 4:**
- [ ] 8+ hours of Phase 3 with >= 98% success rate
- [ ] All metrics aligned with Phase 2
- [ ] No scaling-related issues detected
- [ ] Sponsor balance > 3 days of runway
- [ ] Team confidence high, no concerns

### No-Go Criteria (Immediate Rollback)

- Error rate > 5% at any phase
- Sponsor balance depletion rate unsustainable
- Zero successful USDT-BSC transactions
- Data corruption detected
- Security vulnerability identified
- Critical smart contract failure
- Database instability

## Alerting and Escalation

### Alert Configuration

```yaml
# prometheus/alerts.yaml
- alert: USDTBSCRolloutPhaseChange
  expr: changes(feature_flag_percentage{flag="USDT_BSC_ENABLED"}[5m]) > 0
  annotations:
    summary: "USDT-BSC rollout percentage changed"
    dashboard: "https://grafana.bitaskier.com/d/usdt-bsc-rollout"

- alert: USDTBSCHighErrorRate
  expr: |
    rate(usdt_bsc_transactions_failed_total[5m]) /
    rate(usdt_bsc_transactions_total[5m]) > 0.05
  for: 5m
  annotations:
    summary: "USDT-BSC error rate exceeds 5%"
    severity: "critical"

- alert: USDTBSCZeroTransactions
  expr: |
    increase(usdt_bsc_transactions_total[1h]) == 0
    AND feature_flag_enabled{flag="USDT_BSC_ENABLED"} == 1
  for: 10m
  annotations:
    summary: "No USDT-BSC transactions in 1 hour despite feature enabled"
    severity: "critical"
```

### Escalation Path

1. **Metric Alert Triggered**
   - Prometheus fires alert
   - Slack notification to #ops-alerts

2. **Acknowledge (5 min)**
   - On-call engineer reviews metrics
   - Confirms issue is real vs. false positive
   - Pings team in Slack

3. **Investigate (10 min)**
   - Check recent deployments
   - Review error logs
   - Assess user impact

4. **Decide (5 min)**
   - Continue (if issue is non-blocking)
   - Pause rollout (disable next 5%)
   - Rollback (disable feature entirely)

5. **Execute (2 min)**
   - Update feature flag
   - Monitor metrics for improvement
   - Post-incident analysis

## Rollout Status Log

Track all rollout phase changes for audit and post-incident analysis:

```markdown
## 2026-03-15 USDT-BSC Rollout Log

### 10:00 AM UTC - Phase 0 → Phase 1
- **Enabled For:** Internal team (20 users)
- **Feature Flag:** USDT_BSC_ENABLED=true (internal_team targeting)
- **Approved By:** Sarah Chen (VP Engineering)
- **Duration:** 2 hours
- **Status:** All P0 tests passing, sponsor balance healthy

### 12:00 PM UTC - Phase 1 Complete
- **Result:** Success (100% transaction rate, zero errors)
- **User Feedback:** Positive
- **Decision:** Proceed to Phase 2
- **Approved By:** Mike Rodriguez (Platform Lead)

### 12:15 PM UTC - Phase 1 → Phase 2
- **Enabled For:** 5% random users (~5,000 users)
- **Feature Flag:** USDT_BSC_ENABLED=true (percentage: 5)
- **Start Time:** 2026-03-15 12:15 UTC
- **Expected Duration:** 4-8 hours

### 04:30 PM UTC - Phase 2 Check-in
- **Success Rate:** 97.2%
- **Sponsor Balance:** $4,200 (2.1 days of runway)
- **Error Distribution:** 1.2% sponsor-related, 0.8% user-balance related
- **Support Tickets:** 3 (all non-critical)
- **Decision:** Continue to Phase 2 completion

### 08:45 PM UTC - Phase 2 Complete
- **Final Metrics:** 98.1% success rate, $3,980 sponsor balance
- **Issues:** 1 minor router contract optimization issue (non-blocking)
- **Decision:** Proceed to Phase 3
- **Approved By:** Jennifer Park (Payments Lead)

### 09:00 PM UTC - Phase 2 → Phase 3
- **Enabled For:** 25% random users (~25,000 users)
- **Feature Flag:** USDT_BSC_ENABLED=true (percentage: 25)
```

## Operational Checklists

### Daily Rollout Checklist

Run this checklist every 4 hours during active rollout phases:

```markdown
### USDT-BSC Rollout Daily Check

**Date:** _______________
**Checked By:** _______________
**Phase:** _______________

#### Metrics (last 1 hour)
- [ ] Transaction success rate: ________% (target: >= 95%)
- [ ] Error rate: ________% (target: < 5%)
- [ ] Sponsor balance: $___________ (target: > 1 day)
- [ ] P99 API latency: _________ms (target: < 2s)

#### Alerts
- [ ] No critical alerts active
- [ ] Error logs reviewed: _____ errors (expected: < 10)
- [ ] User complaints: _____ (expected: 0-2)

#### System Health
- [ ] Smart contracts responsive
- [ ] Database query latency normal
- [ ] RPC provider healthy
- [ ] Sponsor service healthy

#### Decision
- [ ] Continue rollout
- [ ] Hold (pause at current percentage)
- [ ] Rollback (disable feature)

**Notes:** _________________________________________________________

**Approval:** _________________ (Signature)
```

## Related Documentation

- [Rollback Procedures](./rollback-procedures.md) - How to disable and recover
- [Monitoring & Alerting](./monitoring.md) - What to watch during rollout
- [Pre-Launch Checklist](./pre-launch-checklist.md) - Go/no-go criteria
- [Environment Setup](./environment-setup.md) - Configuration details

## Support & Escalation

**USDT-BSC Rollout Commander:** TBD
**Slack Channel:** #usdt-bsc-rollout
**Page On-Call:** PagerDuty Team: Platform
**War Room:** Google Meet: https://meet.google.com/usdt-bsc-incident

---

**Document History:**
- **v1.0** (2026-03-14): Initial release
- [Will be updated with rollout milestones]
