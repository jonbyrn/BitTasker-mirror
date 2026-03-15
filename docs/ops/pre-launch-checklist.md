# USDT-BSC Pre-Launch Checklist

**Document Version:** 1.0
**Last Updated:** 2026-03-14
**Owner:** Engineering Leadership
**Audience:** All team members involved in USDT-BSC launch

## Overview

This comprehensive checklist ensures USDT-BSC is production-ready before launch. Use this document as your go/no-go decision framework.

---

## Security Review

### Code Security

- [ ] **Secrets Audit**
  - [ ] No hardcoded API keys, private keys, or credentials in code
  - [ ] All secrets stored in environment variables or secret management system
  - [ ] Secret scanning tools (git-secrets, detect-secrets) pass cleanly
  - [ ] `.env.example` contains no real values
  - Run: `npm run security-scan` passes with zero issues

- [ ] **Input Validation**
  - [ ] All user inputs validated at system boundaries
  - [ ] Address inputs validated (checksummed, length verified)
  - [ ] Amount inputs validated (non-negative, within limits)
  - [ ] Recipient validation prevents sending to contract addresses
  - Run: `grep -r 'TODO.*validation' src/lib/utils/wallet/bsc*` returns nothing

- [ ] **Error Handling**
  - [ ] No sensitive data leaked in error messages
  - [ ] Stack traces not exposed to users
  - [ ] Error codes mapped to user-friendly messages
  - [ ] Logs don't contain PII or transaction details

- [ ] **Fail-Closed Semantics**
  - [ ] Feature flag defaults to disabled (disabled = safer)
  - [ ] Missing sponsor service blocks transaction (not bypasses)
  - [ ] Invalid smart contract state blocks transaction
  - [ ] Any doubt → transaction rejected, not approved

### Smart Contract Security

- [ ] **Contract Audit**
  - [ ] DirectSendRouter contract audited by 3rd party
  - [ ] Audit report attached to deployment package
  - [ ] All audit findings addressed and documented
  - [ ] No "medium" or higher severity issues remain
  - Contact: [Audit firm name]

- [ ] **Contract Verification**
  - [ ] Contract source code matches deployed bytecode
  - [ ] Contract verified on BSC explorer
  - [ ] ABI matches expected interface
  - [ ] No suspicious constructor parameters

- [ ] **Allowance & Permissions**
  - [ ] USDT approval flow tested end-to-end
  - [ ] Router contract can pull USDT on user's behalf
  - [ ] Allowance set to minimum required (not unlimited)
  - [ ] Revoke flow works correctly (for user safety)

### Infrastructure Security

- [ ] **Network Security**
  - [ ] HTTPS enforced for all USDT API endpoints
  - [ ] API authentication required (bearer tokens)
  - [ ] Rate limiting enabled (max requests/min per user)
  - [ ] CORS properly configured (no wildcard origins)
  - [ ] DDoS protection enabled

- [ ] **Data Security**
  - [ ] Database backups encrypted at rest
  - [ ] Database access logs enabled and reviewed
  - [ ] PII (email, addresses) encrypted in transit
  - [ ] No transaction details logged to user-visible logs

- [ ] **Access Control**
  - [ ] Sponsor service access restricted to allowlist
  - [ ] Admin/ops functions require MFA
  - [ ] Audit logs track all admin actions
  - [ ] Service accounts use temporary credentials

---

## Testing Verification

### Unit Tests (P0 & P1)

Target: **100% of tests passing, 85%+ code coverage**

```bash
# Run P0 tests
npm run test -- --testPathPattern="(usdt|bsc)" --testNamePattern="P0"
# Expected: All pass

# Run P1 tests
npm run test -- --testPathPattern="(usdt|bsc)" --testNamePattern="P1"
# Expected: All pass

# Coverage report
npm run test:coverage -- --testPathPattern="(usdt|bsc)"
# Expected: >= 85% line/branch/function coverage
```

- [ ] **P0 Tests - Critical Flows**
  - [ ] Send USDT transaction succeeds
  - [ ] Receive payment request succeeds
  - [ ] Insufficient balance error handled
  - [ ] Wrong network error handled
  - [ ] Sponsor unavailable error handled
  - All P0 tests: `npm run test:p0` **PASSES**

