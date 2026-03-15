# USDT-BSC Monitoring & Alerting

**Document Version:** 1.0
**Last Updated:** 2026-03-14
**Owner:** Platform Engineering
**Audience:** DevOps, Site Reliability Engineers, Product Managers

## Overview

This document specifies metrics, dashboards, and alerts for monitoring USDT-BSC payment system health, performance, and business KPIs during and after launch.

## Critical Metrics

### 1. Transaction Success Rate

**Definition:** Percentage of initiated USDT-BSC transactions that complete successfully.

**Formula:** `(successful_txs / total_txs) × 100%`

**Target:** >= 98% (97% acceptable short-term)
**Alert Threshold:** < 95% (warning), < 90% (critical)
**Check Frequency:** Real-time (5-min rolling window)

**Prometheus Query:**
```promql
rate(usdt_bsc_transactions_successful_total[5m]) /
rate(usdt_bsc_transactions_total[5m]) * 100
```

**Components Tracked:**
- Send transactions
- Receive transactions (payment requests)
- Pending transaction time (target: < 2 min to completion)

**Dashboard Panels:**
```json
{
  "panels": [
    {
      "title": "Transaction Success Rate (5-min rolling)",
      "expr": "rate(usdt_bsc_tx_success[5m]) / rate(usdt_bsc_tx_total[5m]) * 100",
      "alert": {
        "warning": "< 95",
        "critical": "< 90"
      }
    },
    {
      "title": "Success Rate by Transaction Type",
      "expr": "rate(usdt_bsc_tx_success{type=~\"send|receive\"}[5m]) / rate(usdt_bsc_tx_total{type=~\"send|receive\"}[5m])"
    },
    {
      "title": "Transaction Completion Time (p95)",
      "expr": "histogram_quantile(0.95, usdt_bsc_tx_completion_seconds)"
    }
  ]
}
```

---

### 2. Sponsor Balance Monitoring

**Definition:** Available USDT balance in the sponsor service account.

**Target:** > 2 days of operational runway
**Alert Threshold:** < 1 day (warning), < 4 hours (critical)
**Check Frequency:** Every 5 minutes

**Prometheus Queries:**
```promql
# Current sponsor balance
usdt_sponsor_balance_current

# Daily burn rate
rate(usdt_sponsor_spending_total[1d])

# Days of runway remaining
usdt_sponsor_balance_current / (rate(usdt_sponsor_spending_total[1d]) / 86400)
```

**Dashboard Panels:**
```json
{
  "panels": [
    {
      "title": "Sponsor USDT Balance (Real-time)",
      "expr": "usdt_sponsor_balance_current",
      "unit": "short",
      "decimals": 2,
      "alert": {
        "warning": "< 1000",  // < 1 day at typical burn
        "critical": "< 250"   // < 6 hours
      }
    },
    {
      "title": "Daily Sponsor Spending",
      "expr": "rate(usdt_sponsor_spending_total[1d])",
      "unit": "short"
    },
    {
      "title": "Days of Runway Remaining",
      "expr": "usdt_sponsor_balance_current / (rate(usdt_sponsor_spending_total[1d]) / 86400)",
      "alert": {
        "warning": "< 2",
        "critical": "< 0.5"
      }
    },
    {
      "title": "Sponsor Balance Trend (7 days)",
      "expr": "usdt_sponsor_balance_current"
    }
  ]
}
```

**Action Triggers:**
- Balance < 1 day: Automatic replenishment (if configured)
- Balance < 6 hours: Page on-call engineer immediately
- Zero balance: Disable USDT-BSC feature flag (fail-closed)

---

### 3. Treasury Reconciliation

**Definition:** Daily verification that collected fees match expected amount.

**Target:** Variance < 0.1%
**Check Frequency:** Daily (automated), Weekly (manual audit)
**Alert Threshold:** Variance > 1% (immediate investigation)

**Reconciliation Logic:**
```typescript
const treasury = {
  dailyReconciliation: async () => {
    const collected = await getFeesCollected(yesterday);
    const expected = await calculateExpectedFees(yesterday);
    const variance = Math.abs(collected - expected) / expected;

    return {
      collected,
      expected,
      variance: `${(variance * 100).toFixed(3)}%`,
      status: variance <= 0.001 ? 'PASS' : 'FAIL'
    };
  }
};
```

