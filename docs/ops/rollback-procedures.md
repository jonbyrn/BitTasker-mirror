# USDT-BSC Rollback Procedures

**Document Version:** 1.0
**Last Updated:** 2026-03-14
**Owner:** Platform Engineering
**Audience:** DevOps, Site Reliability Engineers, On-Call Engineers

**Time to Execute:** < 15 minutes (< 5 minutes for feature flag only)

## Overview

This document provides step-by-step procedures for rolling back the USDT-BSC payment system in case of critical issues. Rollbacks can happen at multiple levels, from simple feature flag disabling to full code reversion.

## Rollback Triggers

### Automatic (Feature Flag Disabled Immediately)

- **Error Rate > 5%** for more than 5 minutes
- **Zero successful transactions** for more than 10 minutes (despite flag enabled)
- **Unrecoverable data corruption** detected
- **Critical security vulnerability** identified
- **Sponsor service completely unavailable** (< 1% uptime)

### Manual (On-Call Engineer Decision)

- Cascading failures in dependent systems
- Unexplained user complaints (> 10 in 1 hour)
- Smart contract unexpected behavior
- Database instability or performance degradation
- Unable to identify root cause within 15 minutes of alert

---

## Quick Disable (< 2 minutes)

**Use this procedure if you need to immediately stop USDT-BSC without investigating.**

### Step 1: Disable Feature Flag

```bash
#!/bin/bash
# Requires: OPS_TOKEN with feature-flag:write permission

curl -X POST https://api.bitaskier.com/ops/feature-flags \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "flag": "USDT_BSC_ENABLED",
    "enabled": false,
    "reason": "Rollback: [BRIEF REASON]",
    "incident_id": "inc-'"$(date +%s)"'",
    "rolled_back_by": "'$USER'",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "allow_re_enable_after": "'$(date -u -d '+30 minutes' +%Y-%m-%dT%H:%M:%SZ)'"
  }' \
  | jq .

echo "✓ Feature flag disabled at $(date)"
```

### Step 2: Verify Disable (< 30 seconds)

```bash
#!/bin/bash
# Verify users no longer see USDT-BSC payment options

# Check feature flag status
curl https://api.bitaskier.com/ops/feature-flags/USDT_BSC_ENABLED \
  -H "Authorization: Bearer $OPS_TOKEN" \
  | jq '.enabled'  # Should output: false

# Verify sample users don't see USDT options
verify_users_see_lightning_only() {
  for user_id in {1..5}; do
    user=$(curl "https://api.bitaskier.com/api/users/$user_id/payment-methods" \
      -H "Authorization: Bearer $OPS_TOKEN")

    if echo "$user" | jq -e '.methods[] | select(.type == "USDT-BSC")' > /dev/null; then
      echo "ERROR: User $user_id still sees USDT-BSC!"
      return 1
    fi
  done
  echo "✓ All sampled users see Lightning-only options"
  return 0
}

verify_users_see_lightning_only
```

### Step 3: Post Notifications

```bash
#!/bin/bash

# Notify #ops-incidents Slack channel
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -d '{
    "channel": "#ops-incidents",
    "text": "USDT-BSC Feature Disabled",
    "attachments": [
      {
        "color": "danger",
        "title": "USDT-BSC Rollback Initiated",
        "fields": [
          {
            "title": "Time",
            "value": "'$(date)'",
            "short": true
          },
          {
            "title": "Reason",
            "value": "'"$ROLLBACK_REASON"'",
            "short": true
          },
          {
            "title": "Initiated By",
            "value": "'$USER'",
            "short": true
          },
          {
            "title": "Next Steps",
            "value": "Investigate root cause, run comprehensive tests before re-enabling",
            "short": false
          }
        ]
      }
    ]
  }'

# Page on-call engineer
pagerduty trigger \
  --service-key="$PAGERDUTY_SERVICE_KEY" \
  --description="USDT-BSC Rollback: $ROLLBACK_REASON" \
  --details='{"disabled_at": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' \
  --urgency=high
```

---

## Full Rollback Procedure (< 15 minutes)

Use this when you need to completely disable USDT-BSC and potentially revert code.

### Phase 1: Disable (0-2 minutes)

Follow **Quick Disable** steps above.

### Phase 2: Monitor Existing Transactions (2-5 minutes)