- [ ] **P1 Tests - Important Flows**
  - [ ] Balance history loads correctly
  - [ ] Transaction history displays properly
  - [ ] Escrow contract creation succeeds
  - [ ] Multiple concurrent transactions handled
  - [ ] Gas price estimation works
  - All P1 tests: `npm run test:p1` **PASSES**

- [ ] **Coverage Metrics**
  - [ ] Line coverage: >= 85%
  - [ ] Branch coverage: >= 85%
  - [ ] Function coverage: >= 85%
  - [ ] No uncovered critical paths
  - Report: `npm run test:coverage` reviewed and approved

### Integration Tests

- [ ] **Wallet Integration**
  - [ ] Balance updates reflect transactions
  - [ ] Transaction history includes USDT payments
  - [ ] Pending transactions display with status
  - [ ] Completed transactions mark as confirmed

- [ ] **Task/Contract Integration**
  - [ ] Task payment asset is remembered
  - [ ] Bid includes payment asset
  - [ ] Contract uses correct payment method
  - [ ] Escrow releases in correct asset

- [ ] **Sponsor Service Integration**
  - [ ] Signed transactions submitted correctly
  - [ ] Sponsor service response handled
  - [ ] Timeout behavior is correct (fail-closed)
  - [ ] Retry logic works for transient failures

### E2E Tests (End-to-End)

Target: **100% passing, < 2% flakiness**

```bash
npm run test:e2e -- --testPathPattern="usdt.*bsc"
# Expected: All pass (run 3x to verify < 2% flakiness)
```

- [ ] **Complete Send Flow**
  - [ ] User navigates to send payment
  - [ ] Enters recipient address
  - [ ] Enters amount
  - [ ] Reviews transaction details
  - [ ] Confirms with biometric/password
  - [ ] Transaction submitted to sponsor
  - [ ] Transaction confirmed on-chain
  - [ ] Balance updated immediately
  - [ ] Transaction in history with correct status
  - Test: `npm run test:e2e -- --testNamePattern="E2E.*send.*usdt"` **PASSES**

- [ ] **Complete Receive Flow**
  - [ ] User creates payment request
  - [ ] Selects USDT-BSC as payment method
  - [ ] Generates QR code / share link
  - [ ] External user scans / accesses link
  - [ ] External user sees payment request
  - [ ] External user confirms and sends
  - [ ] Original user receives notification
  - [ ] Balance updated
  - [ ] Transaction appears in history
  - Test: `npm run test:e2e -- --testNamePattern="E2E.*receive.*usdt"` **PASSES**

- [ ] **Error Scenarios**
  - [ ] Insufficient balance prevents send
  - [ ] Wrong network shows error
  - [ ] Sponsor timeout shows user-friendly error
  - [ ] Router contract failure shows error
  - [ ] Signature rejection handled gracefully
  - Test: `npm run test:e2e -- --testNamePattern="E2E.*error.*usdt"` **PASSES**

- [ ] **Flakiness < 2%**
  - [ ] Run E2E suite 3x consecutively
  - [ ] All runs must have >= 98% pass rate
  - [ ] Total flaky tests / total tests < 2%
  - Verify: `npm run test:e2e:repeat 3` shows consistent results

### Manual QA (Testnet)

- [ ] **Basic Functionality**
  - [ ] User can see USDT-BSC payment option
  - [ ] Send flow works end-to-end
  - [ ] Receive flow works end-to-end
  - [ ] Transaction appears in history
  - [ ] Balance updates correctly
  - Tester: _____________ Date: _______

- [ ] **Edge Cases**
  - [ ] Sending to own address (should fail)
  - [ ] Sending to exchange address (warning shown)
  - [ ] Very small amount (0.01 USDT)
  - [ ] Very large amount (10,000 USDT)
  - [ ] Rapid sequential transactions (stress)
  - Tester: _____________ Date: _______

- [ ] **User Experience**
  - [ ] No loading spinners > 2 seconds
  - [ ] Error messages are clear and actionable
  - [ ] Success screens show all details
  - [ ] Mobile UI is responsive
  - [ ] Accessibility: WCAG 2.1 AA compliance
  - Tester: _____________ Date: _______

### Load Testing

Target: **100+ concurrent users, < 2 second response time**