**Metrics:**
```promql
# Daily fees collected
rate(usdt_fees_collected_total[1d])

# Expected fees (from transaction count)
usdt_transactions_total * usdt_fixed_fee_per_transaction

# Reconciliation variance
abs(rate(usdt_fees_collected_total[1d]) -
    (usdt_transactions_total * usdt_fixed_fee_per_transaction)) /
(usdt_transactions_total * usdt_fixed_fee_per_transaction) * 100
```

**Dashboard Panels:**
```json
{
  "panels": [
    {
      "title": "Daily Fees Collected vs Expected",
      "expr": [
        "rate(usdt_fees_collected_total[1d])",
        "usdt_transactions_total * usdt_fixed_fee_per_transaction"
      ],
      "alert": {
        "variance_critical": "> 1"
      }
    },
    {
      "title": "Reconciliation Status",
      "expr": "usdt_treasury_reconciliation_status",
      "values": ["PASS", "FAIL", "PENDING"]
    },
    {
      "title": "Weekly Reconciliation Audit Trail",
      "expr": "usdt_weekly_reconciliation_variance"
    }
  ]
}
```

---

### 4. Error Distribution by Failure Mode

**Definition:** Track errors by category to identify patterns.

**Target:** All errors < 1% individually
**Alert Threshold:** See specific error types below
**Check Frequency:** Real-time (5-min window)

#### Error Types & Thresholds

| Error Code | Meaning | Alert Threshold | Action |
|------------|---------|-----------------|--------|
| `WRONG_CHAIN` | User on wrong network | > 1% | Review wallet UX, user education |
| `SPONSOR_UNAVAILABLE` | Sponsor service down | > 0.1% | Page on-call, check sponsor service health |
| `INSUFFICIENT_BALANCE` | User insufficient balance | < 5% (expected) | User error; no alert |
| `ROUTER_ALLOWANCE_MISSING` | ERC-20 allowance issue | > 0.5% | Investigate contract state |
| `ROUTER_EXECUTION_FAILED` | Smart contract failed | > 0.1% | Critical; investigate contract |
| `GAS_PRICE_TOO_LOW` | Transaction underfunded | > 0.5% | Check gas price strategy |
| `NETWORK_TIMEOUT` | RPC timeout | > 1% | Check RPC provider health |
| `SIGNATURE_INVALID` | User signature failed | > 0.1% | Investigate signing process |

**Prometheus Queries:**
```promql
# WRONG_CHAIN errors
rate(usdt_bsc_errors_total{error="WRONG_CHAIN"}[5m]) /
rate(usdt_bsc_transactions_total[5m]) * 100

# All errors by type
rate(usdt_bsc_errors_total[5m]) by (error)

# Sponsor availability errors
rate(usdt_bsc_errors_total{error="SPONSOR_UNAVAILABLE"}[5m])
```

**Dashboard Panels:**
```json
{
  "panels": [
    {
      "title": "Error Distribution (5-min window)",
      "expr": "rate(usdt_bsc_errors_total[5m]) by (error)",
      "type": "pie_chart"
    },
    {
      "title": "Critical Errors Over Time",
      "expr": "rate(usdt_bsc_errors_total{error=~\"SPONSOR_UNAVAILABLE|ROUTER_EXECUTION_FAILED|SIGNATURE_INVALID\"}[5m])",
      "alert": {
        "critical": "> 0.1"
      }
    },
    {
      "title": "Error Trend by Type (24h)",
      "expr": "rate(usdt_bsc_errors_total[1d]) by (error)"
    }
  ]
}
```

---

### 5. User Feedback & Sentiment

**Definition:** Monitor support tickets and user feedback for USDT-BSC issues.

**Target:** Zero critical issues; < 5 support tickets per 1000 transactions
**Alert Threshold:** > 10 tickets in 1 hour (warning), > 20 (critical)
**Check Frequency:** Real-time (query every 30 min)

**Integration Points:**
- Support system (Zendesk, Intercom, etc.)
- In-app feedback forms
- Slack #user-feedback channel

**Metrics:**
```promql
# Support tickets for USDT-BSC
increase(support_tickets_total{tag="USDT-BSC"}[1h])

# Sentiment distribution
increase(user_feedback_sentiment_total{tag="USDT-BSC"}[1h]) by (sentiment)

# High-priority issues
increase(support_tickets_total{tag="USDT-BSC", priority="high"}[1h])
```