**Goal:** Ensure in-flight transactions complete or fail gracefully.

```bash
#!/bin/bash

# 1. Check for pending transactions
pending=$(curl https://api.bitaskier.com/api/transactions \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "pending",
    "payment_method": "USDT-BSC",
    "limit": 1000
  }' | jq '.total')

echo "Pending USDT-BSC transactions: $pending"

# 2. If pending transactions exist, wait for completion
if [ "$pending" -gt 0 ]; then
  echo "Waiting for pending transactions to complete (max 5 minutes)..."

  # Poll every 30 seconds
  for i in {1..10}; do
    sleep 30
    pending=$(curl https://api.bitaskier.com/api/transactions \
      -H "Authorization: Bearer $OPS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"status": "pending", "payment_method": "USDT-BSC"}' \
      | jq '.total')

    echo "Pending transactions: $pending (check $i/10)"

    if [ "$pending" -eq 0 ]; then
      echo "✓ All pending transactions resolved"
      break
    fi
  done
else
  echo "✓ No pending USDT-BSC transactions"
fi

# 3. Log any failed transactions for investigation
failed=$(curl https://api.bitaskier.com/api/transactions \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -d '{"status": "failed", "payment_method": "USDT-BSC", "since": "'$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)'"}' \
  | jq '.data')

echo "Failed transactions in last 10 minutes:"
echo "$failed" | jq '.'
```

### Phase 3: Verify System State (5-8 minutes)

**Goal:** Ensure all metrics return to normal.

```bash
#!/bin/bash

echo "=== Verifying System State After Rollback ==="

# 1. Check transaction counts
echo "Transaction counts (last 5 minutes):"
curl https://api.bitaskier.com/api/metrics \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -d '{"metric": "transactions_total", "window": "5m", "group_by": "payment_method"}' \
  | jq '.data[] | select(.method != "USDT-BSC")'

# 2. Check error rates declining
echo "Error rate trend:"
curl https://api.bitaskier.com/api/metrics/error-rate \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -d '{"window": "5m", "granularity": "1m"}' \
  | jq '.data'

# 3. Verify wallet balances accurate
echo "Running balance reconciliation..."
curl -X POST https://api.bitaskier.com/api/internal/wallet-reconciliation \
  -H "Authorization: Bearer $OPS_TOKEN" \
  | jq '.reconciliation_status'

# 4. Check database query performance
echo "Database latency:"
curl https://api.bitaskier.com/api/metrics/db-latency \
  -H "Authorization: Bearer $OPS_TOKEN" \
  | jq '.percentiles'

# 5. Verify support system metrics
echo "Support ticket metrics (last 1 hour):"
curl https://api.bitaskier.com/api/support/metrics \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -d '{"time_window": "1h", "tag": "USDT-BSC"}' \
  | jq '.data'
```

### Phase 4: Verification Checklist (8-12 minutes)

Run this checklist to confirm rollback was successful:

```markdown
## USDT-BSC Rollback Verification Checklist

**Rollback Start Time:** ________________
**Completed By:** ________________

### Feature Flag
- [ ] USDT_BSC_ENABLED returns `false`
- [ ] Users no longer see USDT-BSC payment options
- [ ] New payment requests default to Lightning Network

### Transaction Status
- [ ] All pending USDT-BSC transactions completed or failed gracefully
- [ ] No orphaned transactions in database
- [ ] Transaction history accurately reflects state
- [ ] Failed transactions logged for investigation

### System Health
- [ ] Error rate returning to normal (< 0.5%)
- [ ] API response times normal (p99 < 500ms)
- [ ] Database query performance normal
- [ ] Smart contract calls stopped (no new USDT events)

### Data Integrity
- [ ] Wallet balances match blockchain (reconciliation)
- [ ] Treasury balance matches ledger
- [ ] Sponsor balance accurate
- [ ] No missing or corrupted records

### User Communication
- [ ] #ops-incidents notified
- [ ] On-call team notified
- [ ] Product team notified
- [ ] Support team notified (prep for user questions)

### Documentation
- [ ] Rollback logged in changelog
- [ ] Incident timestamp recorded
- [ ] Root cause documented (preliminary)
- [ ] Links to error logs captured

**Sign-Off:** _________________ (Lead Engineer)
```

### Phase 5: Post-Incident Analysis (12-15 minutes)

