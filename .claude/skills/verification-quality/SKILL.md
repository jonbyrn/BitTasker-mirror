---
name: "Verification & Quality Assurance"
description: "Comprehensive truth scoring, code quality verification, and rollback system for ensuring high-quality agent outputs and codebase reliability."
version: "3.0.0"
category: "quality-assurance"
tags: ["verification", "truth-scoring", "quality", "rollback", "metrics", "ci-cd"]
---

# Verification & Quality Assurance Skill

## What This Skill Does

This skill provides a comprehensive verification and quality assurance system that ensures code quality and correctness through:

- **Truth Scoring**: Real-time reliability metrics (0.0-1.0 scale) for code, agents, and tasks
- **Verification Checks**: Automated code correctness, security, and best practices validation
- **Rollback**: Revert changes that fail verification
- **Quality Metrics**: Statistical analysis with trends, confidence intervals, and improvement tracking
- **CI/CD Integration**: Export capabilities for continuous integration pipelines
- **Real-time Monitoring**: Live dashboards and watch modes for ongoing verification

## Quick Start

```bash
# Type check
npm run check

# Lint
npm run lint

# Run targeted tests
npm run test:unit:components

# Full CI suite
npm run test:ci
```

---

## Complete Guide

### Truth Scoring System

#### View Truth Metrics

Display comprehensive quality and reliability metrics for your codebase.

**Basic Workflow:**
```bash
# Type check and lint
npm run check && npm run lint

# Run tests with coverage
npm run test:ci

# Check GitNexus for affected scope
gitnexus_detect_changes
```

#### Metrics Explained

**Truth Scores (0.0-1.0):**
- `1.0-0.95`: Excellent (production-ready)
- `0.94-0.85`: Good (acceptable quality)
- `0.84-0.75`: Warning (needs attention)
- `<0.75`: Critical (requires immediate action)

**Trend Indicators:**
- Improving (positive trend)
- Stable (consistent performance)
- Declining (quality regression detected)

**Statistics:**
- **Mean Score**: Average truth score across all measurements
- **Median Score**: Middle value (less affected by outliers)
- **Standard Deviation**: Consistency of scores (lower = more consistent)
- **Confidence Interval**: Statistical reliability of measurements

### Verification Checks

#### Run Verification

Execute comprehensive verification checks on code.

**File Verification:**
```bash
# Type check the project
npm run check

# Lint specific file
npx eslint src/app.js

# Run tests for specific file
npm run test -- --reporter=verbose -- src/utils.test.ts
```

**Batch Verification:**
```bash
# Full CI pipeline
npm run check && npm run lint && npm run test:ci

# Run GitNexus impact analysis before changes
gitnexus_impact --target "symbolName" --direction "upstream"

# Verify changes before commit
gitnexus_detect_changes
```

#### Verification Criteria

The verification system evaluates:

1. **Code Correctness**
   - Syntax validation (`npm run check`)
   - Type checking (TypeScript)
   - Logic flow analysis
   - Error handling completeness

2. **Best Practices**
   - Code style adherence (`npm run lint`)
   - SOLID principles
   - Design patterns usage
   - Modularity and reusability

3. **Security**
   - Vulnerability scanning
   - Secret detection
   - Input validation
   - Authentication/authorization checks

4. **Performance**
   - Algorithmic complexity
   - Memory usage patterns
   - Database query optimization
   - Bundle size impact

5. **Documentation**
   - JSDoc/TypeDoc completeness
   - README accuracy
   - API documentation
   - Code comments quality

#### JSON Output for CI/CD

```bash
# Output test results as JSON
npm run test:ci -- --reporter=json > verification.json

# Example JSON structure:
{
  "overallScore": 0.947,
  "passed": true,
  "threshold": 0.95,
  "checks": [
    {
      "name": "code-correctness",
      "score": 0.98,
      "passed": true
    },
    {
      "name": "security",
      "score": 0.91,
      "passed": false,
      "issues": [...]
    }
  ]
}
```

### Rollback

#### Rollback Failed Changes

Automatically revert changes that fail verification checks.

**Basic Rollback:**
```bash
# Rollback to last known good state
git stash

# Rollback to specific commit
git reset --hard abc123

# Interactive rollback with preview
git checkout -p
```