```bash
# Load test (requires k6 or similar)
npm run test:load -- --vus 100 --duration 10m
# Expected: < 2% error rate, p99 latency < 2s
```

- [ ] **Throughput**
  - [ ] 100+ concurrent users supported
  - [ ] 10+ RPS (requests per second) sustained
  - [ ] Database queries respond < 200ms (p95)
  - Run: `npm run test:load` shows acceptable metrics

- [ ] **Error Recovery**
  - [ ] Errors < 2% under load
  - [ ] Timeouts < 0.5%
  - [ ] System recovers after load
  - Run: Load test, then verify no degradation

---

## Performance Baseline

Establish performance baseline before launch:

### API Latency

```bash
npm run perf:baseline -- api
```

- [ ] **Transaction Submission**
  - [ ] p50: < 500ms
  - [ ] p95: < 1.5s
  - [ ] p99: < 2.0s
  - Baseline: _________

- [ ] **Balance Lookup**
  - [ ] p50: < 200ms
  - [ ] p95: < 400ms
  - [ ] p99: < 500ms
  - Baseline: _________

- [ ] **Transaction History**
  - [ ] p50: < 300ms
  - [ ] p95: < 800ms
  - [ ] p99: < 1.0s
  - Baseline: _________

### Database Performance

```bash
npm run perf:baseline -- database
```

- [ ] **Query Performance**
  - [ ] Simple queries: < 50ms
  - [ ] Complex queries: < 200ms
  - [ ] Bulk operations: < 1s
  - Baseline: _________

- [ ] **No N+1 Queries**
  - [ ] Verified with query profiler
  - [ ] Indexes in place for USDT tables
  - [ ] Query execution plans reviewed
  - Review: _____________ Date: _______

### Blockchain Interaction

```bash
npm run perf:baseline -- blockchain
```

- [ ] **Smart Contract Calls**
  - [ ] Gas estimation: < 100ms
  - [ ] Balance check: < 50ms
  - [ ] Allowance check: < 50ms
  - Baseline: _________

- [ ] **RPC Provider**
  - [ ] Latency p95: < 200ms
  - [ ] Uptime: >= 99.9%
  - [ ] Fallback provider working
  - Baseline: _________

---

## Monitoring Setup

### Dashboards Active

- [ ] **Primary Dashboard**
  - [ ] URL: https://grafana.bitaskier.com/d/usdt-bsc-ops
  - [ ] All panels loading
  - [ ] Data flowing correctly
  - Verified by: _____________ Date: _______

- [ ] **Transaction Monitoring**
  - [ ] Success rate tracking
  - [ ] Error rate tracking
  - [ ] Sponsor balance visible
  - Verified by: _____________ Date: _______

- [ ] **System Health**
  - [ ] API latency displayed
  - [ ] Database performance shown
  - [ ] RPC provider status visible
  - Verified by: _____________ Date: _______

### Alerts Configured

- [ ] **Critical Alerts**
  - [ ] Success rate < 95% (5 min window)
  - [ ] Sponsor balance < 6 hours (immediate)
  - [ ] Zero transactions despite enabled flag
  - [ ] RPC provider down

- [ ] **Warning Alerts**
  - [ ] Success rate < 98% (10 min window)
  - [ ] Sponsor balance < 1 day
  - [ ] Error rate > 1%
  - [ ] API latency p99 > 2s

- [ ] **Alert Delivery**
  - [ ] Critical → PagerDuty (page on-call)
  - [ ] Critical → Slack #ops-critical
  - [ ] Warning → Slack #ops-alerts
  - [ ] Email escalation configured
  - Verified by: _____________ Date: _______

### Logging & Tracing

- [ ] **Transaction Logging**
  - [ ] All USDT transactions logged
  - [ ] Log level: INFO (production)
  - [ ] No PII in logs
  - [ ] Structured logging enabled
  - Verified by: _____________ Date: _______

- [ ] **Error Tracking**
  - [ ] Sentry/Rollbar configured
  - [ ] Error grouping working
  - [ ] Alerts for critical errors
  - Verified by: _____________ Date: _______

- [ ] **Distributed Tracing**
  - [ ] OpenTelemetry configured (if applicable)
  - [ ] Trace sampling at 1-5%
  - [ ] Can correlate logs across services
  - Verified by: _____________ Date: _______