**Dashboard Panels:**
```json
{
  "panels": [
    {
      "title": "Support Tickets (Last 1 Hour)",
      "expr": "increase(support_tickets_total{tag=\"USDT-BSC\"}[1h])",
      "alert": {
        "warning": "> 10",
        "critical": "> 20"
      }
    },
    {
      "title": "User Sentiment Distribution",
      "expr": "increase(user_feedback_sentiment_total{tag=\"USDT-BSC\"}[1h]) by (sentiment)"
    },
    {
      "title": "Common Issues (Top 5)",
      "expr": "topk(5, increase(support_tickets_total{tag=\"USDT-BSC\"}[1d]) by (issue_category))"
    }
  ]
}
```

---

### 6. Smart Contract & RPC Health

**Definition:** Monitor blockchain interaction health.

**Target:** 99.9% RPC uptime; all contract calls succeed
**Alert Threshold:** RPC uptime < 99%; contract error rate > 0.1%
**Check Frequency:** Real-time (5-min)

**Metrics:**
```promql
# RPC provider uptime
rate(rpc_requests_successful_total[5m]) / rate(rpc_requests_total[5m]) * 100

# Smart contract call success rate
rate(smart_contract_calls_successful_total{contract="DirectSendRouter"}[5m]) /
rate(smart_contract_calls_total{contract="DirectSendRouter"}[5m]) * 100

# Gas price variation (should be stable)
histogram_quantile(0.95, bsc_gas_price_gwei) /
histogram_quantile(0.05, bsc_gas_price_gwei)

# Network confirmation time (should be < 30 sec)
histogram_quantile(0.99, tx_confirmation_seconds)
```

**Dashboard Panels:**
```json
{
  "panels": [
    {
      "title": "RPC Provider Uptime",
      "expr": "rate(rpc_requests_successful_total[5m]) / rate(rpc_requests_total[5m]) * 100",
      "alert": {
        "critical": "< 99"
      }
    },
    {
      "title": "Smart Contract Call Success Rate",
      "expr": "rate(smart_contract_calls_successful_total[5m]) / rate(smart_contract_calls_total[5m]) * 100"
    },
    {
      "title": "Average Transaction Confirmation Time",
      "expr": "histogram_quantile(0.5, tx_confirmation_seconds)"
    },
    {
      "title": "BSC Gas Price Trend",
      "expr": "bsc_gas_price_gwei"
    }
  ]
}
```

---

### 7. Database & API Performance

**Definition:** Ensure USDT-BSC operations don't degrade system performance.

**Target:**
- API latency p99 < 2 seconds
- Database queries p95 < 200ms
- Throughput > 100 requests/sec

**Alert Threshold:**
- API latency p99 > 5 seconds
- Database queries p95 > 500ms
- Throughput < 50 requests/sec

**Metrics:**
```promql
# API endpoint latency for USDT operations
histogram_quantile(0.99, api_request_duration_seconds{path=~".*usdt.*"})

# Database query latency
histogram_quantile(0.95, db_query_duration_seconds{query_type="USDT"})

# RPC API response time
histogram_quantile(0.99, rpc_response_time_seconds)

# Request throughput
rate(http_requests_total{path=~".*usdt.*"}[1m])
```

**Dashboard Panels:**
```json
{
  "panels": [
    {
      "title": "API Latency (p99)",
      "expr": "histogram_quantile(0.99, api_request_duration_seconds{path=~\".*usdt.*\"})",
      "alert": {
        "critical": "> 5"
      }
    },
    {
      "title": "Database Query Latency (p95)",
      "expr": "histogram_quantile(0.95, db_query_duration_seconds{query_type=\"USDT\"})",
      "alert": {
        "critical": "> 0.5"
      }
    },
    {
      "title": "Request Throughput",
      "expr": "rate(http_requests_total{path=~\".*usdt.*\"}[1m])",
      "alert": {
        "warning": "< 50"
      }
    }
  ]
}
```

---

## Alerting Rules

### Alert Configuration (Prometheus)

