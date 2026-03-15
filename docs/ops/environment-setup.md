# USDT-BSC Environment Configuration

**Document Version:** 1.0
**Last Updated:** 2026-03-14
**Owner:** Platform Engineering
**Audience:** DevOps Engineers, Site Reliability Engineers

## Overview

This document specifies all environment variables and configuration required to deploy and operate USDT-BSC payment system across different environments (local, staging, mainnet).

## Required Environment Variables

### Core Configuration

```bash
# Feature flag: Enable/disable USDT-BSC payments
USDT_BSC_ENABLED=false                    # (false for gradual rollout)

# Network configuration
VITE_BSC_NETWORK=mainnet                  # mainnet or testnet
VITE_BSC_CHAIN_ID=56                      # 56 = BSC mainnet, 97 = testnet

# USDT Token Configuration
VITE_BSC_USDT_TOKEN_ADDRESS=0x55d398326f99059ff775485246999027b3197955
VITE_BSC_USDT_DECIMALS=18

# Direct Send Router Contract
VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS=0x[ROUTER_ADDRESS]
VITE_BSC_DIRECT_SEND_FIXED_FEE_ATOMIC=100000000000000000  # 0.1 USDT in atomic units

# RPC Provider Configuration
VITE_BSC_RPC_URL=https://bsc-dataseed.binance.org
VITE_BSC_RPC_BACKUP_URL=https://bsc-dataseed1.binance.org:8545

# Sponsor Service (optional - for gas-less transactions)
VITE_BSC_SPONSOR_SERVICE_URL=https://sponsor.bitaskier.com
VITE_BSC_SPONSOR_SERVICE_API_KEY=[KEEP_SECURE]
VITE_BSC_SPONSOR_REQUEST_TIMEOUT=30000    # 30 seconds

# Monitoring & Analytics
VITE_USDT_TRANSACTION_LOG_LEVEL=info      # debug, info, warn, error
VITE_USDT_METRICS_ENABLED=true
```

---

## Environment-Specific Configuration

### Local Development

```bash
# .env.local

USDT_BSC_ENABLED=true
VITE_BSC_NETWORK=testnet
VITE_BSC_CHAIN_ID=97
VITE_BSC_USDT_TOKEN_ADDRESS=0x337610d27c682e347c9cd60bd4b3b107c9d34ddd  # Testnet USDT
VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS=0x[LOCAL_ROUTER]
VITE_BSC_DIRECT_SEND_FIXED_FEE_ATOMIC=100000000000000000
VITE_BSC_RPC_URL=https://data-seed-prebsc-1-1.binance.org:8545
VITE_BSC_SPONSOR_SERVICE_URL=http://localhost:3001
VITE_USDT_TRANSACTION_LOG_LEVEL=debug
```

### Staging Environment

```bash
# .env.staging

USDT_BSC_ENABLED=true                     # Always enabled in staging
VITE_BSC_NETWORK=testnet
VITE_BSC_CHAIN_ID=97
VITE_BSC_USDT_TOKEN_ADDRESS=0x337610d27c682e347c9cd60bd4b3b107c9d34ddd
VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS=0x[STAGING_ROUTER]
VITE_BSC_DIRECT_SEND_FIXED_FEE_ATOMIC=100000000000000000
VITE_BSC_RPC_URL=https://data-seed-prebsc-1-1.binance.org:8545
VITE_BSC_SPONSOR_SERVICE_URL=https://sponsor-staging.bitaskier.com
VITE_BSC_SPONSOR_SERVICE_API_KEY=[STAGING_KEY]
VITE_USDT_TRANSACTION_LOG_LEVEL=info
VITE_USDT_METRICS_ENABLED=true
```

### Production (Mainnet)

```bash
# .env.production

USDT_BSC_ENABLED=false                    # Disabled until feature flag rollout
VITE_BSC_NETWORK=mainnet
VITE_BSC_CHAIN_ID=56
VITE_BSC_USDT_TOKEN_ADDRESS=0x55d398326f99059ff775485246999027b3197955
VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS=0x[PRODUCTION_ROUTER]
VITE_BSC_DIRECT_SEND_FIXED_FEE_ATOMIC=100000000000000000
VITE_BSC_RPC_URL=https://bsc-dataseed.binance.org
VITE_BSC_RPC_BACKUP_URL=https://bsc-dataseed1.binance.org:8545
VITE_BSC_SPONSOR_SERVICE_URL=https://sponsor.bitaskier.com
VITE_BSC_SPONSOR_SERVICE_API_KEY=[PRODUCTION_KEY]
VITE_USDT_TRANSACTION_LOG_LEVEL=warn
VITE_USDT_METRICS_ENABLED=true
```

---