---

## Environment Configuration

### Variables Verified

```bash
./docs/ops/environment-setup.sh validate production
```

- [ ] **Required Variables**
  - [ ] USDT_BSC_ENABLED (currently: false)
  - [ ] VITE_BSC_NETWORK (must be: mainnet)
  - [ ] VITE_BSC_CHAIN_ID (must be: 56)
  - [ ] VITE_BSC_USDT_TOKEN_ADDRESS ✓
  - [ ] VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS ✓
  - [ ] VITE_BSC_RPC_URL ✓
  - [ ] VITE_BSC_SPONSOR_SERVICE_URL ✓

- [ ] **Address Verification**
  - [ ] USDT address matches BSC mainnet
  - [ ] Router address verified on BSC explorer
  - [ ] RPC endpoint responding
  - [ ] Sponsor service responding

- [ ] **Secrets Management**
  - [ ] API keys in secret manager (not .env)
  - [ ] Access logs reviewed
  - [ ] Rotation scheduled
  - Verified by: _____________ Date: _______

### Build Verification

- [ ] **Production Build**
  - [ ] `npm run build` succeeds
  - [ ] Build output is deterministic (reproducible)
  - [ ] No build warnings
  - [ ] No security vulnerabilities in dependencies
  - Build: `npm run build` ✓

- [ ] **Dependency Audit**
  - [ ] `npm audit` reports zero vulnerabilities
  - [ ] All dependencies up-to-date
  - [ ] No deprecated packages
  - Audit: `npm audit` ✓

---

## Documentation

### Operational Runbooks

- [ ] **Feature Flags (docs/ops/feature-flags.md)**
  - [ ] Complete and accurate
  - [ ] Examples tested and working
  - [ ] Rollout phases clearly defined
  - Reviewed by: _____________ Date: _______

- [ ] **Rollback Procedures (docs/ops/rollback-procedures.md)**
  - [ ] Complete step-by-step procedures
  - [ ] Time estimates accurate
  - [ ] Rollback procedures tested (dry-run)
  - Reviewed by: _____________ Date: _______

- [ ] **Monitoring & Alerting (docs/ops/monitoring.md)**
  - [ ] All metrics defined
  - [ ] Alert rules match documentation
  - [ ] Dashboard setup matches doc
  - Reviewed by: _____________ Date: _______

- [ ] **Environment Setup (docs/ops/environment-setup.md)**
  - [ ] All variables documented
  - [ ] Validation script working
  - [ ] Contract addresses included
  - Reviewed by: _____________ Date: _______

### Team Training

- [ ] **Engineering Team**
  - [ ] USDT-BSC architecture reviewed
  - [ ] Code walkthrough completed
  - [ ] Testing strategy understood
  - [ ] Questions answered
  - Training by: _____________ Date: _______

- [ ] **DevOps/SRE Team**
  - [ ] Monitoring dashboard walkthrough
  - [ ] Alert response procedures practiced
  - [ ] Rollback procedure walked through
  - [ ] On-call rotation trained
  - Training by: _____________ Date: _______

- [ ] **Support Team**
  - [ ] Common issues documented
  - [ ] Troubleshooting guide provided
  - [ ] Escalation path clear
  - [ ] FAQ written
  - Training by: _____________ Date: _______

### Public Documentation

- [ ] **User Documentation**
  - [ ] "How to send USDT" guide written
  - [ ] "How to receive USDT" guide written
  - [ ] FAQ addresses common issues
  - [ ] Available before launch

- [ ] **Status Page**
  - [ ] USDT-BSC status component created
  - [ ] Ready to update during issues
  - [ ] History populated

---

## Sign-Off & Approvals

### Security Sign-Off

**Security Lead:** _________________________
**Title:** _________________________
**Date:** _________________________
**Notes:** ___________________________________________________________________________

- [ ] Code security audit passed
- [ ] Smart contract audit passed
- [ ] Infrastructure security verified
- [ ] No blockers to launch

**Signature:** _________________________

---

### Testing & QA Sign-Off

**QA Lead:** _________________________
**Title:** _________________________
**Date:** _________________________
**Notes:** ___________________________________________________________________________