```yaml
# prometheus/usdt-bsc-alerts.yaml

groups:
  - name: usdt_bsc_critical
    interval: 1m
    rules:
      # Transaction success rate
      - alert: USDTBSCLowSuccessRate
        expr: |
          (rate(usdt_bsc_tx_success_total[5m]) /
           rate(usdt_bsc_tx_total[5m])) < 0.95
        for: 5m
        labels:
          severity: critical
          component: usdt-bsc
        annotations:
          summary: "USDT-BSC success rate below 95%"
          description: "Current rate: {{ $value | humanizePercentage }}"
          dashboard: "https://grafana.bitaskier.com/d/usdt-bsc-transactions"
          runbook: "docs/ops/rollback-procedures.md"

      # Zero transactions for extended period
      - alert: USDTBSCZeroTransactions
        expr: |
          (increase(usdt_bsc_tx_total[1h]) == 0) AND
          (feature_flag_enabled{flag="USDT_BSC_ENABLED"} == 1)
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "USDT-BSC: No transactions in 1 hour"
          description: "Feature enabled but zero transactions detected"

      # Sponsor balance critical
      - alert: USDTBSCSponsorBalanceCritical
        expr: usdt_sponsor_balance_current < 250  # < 6 hours
        for: 5m
        labels:
          severity: critical
          component: sponsor-service
        annotations:
          summary: "Sponsor balance critically low (< 6 hours)"
          value: "${{ $value }}"
          action: "Immediately replenish sponsor wallet or disable feature"

      # Router execution errors
      - alert: USDTBSCRouterExecutionFailure
        expr: |
          (rate(usdt_bsc_errors_total{error="ROUTER_EXECUTION_FAILED"}[5m]) /
           rate(usdt_bsc_tx_total[5m])) > 0.001
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "USDT-BSC router contract execution failures"
          description: "Error rate: {{ $value | humanizePercentage }}"
          action: "Investigate smart contract state"

      # RPC provider down
      - alert: USDTBSCRPCProviderDown
        expr: |
          (rate(rpc_requests_successful_total[5m]) /
           rate(rpc_requests_total[5m])) < 0.99
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "USDT-BSC RPC provider uptime < 99%"
          description: "Uptime: {{ $value | humanizePercentage }}"

      # Support tickets surge
      - alert: USDTBSCSupportSurge
        expr: increase(support_tickets_total{tag="USDT-BSC"}[1h]) > 10
        labels:
          severity: warning
        annotations:
          summary: "USDT-BSC support tickets > 10 in last hour"
          description: "{{ $value }} tickets created"

  - name: usdt_bsc_warnings
    interval: 5m
    rules:
      # Lower success rate warning
      - alert: USDTBSCLowerSuccessRate
        expr: |
          (rate(usdt_bsc_tx_success_total[5m]) /
           rate(usdt_bsc_tx_total[5m])) < 0.98
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "USDT-BSC success rate below 98%"

      # Sponsor balance warning
      - alert: USDTBSCSponsorBalanceLow
        expr: usdt_sponsor_balance_current < 1000  # < 1 day
        labels:
          severity: warning
        annotations:
          summary: "Sponsor balance low (< 1 day runway)"
          action: "Plan replenishment"

      # Treasury reconciliation variance
      - alert: USDTBSCTreasuryReconciliationVariance
        expr: |
          abs(rate(usdt_fees_collected_total[1d]) -
              (usdt_transactions_total * usdt_fixed_fee_per_transaction)) /
          (usdt_transactions_total * usdt_fixed_fee_per_transaction) > 0.01
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "USDT-BSC treasury reconciliation variance > 1%"
          description: "Variance: {{ $value | humanizePercentage }}"

      # High API latency
      - alert: USDTBSCHighAPILatency
        expr: |
          histogram_quantile(0.99, api_request_duration_seconds{path=~".*usdt.*"}) > 2
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "USDT-BSC API latency p99 > 2 seconds"
```

---

## Alerting Channels & Escalation

### Alert Routing

```yaml
# alertmanager/usdt-bsc-routing.yaml

global:
  resolve_timeout: 5m

route:
  receiver: usdt-bsc-critical
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 4h

  routes:
    # Critical alerts -> Page on-call
    - match:
        severity: critical
        component: usdt-bsc
      receiver: usdt-bsc-critical-pagerduty
      continue: true

    # Warning alerts -> Slack #ops-alerts
    - match:
        severity: warning
        component: usdt-bsc
      receiver: usdt-bsc-warnings-slack
      continue: true

receivers:
  - name: usdt-bsc-critical-pagerduty
    pagerduty_configs:
      - service_key: '${PAGERDUTY_SERVICE_KEY}'
        description: '{{ .GroupLabels.alertname }}'
        details:
          firing: '{{ range .Alerts.Firing }}{{ .Labels.instance }} {{ .Annotations.summary }}{{ end }}'
    slack_configs:
      - channel: '#ops-critical'
        title: 'CRITICAL: {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
        send_resolved: true

  - name: usdt-bsc-warnings-slack
    slack_configs:
      - channel: '#ops-alerts'
        title: 'WARNING: {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
```