## Network Configuration Details

### BSC Testnet (Chain ID: 97)

```yaml
Network:
  Name: BSC Testnet (Sepolia)
  Chain ID: 97

RPC Endpoints:
  Primary: https://data-seed-prebsc-1-1.binance.org:8545
  Backup1: https://data-seed-prebsc-2-1.binance.org:8545
  Backup2: https://data-seed-prebsc-1-2.binance.org:8545

Contract Addresses:
  USDT: "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd"
  DirectSendRouter: "0x[TESTNET_ROUTER]"

Block Explorer: https://testnet.bscscan.com
Faucets:
  - https://testnet.binance.org/faucet-smart

Test Tokens:
  # Use faucets above to get test BNB and USDT

Gas Settings:
  Standard: 5 gwei
  Fast: 10 gwei
  Instant: 20 gwei
```

### BSC Mainnet (Chain ID: 56)

```yaml
Network:
  Name: Binance Smart Chain
  Chain ID: 56

RPC Endpoints:
  Primary: https://bsc-dataseed.binance.org
  Backup1: https://bsc-dataseed1.binance.org:8545
  Backup2: https://bsc-dataseed2.binance.org:8545
  Backup3: https://bsc-dataseed3.binance.org:8545
  Backup4: https://bsc-dataseed4.binance.org:8545

Contract Addresses:
  USDT: "0x55d398326f99059ff775485246999027b3197955"
  DirectSendRouter: "0x[PRODUCTION_ROUTER]"

Block Explorer: https://bscscan.com

Gas Settings:
  Standard: 1-2 gwei
  Fast: 2-5 gwei
  Instant: 5-10 gwei
```

---

## Smart Contract Configuration

### USDT Token (BEP-20)

```typescript
// Configuration validation
const USDT_CONFIG = {
  mainnet: {
    address: '0x55d398326f99059ff775485246999027b3197955',
    decimals: 18,
    name: 'Tether USD',
    symbol: 'USDT',
    chain: 'BSC'
  },
  testnet: {
    address: '0x337610d27c682e347c9cd60bd4b3b107c9d34ddd',
    decimals: 18,
    name: 'Tether USD',
    symbol: 'USDT',
    chain: 'BSC Testnet'
  }
};

// Verify token contract is callable
async function validateUSDTContract(config) {
  const contract = new ethers.Contract(
    config.address,
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );

  try {
    const balance = await contract.balanceOf(ethers.constants.AddressZero);
    console.log('✓ USDT token contract is callable');
    return true;
  } catch (error) {
    console.error('✗ USDT token contract validation failed:', error);
    return false;
  }
}
```

### Direct Send Router

```typescript
// Configuration validation
const ROUTER_CONFIG = {
  mainnet: {
    address: '0x[PRODUCTION_ROUTER]',
    fixedFeeAtomic: 100000000000000000,  // 0.1 USDT
    fixedFeeDecimal: 0.1,
    allowanceCheckRequired: true
  },
  testnet: {
    address: '0x[TESTNET_ROUTER]',
    fixedFeeAtomic: 100000000000000000,
    fixedFeeDecimal: 0.1,
    allowanceCheckRequired: true
  }
};

// Verify router contract is callable
async function validateRouterContract(config) {
  const contract = new ethers.Contract(
    config.address,
    ['function sendDirect(address to, uint256 amount) external'],
    provider
  );

  try {
    // Try a gas estimate (doesn't send transaction)
    const gasEstimate = await contract.estimateGas.sendDirect(
      ethers.constants.AddressZero,
      0
    );
    console.log('✓ Router contract is callable');
    return true;
  } catch (error) {
    console.error('✗ Router contract validation failed:', error);
    return false;
  }
}
```

---

## Environment Validation Checklist

Run this checklist before deploying to any environment:

```bash
#!/bin/bash

# USDT-BSC Environment Validation Script
# Usage: ./validate-usdt-env.sh [environment]

ENVIRONMENT=${1:-local}
ENV_FILE=".env.${ENVIRONMENT}"

echo "========================================="
echo "USDT-BSC Environment Validation"
echo "Environment: $ENVIRONMENT"
echo "========================================="

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

check_passed=0
check_failed=0

# Helper function
check_var() {
  local var_name=$1
  local var_value=${!var_name}

  if [ -z "$var_value" ]; then
    echo -e "${RED}✗${NC} $var_name: NOT SET"
    ((check_failed++))
  else
    echo -e "${GREEN}✓${NC} $var_name: Set"
    ((check_passed++))
  fi
}

# Load environment file
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}✗${NC} Environment file not found: $ENV_FILE"
  exit 1
fi

source "$ENV_FILE"

echo ""
echo "1. Required Variables"
echo "--------------------"
check_var "VITE_BSC_NETWORK"
check_var "VITE_BSC_CHAIN_ID"
check_var "VITE_BSC_USDT_TOKEN_ADDRESS"
check_var "VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS"
check_var "VITE_BSC_RPC_URL"

echo ""
echo "2. Address Format Validation"
echo "----------------------------"

# Validate Ethereum addresses
validate_address() {
  local addr=$1
  local name=$2

  if [[ $addr =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo -e "${GREEN}✓${NC} $name: Valid format"
    ((check_passed++))
  else
    echo -e "${RED}✗${NC} $name: Invalid format (expected 0x + 40 hex chars)"
    ((check_failed++))
  fi
}

validate_address "$VITE_BSC_USDT_TOKEN_ADDRESS" "USDT Token Address"
validate_address "$VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS" "Router Address"

echo ""
echo "3. Network Configuration"
echo "-----------------------"

if [ "$VITE_BSC_NETWORK" = "mainnet" ] && [ "$VITE_BSC_CHAIN_ID" != "56" ]; then
  echo -e "${RED}✗${NC} Mainnet selected but Chain ID is not 56"
  ((check_failed++))
elif [ "$VITE_BSC_NETWORK" = "testnet" ] && [ "$VITE_BSC_CHAIN_ID" != "97" ]; then
  echo -e "${RED}✗${NC} Testnet selected but Chain ID is not 97"
  ((check_failed++))
else
  echo -e "${GREEN}✓${NC} Network/Chain ID match"
  ((check_passed++))
fi

echo ""
echo "4. RPC Connectivity (if online)"
echo "--------------------------------"

if command -v curl &> /dev/null; then
  response=$(curl -s -X POST "$VITE_BSC_RPC_URL" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"net_version","params":[],"id":1}' \
    | jq '.result' 2>/dev/null)

  if [ -n "$response" ] && [ "$response" != "null" ]; then
    echo -e "${GREEN}✓${NC} RPC endpoint is responding"
    echo "  Chain ID from RPC: $response"
    ((check_passed++))
  else
    echo -e "${RED}✗${NC} RPC endpoint not responding (may be offline)"
    ((check_failed++))
  fi
else
  echo "⊘ curl not available, skipping RPC connectivity test"
fi

echo ""
echo "5. Smart Contract Validation (if online)"
echo "----------------------------------------"

if command -v node &> /dev/null; then
  # This requires ethers.js to be installed
  cat > /tmp/validate-contracts.js << 'NODEJS'
    const ethers = require('ethers');
    const USDT_ADDRESS = process.env.VITE_BSC_USDT_TOKEN_ADDRESS;
    const ROUTER_ADDRESS = process.env.VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS;
    const RPC_URL = process.env.VITE_BSC_RPC_URL;

    const provider = new ethers.JsonRpcProvider(RPC_URL);

    async function validate() {
      try {
        // Check USDT contract
        const code = await provider.getCode(USDT_ADDRESS);
        if (code !== '0x') {
          console.log('✓ USDT token contract found on chain');
        } else {
          console.log('✗ USDT token contract NOT found at specified address');
        }

        // Check Router contract
        const routerCode = await provider.getCode(ROUTER_ADDRESS);
        if (routerCode !== '0x') {
          console.log('✓ Router contract found on chain');
        } else {
          console.log('✗ Router contract NOT found at specified address');
        }
      } catch (error) {
        console.log('⊘ Could not validate contracts:', error.message);
      }
    }

    validate();
NODEJS

  node /tmp/validate-contracts.js
else
  echo "⊘ Node.js not available, skipping contract validation"
fi

echo ""
echo "========================================="
echo "Summary"
echo "========================================="
echo -e "${GREEN}Passed:${NC} $check_passed"
echo -e "${RED}Failed:${NC} $check_failed"
echo "========================================="

if [ $check_failed -eq 0 ]; then
  echo -e "${GREEN}✓ All checks passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some checks failed. Please fix before deploying.${NC}"
  exit 1
fi
```

---

## Secret Management

### Secure Storage

Never commit secrets to version control. Use your platform's secret management:

```bash
# AWS Secrets Manager
aws secretsmanager create-secret \
  --name usdt-bsc/production/sponsor-api-key \
  --secret-string "$(< /secure/location/api-key.txt)"

# HashiCorp Vault
vault kv put secret/usdt-bsc/sponsor-service \
  api_key="$SPONSOR_API_KEY" \
  service_url="$SPONSOR_SERVICE_URL"

# Kubernetes Secrets
kubectl create secret generic usdt-bsc-secrets \
  --from-literal=sponsor-api-key=$SPONSOR_API_KEY \
  --from-literal=rpc-backup-url=$RPC_BACKUP_URL \
  -n production
```