- [ ] Unit tests: 100% P0, 100% P1
- [ ] Integration tests: 100% passing
- [ ] E2E tests: 100% passing, < 2% flaky
- [ ] Load testing: 100+ concurrent users
- [ ] Manual QA completed on testnet
- [ ] No blockers to launch

**Signature:** _________________________

---

### Performance Sign-Off

**Performance Engineer:** _________________________
**Title:** _________________________
**Date:** _________________________
**Notes:** ___________________________________________________________________________

- [ ] API latency within SLO (p99 < 2s)
- [ ] Database performance baseline established
- [ ] Smart contract gas usage acceptable
- [ ] RPC provider reliability verified
- [ ] No blockers to launch

**Signature:** _________________________

---

### DevOps/SRE Sign-Off

**DevOps Lead:** _________________________
**Title:** _________________________
**Date:** _________________________
**Notes:** ___________________________________________________________________________

- [ ] Environment configuration verified
- [ ] Monitoring dashboards active
- [ ] Alerting configured and tested
- [ ] Backup/DR procedures documented
- [ ] Team trained on operations
- [ ] No blockers to launch

**Signature:** _________________________

---

### Product Sign-Off

**Product Lead:** _________________________
**Title:** _________________________
**Date:** _________________________
**Notes:** ___________________________________________________________________________

- [ ] Feature meets requirements
- [ ] User experience tested and approved
- [ ] Business metrics defined
- [ ] Success criteria clear
- [ ] Launch timeline confirmed

**Signature:** _________________________

---

### Engineering Leadership Sign-Off

**VP Engineering / Engineering Manager:** _________________________
**Title:** _________________________
**Date:** _________________________
**Notes:** ___________________________________________________________________________

**Go/No-Go Decision:**

- [ ] **GO** - All criteria met, recommend launch
- [ ] **NO-GO** - Blockers remain, delay launch

**Signature:** _________________________

---

## Final Launch Preparation

### 48 Hours Before Launch

- [ ] All sign-offs obtained
- [ ] Feature flag prepared (defaults to disabled)
- [ ] Team on-call scheduled
- [ ] Communication templates prepared
- [ ] War room setup (https://meet.google.com/usdt-bsc-incident)
- [ ] Sponsor wallet funded with sufficient balance

### 24 Hours Before Launch

- [ ] Final production build created and tested
- [ ] Rollback procedure dry-run completed
- [ ] Monitoring dashboards spot-checked
- [ ] Team alerted to launch timing
- [ ] Customer support notified of new feature

### Launch Day (Phase 1 - Internal Testing)

- [ ] 10:00 AM UTC: Enable USDT_BSC_ENABLED for internal team only
- [ ] 10:00-10:30 AM: All team members test basic flows
- [ ] 10:30-11:00 AM: Monitor dashboard for any issues
- [ ] 11:00 AM-12:00 PM: Continue monitoring, check sponsor balance
- [ ] 12:00 PM: Go/no-go decision for Phase 2 (5% users)

### Post-Launch

- [ ] Daily monitoring checklist completed (first 7 days)
- [ ] Weekly review held (first month)
- [ ] Monthly capacity review held
- [ ] Post-incident retrospective if needed
- [ ] Documentation updated based on learnings

---

## Contingency Plan

If **ANY** sign-off category cannot be completed:

1. **Document the blocker clearly**
   - What is preventing sign-off?
   - How critical is it?
   - What's the mitigation/workaround?

2. **Evaluate risk**
   - Can launch proceed with known issue?
   - What's the impact if issue occurs in production?
   - Is rollback able to mitigate?

3. **Make decision**
   - Proceed with documented risk (requires VP approval)
   - Delay launch until fixed

4. **Communicate**
   - Notify team of decision
   - Update status page if needed
   - Adjust timelines

---

## Related Documentation

- [Feature Flags](./feature-flags.md) - Gradual rollout procedure
- [Rollback Procedures](./rollback-procedures.md) - Emergency procedures
- [Monitoring & Alerting](./monitoring.md) - Health checks during launch
- [Environment Setup](./environment-setup.md) - Configuration validation

---

**Document History:**
- **v1.0** (2026-03-14): Initial release
- [Will be updated post-launch]

**Next Steps:**
1. Print this checklist
2. Assign owners to each section
3. Start working through items
4. Update status weekly
5. Aim for 100% completion 48 hours before launch