```bash
#!/bin/bash

# Create incident report template
cat > /tmp/usdt-bsc-incident-$(date +%s).md << 'EOF'
# USDT-BSC Incident Report

## Summary
- **Time to Detect:** _____ minutes
- **Time to Disable:** _____ minutes
- **Total Impact:** _____ minutes
- **Users Affected:** _____ (estimated)

## Timeline

| Time | Event | Owner |
|------|-------|-------|
| 2026-03-15 14:23 UTC | Alert fired | Prometheus |
| 2026-03-15 14:25 UTC | Acknowledged | On-call |
| 2026-03-15 14:27 UTC | Rollback initiated | On-call |
| 2026-03-15 14:32 UTC | Rollback verified | On-call |

## Root Cause Analysis

**What went wrong?**
[To be filled by investigation team]

**Why wasn't it caught in testing?**
[To be filled by testing team]

**What preventive measures are needed?**
[To be filled by engineering team]

**How to prevent recurrence?**
[To be filled by engineering team]

## Recommended Actions

- [ ] Action 1: _____________________ (Owner: _____)
- [ ] Action 2: _____________________ (Owner: _____)
- [ ] Action 3: _____________________ (Owner: _____)

EOF

echo "Incident report created: /tmp/usdt-bsc-incident-*.md"
```

---

## Reverting Code (If Feature Flag Disable Insufficient)

Use this if the rollback flag alone doesn't resolve the issue.

### Option 1: Revert Last Commit

```bash
#!/bin/bash

# 1. Identify last USDT-BSC commit
echo "Last 5 commits affecting USDT-BSC:"
git log --oneline -n 20 -- src/lib/utils/wallet/bsc* src/lib/components/wallet* | head -5

# 2. Get commit hash
LAST_GOOD_COMMIT="$(git log --oneline -n 20 -- src/lib/utils/wallet/bsc* | grep -v 'USDT-BSC' | head -1 | cut -d' ' -f1)"
echo "Reverting to: $LAST_GOOD_COMMIT"

# 3. Revert files
git revert --no-edit "$LAST_GOOD_COMMIT"

# 4. Deploy (your CI/CD pipeline)
npm run build
npm run test  # Verify tests still pass
git push origin main  # Push revert commit

echo "✓ Code reverted and pushed"
```

### Option 2: Kill Switch (Fail-Closed Code)

If reversion is too slow, implement a runtime kill-switch:

```typescript
// src/lib/utils/wallet/bsc-kill-switch.ts
export const BSCKillSwitch = {
  isActive: false,  // Set to true in ops dashboard

  async checkKillSwitch(): Promise<boolean> {
    try {
      const response = await fetch('/api/kill-switches/usdt-bsc');
      const { active } = await response.json();
      this.isActive = active;
      return active;
    } catch {
      // Fail closed: assume kill switch active on network error
      return true;
    }
  },

  throwIfActive(operation: string): void {
    if (this.isActive) {
      throw new Error(`USDT-BSC kill switch active: ${operation} blocked`);
    }
  }
};

// Usage in critical paths
export async function sendUSDT(amount: number, recipient: string) {
  BSCKillSwitch.throwIfActive('sendUSDT');
  // ... send logic
}
```

---

## Partial Rollback (Percentage Reduction)

If only some users are affected, you can reduce the rollout percentage instead of fully disabling:

```bash
#!/bin/bash

# 1. Check current rollout percentage
current=$(curl https://api.bitaskier.com/ops/feature-flags/USDT_BSC_ENABLED \
  -H "Authorization: Bearer $OPS_TOKEN" | jq '.percentage')

echo "Current rollout percentage: $current%"

# 2. Reduce to previous phase percentage
if [ "$current" -eq 25 ]; then
  new_percentage=5
elif [ "$current" -eq 5 ]; then
  new_percentage=0
else
  new_percentage=0
fi

echo "Reducing to: $new_percentage%"

# 3. Update feature flag
curl -X POST https://api.bitaskier.com/ops/feature-flags \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -d '{
    "flag": "USDT_BSC_ENABLED",
    "percentage": '"$new_percentage"',
    "reason": "Partial rollback: reducing from '$current'% to '$new_percentage'%"
  }' | jq .

echo "✓ Rollout percentage reduced"
```

---

## Re-Enabling After Rollback

**DO NOT re-enable USDT-BSC until root cause is fixed and verified.**