**Smart Rollback:**
```bash
# Rollback only failed files (preserve good changes)
git checkout -- <failed-file>

# Rollback with automatic backup
git stash && git checkout -- <file>

# Dry-run mode (preview without executing)
git diff HEAD~1
```

**Rollback Performance:**
- Git-based rollback: <1 second
- Selective file rollback: <500ms
- Backup creation: Automatic before rollback

### Verification Reports

#### Generate Reports

Create detailed verification reports with metrics and visualizations.

**Report Workflow:**
```bash
# Collect all quality data
npm run test:ci -- --reporter=json > test-results.json
npm run check -- --pretty > type-check.txt
npm run lint -- --format json > lint-results.json

# Run GitNexus detect changes
gitnexus_detect_changes > changes.json

# Generate combined report
node scripts/generate-quality-report.js
```

**Report Content:**
- Overall truth scores
- Test pass/fail rates
- Type check results
- Linting results
- Change analysis from GitNexus
- Quality improvement trends
- Statistical confidence intervals

### Configuration

#### Quality Gates

Set verification preferences:

```json
{
  "verification": {
    "checks": {
      "typeCheck": true,
      "lint": true,
      "unitTests": true,
      "integrationTests": true,
      "e2eTests": false,
      "gitnexusDetect": true
    },
    "thresholds": {
      "testCoverage": 80,
      "lintErrors": 0,
      "typeErrors": 0
    }
  }
}
```

**Per-environment thresholds:**
```json
{
  "verification": {
    "thresholds": {
      "production": {
        "testCoverage": 90,
        "lintErrors": 0
      },
      "staging": {
        "testCoverage": 85,
        "lintErrors": 0
      },
      "development": {
        "testCoverage": 70,
        "lintErrors": 5
      }
    }
  }
}
```

### Integration Examples

#### CI/CD Integration

**GitHub Actions:**
```yaml
name: Quality Verification

on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Dependencies
        run: npm ci
      - name: Type Check
        run: npm run check
      - name: Lint
        run: npm run lint
      - name: Test
        run: npm run test:ci
      - name: GitNexus Detect Changes
        run: npx gitnexus detect_changes
```

**GitLab CI:**
```yaml
verify:
  stage: test
  script:
    - npm ci
    - npm run check
    - npm run lint
    - npm run test:ci
  artifacts:
    paths:
      - test-results.json
```

#### Pre-commit Hooks

Automatically verify before commits:

```bash
# .git/hooks/pre-commit example:
#!/bin/bash
npm run check -- --noEmit
npm run lint
npm run test:unit
```

### Performance Metrics

**Verification Speed:**
- Type check: <30s (typical project)
- Lint: <10s
- Unit tests: <30s (targeted)
- Full CI: <2min (test:ci)

**Rollback Speed:**
- Git-based rollback: <1s
- Selective file rollback: <500ms

### Troubleshooting

#### Common Issues

**Low Truth Scores:**
```bash
# Get detailed breakdown
npm run check -- --pretty

# Check specific criteria
npm run test -- --verbose

# Run impact analysis
gitnexus_impact --target "affectedSymbol" --direction "upstream"
```

**Rollback Failures:**
```bash
# Check git status
git status

# View commit history
git log --oneline -10

# Manual rollback
git reset --hard HEAD~1
```

### Exit Codes

- `0`: Verification passed
- `1`: Verification failed
- `2`: Error during verification (invalid input, system error)

### Best Practices

1. **Set Appropriate Thresholds**: Use strict checks for critical code, relaxed for experimental
2. **Enable Auto-rollback**: Prevent bad code from persisting
3. **Monitor Trends**: Track improvement over time, not just current scores
4. **Integrate with CI/CD**: Make verification part of your pipeline
5. **Run Targeted Tests First**: `npm run test:unit:components` before `npm run test:ci`
6. **Use GitNexus**: Run `detect_changes` before committing, `impact` before editing
7. **Run Translation Check**: `python3 scripts/find-missing-translations.py --fix-suggestions` before commits with i18n changes
8. **Store Learnings**: Use `mcp-memory_memory_store` to record quality patterns for future sessions