### Loading Secrets at Runtime

```typescript
// src/lib/config/secrets.ts
export async function loadSecrets() {
  const sponsorApiKey = process.env.VITE_BSC_SPONSOR_SERVICE_API_KEY;

  if (!sponsorApiKey) {
    throw new Error(
      'VITE_BSC_SPONSOR_SERVICE_API_KEY not set. ' +
      'Load from secret management system.'
    );
  }

  return {
    sponsorApiKey,
    // ... other secrets
  };
}

// Never log or expose secrets
if (process.env.NODE_ENV === 'development') {
  console.log('✓ Secrets loaded successfully');
  // DO NOT console.log(secrets) or secrets.sponsorApiKey
}
```

---

## Gas & Fee Configuration

### Fee Structure

```typescript
// Fixed fee per transaction (collected from sender)
VITE_BSC_DIRECT_SEND_FIXED_FEE_ATOMIC = 100000000000000000  // 0.1 USDT

// Fee calculation
const feeInAtomicUnits = 100000000000000000;
const feeInUSDT = feeInAtomicUnits / (10 ** 18);  // 0.1 USDT

// Applied to send, not receive
// Example: User sends 10 USDT
// - User balance decreases: 10.1 USDT
// - Recipient receives: 10.0 USDT
// - Fee collected: 0.1 USDT
```

### Gas Budget (BNB)

```bash
# Sponsor service needs sufficient BNB for gas

# Typical gas costs on BSC:
# - USDT transfer: ~60k gas
# - Router contract interaction: ~120k gas
# - Total: ~180k gas per transaction

# At 5 gwei gas price:
# 180,000 gas × 5 gwei = 900,000 wei = 0.0009 BNB per transaction

# Daily budget (assuming 1000 transactions/day):
# 0.0009 BNB × 1000 = 0.9 BNB/day (~$350/day at $390/BNB)

# Recommended sponsor balance:
# 10 BNB = ~10 days operational runway
```

---

## Deployment Validation

### Pre-Deployment Checklist

```markdown
## USDT-BSC Configuration Pre-Deployment Checklist

**Environment:** ________________
**Deployed By:** ________________
**Approval:** ________________

### Configuration
- [ ] All required environment variables set
- [ ] Addresses match expected contracts
- [ ] Chain IDs correct for network
- [ ] No hardcoded secrets in code
- [ ] Sponsor API key secure (not in logs)

### Network Setup
- [ ] RPC endpoints responding
- [ ] Block explorer accessible
- [ ] Contracts verified on explorer
- [ ] Gas prices reasonable for network

### Wallet/Sponsor Setup
- [ ] Sponsor wallet has sufficient balance
  - Testnet: >= 1 BNB + test USDT
  - Mainnet: >= 10 BNB + 10,000 USDT
- [ ] Sponsor service running and healthy
- [ ] API keys rotated and secure
- [ ] Rate limiting configured

### Monitoring Setup
- [ ] Dashboards loading
- [ ] Alerts configured and tested
- [ ] Log aggregation working
- [ ] Metrics collection enabled

### Testing
- [ ] Integration tests pass on target network
- [ ] End-to-end payment flow tested
- [ ] Error scenarios tested (insufficient balance, etc.)
- [ ] Rollback procedure tested

### Documentation
- [ ] Team trained on configuration
- [ ] Runbooks updated with network-specific info
- [ ] Emergency contacts available
- [ ] Escalation path clear

**Sign-Off:** _________________ (Date)
```

---

## Troubleshooting

### Configuration Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Contract not found" | Wrong address or wrong network | Verify address matches network in block explorer |
| "RPC timeout" | RPC provider down or slow | Switch to backup RPC, check provider status |
| "Invalid chain ID" | Network mismatch | Ensure wallet/provider chain ID matches VITE_BSC_CHAIN_ID |
| "Insufficient gas" | Sponsor BNB balance low | Replenish sponsor wallet balance |
| "Token transfer failed" | Allowance not set or insufficient | Check USDT balance and set approval for router |

---

## Related Documentation

- [Feature Flags](./feature-flags.md) - Enabling USDT-BSC
- [Monitoring & Alerting](./monitoring.md) - Health checks
- [Pre-Launch Checklist](./pre-launch-checklist.md) - Go/no-go criteria
- [Rollback Procedures](./rollback-procedures.md) - Emergency procedures

## Support & Escalation

**Configuration Questions:** Platform Engineering
**Smart Contract Issues:** Blockchain Team
**RPC Provider Issues:** Cloud Ops

---

**Document History:**
- **v1.0** (2026-03-14): Initial release
- [Will be updated with production addresses]