### Notification Templates

**Slack - Critical Alert**
```
:fire: CRITICAL: USDT-BSC Issue

Severity: CRITICAL
Alert: [Alert Name]
Status: FIRING

Description: [Alert description]
Current Value: [Metric value]

Action Required:
1. Check dashboard: [Link]
2. Review logs: [Link]
3. Initiate rollback if needed: docs/ops/rollback-procedures.md

War Room: https://meet.google.com/usdt-bsc-incident
```

**Email - Sustained Issue**
```
Subject: USDT-BSC Alert Sustained for 1+ Hour

Alert: [Alert Name]
Duration: [Time]
Severity: [Critical/Warning]

This alert has been firing continuously for the past 1 hour.

Current Status: [Metrics]
Recommended Action: [Action]

Dashboard: [Link]
Runbook: docs/ops/[relevant doc]

-- Sent by Prometheus
```

---

## Dashboard Setup

### Primary Dashboard: USDT-BSC Operations

**URL:** `https://grafana.bitaskier.com/d/usdt-bsc-ops`

**Rows:**
1. **Key Metrics** (4 panels)
   - Transaction Success Rate
   - Sponsor Balance (days remaining)
   - Treasury Reconciliation Status
   - Error Rate

2. **Transaction Analysis** (4 panels)
   - Transactions by Type (send/receive)
   - Completion Time Distribution
   - Success Rate Over Time
   - Failed Transactions by Type

3. **Error Analysis** (4 panels)
   - Error Distribution (pie chart)
   - Error Rate by Type
   - Top Error Types (hourly)
   - Error Trend (24h)

4. **System Health** (4 panels)
   - RPC Provider Uptime
   - API Latency (p99)
   - Database Query Latency (p95)
   - Smart Contract Success Rate

5. **Sponsor Service** (3 panels)
   - Sponsor Balance Trend
   - Daily Spending Rate
   - Runway Projection (7 days)

6. **User Feedback** (3 panels)
   - Support Tickets (1h)
   - Sentiment Distribution
   - Common Issues

---

## Maintenance & Updates

### Weekly Review (Every Monday)

```markdown
## Weekly USDT-BSC Monitoring Review

Date: ________________
Reviewed By: ________________

### Metrics Summary
- Transaction success rate (avg): ________%
- Sponsor balance trend: [↑ Increasing / ↓ Decreasing / = Stable]
- Support tickets: ________ (expected: < 35)
- Critical alerts: ________ (expected: 0)

### Dashboard Health
- [ ] All panels loading correctly
- [ ] Alert rules firing as expected
- [ ] No stale data detected
- [ ] Dashboard performance acceptable

### Actions Needed
- [ ] [Action 1]
- [ ] [Action 2]

### Notes
[Any observations or concerns]

Sign-Off: _________________ (Date)
```

### Monthly Capacity Planning

```markdown
## Monthly Capacity Review

Date: ________________

### Usage Trends
- USDT-BSC transaction growth: ______% MoM
- Average daily volume: ________ transactions
- Peak hour volume: ________ transactions

### Sponsor Sustainability
- Current burn rate: $________ per day
- Monthly budget needed: $________
- Projected balance (end of month): $________

### Performance
- API latency trend: [Improving / Stable / Degrading]
- Database performance: [OK / Needs optimization]
- RPC reliability: ________% uptime

### Recommendations
- [ ] Increase sponsor balance budget
- [ ] Optimize database queries
- [ ] Upgrade RPC provider
- [ ] Expand team for monitoring

Sign-Off: _________________ (Date)
```

---

## Related Documentation

- [Feature Flags](./feature-flags.md) - Controlling rollout
- [Rollback Procedures](./rollback-procedures.md) - Emergency procedures
- [Pre-Launch Checklist](./pre-launch-checklist.md) - Launch readiness
- [Environment Setup](./environment-setup.md) - Configuration details

## Support & Escalation

**Monitoring Ownership:** Platform Engineering
**On-Call Schedule:** PagerDuty (Primary + Secondary)
**War Room:** https://meet.google.com/usdt-bsc-incident
**Slack:** #ops-alerts (warnings), #ops-critical (critical)
**Email Escalation:** ops-team@bitaskier.com

---

**Document History:**
- **v1.0** (2026-03-14): Initial release
- [Will be updated post-launch with actual metrics]