### Pre-Re-Enable Checklist

```markdown
## Pre-Re-Enable Checklist

Date: ________________
Approved By: ________________

### Investigation
- [ ] Root cause identified and documented
- [ ] Code fix implemented and reviewed
- [ ] Fix tested on testnet (all scenarios)
- [ ] Fix tested on staging with real volumes
- [ ] Post-incident analysis completed

### Testing
- [ ] All P0 tests passing
- [ ] All P1 tests passing
- [ ] E2E tests passing (< 2% flakiness)
- [ ] Load testing passed (100+ concurrent users)
- [ ] Database performance validated
- [ ] Smart contract audit completed

### Preparation
- [ ] Team trained on fix and monitoring
- [ ] Runbooks updated
- [ ] Monitoring dashboard verified
- [ ] Alert thresholds reviewed
- [ ] Rollback procedure practiced (dry-run)

### Documentation
- [ ] Change log updated
- [ ] Incident report published
- [ ] Preventive measures documented
- [ ] Team retrospective completed

### Decision
- [ ] All checks passed
- [ ] Leadership approval obtained
- [ ] Re-enable flag (start with Phase 1)

**Authorization:** _________________ (Signature)
```

### Re-Enable Sequence

```bash
#!/bin/bash

# Start from Phase 1 again (internal team only)

curl -X POST https://api.bitaskier.com/ops/feature-flags \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -d '{
    "flag": "USDT_BSC_ENABLED",
    "enabled": true,
    "targeting_rules": {
      "user_segment": "internal_team",
      "percentage": 100
    },
    "reason": "Re-enable after fix: [BRIEF DESCRIPTION]",
    "previous_incident_id": "inc-XXXXX",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }' | jq .

echo "✓ USDT-BSC re-enabled for internal team"
echo "Monitor metrics for 2 hours before advancing to Phase 2"
```

---

## Communication Templates

### Slack Notification (Alert)

```
:warning: USDT-BSC Alert

**Issue:** [Error rate exceeded 5% / Zero transactions / Data corruption]
**Severity:** Critical
**Status:** Investigating
**Action:** Feature flag being disabled

Monitor in: #ops-incidents
Dashboard: [Link to Grafana]
```

### Slack Notification (Rollback Confirmed)

```
:gear: USDT-BSC Rollback Complete

**Root Cause:** [To be determined]
**Impact:** ~[X] minutes of downtime
**Users Affected:** ~[X] (estimated)
**Status:** Rolled back successfully

Next Steps:
1. Root cause investigation
2. Code fix
3. Comprehensive testing
4. Re-enable (Phase 1)

Timeline for re-enable: [TBD]
War room: [Google Meet link]
```

### Status Page Update

```
[2026-03-15 14:27 UTC] Investigating issues with USDT-BSC payment processing.
We have temporarily disabled this feature for all users while we investigate.
Lightning Network payments remain fully operational.

Lightning users: No impact expected.
USDT-BSC users: Payments temporarily unavailable. We will restore this feature
once the issue is resolved.

Updates every 15 minutes.
```

---

## Runbook Quick Reference

**Memorize this flow:**

```
1. Alert fires → Check metrics (1 min)
2. Confirm issue → Page on-call (2 min)
3. Disable flag → curl feature-flags endpoint (1 min)
4. Verify disable → Check sample users (1 min)
5. Monitor recovery → Dashboard metrics (5 min)
6. Notify team → Slack + PagerDuty (2 min)
7. Investigate → Logs + analysis (ongoing)
8. Post-incident → Report + prevention (after incident)

Total time to disable: < 5 minutes
Total time to verify: < 15 minutes
```

---

## Related Documentation

- [Feature Flags](./feature-flags.md) - How flags work
- [Monitoring & Alerting](./monitoring.md) - What triggers rollback
- [Environment Setup](./environment-setup.md) - Configuration details
- [Pre-Launch Checklist](./pre-launch-checklist.md) - Preventing issues

## Escalation

**If unsure at any point: Page on-call engineer immediately**

- **Slack:** #ops-incidents
- **PagerDuty:** Platform team
- **Call:** +[TBD]
- **War Room:** https://meet.google.com/usdt-bsc-incident

---

**Document History:**
- **v1.0** (2026-03-14): Initial release
- [Will be updated post-launch]
