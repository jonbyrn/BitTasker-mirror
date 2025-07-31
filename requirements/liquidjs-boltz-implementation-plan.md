# LiquidJS + Boltz Implementation Plan

## Executive Summary

This document outlines the implementation plan for transitioning from the current Breez SDK Liquid implementation to a new architecture using:
- **LiquidJS** for core wallet functionality
- **Boltz Exchange REST API** for submarine swaps
- **BTC Savings Wallet** for optional Bitcoin storage

The new stack will support LBTC, USDT over Liquid, Lightning (in/out), and BTC with improved user control and economic viability.

## Current State Analysis

### ✅ What's Already Implemented (Breez SDK)

1. **Core Wallet Infrastructure**
   - ✅ WASM-based Breez SDK integration (`@breeztech/breez-sdk-liquid`)
   - ✅ Basic wallet connection and initialization
   - ✅ Lightning payment limits fetching
   - ✅ Basic send/receive payment preparation
   - ✅ Transaction history listing
   - ✅ Event handling and state management
   - ✅ Fiat rate fetching

2. **UI Components**
   - ✅ Wallet dashboard with tabs (Balance, Receive, Send, Transactions)
   - ✅ Balance display card
   - ✅ Payment request form (Lightning invoices)
   - ✅ Recent transactions component
   - ✅ Transaction history component
   - ✅ Basic send form (incomplete)

3. **Technical Infrastructure**
   - ✅ Svelte 5 + SvelteKit 2 framework
   - ✅ TypeScript configuration
   - ✅ Wallet service abstraction layer
   - ✅ WASM loader utilities
   - ✅ Request throttling system

### ❌ Missing Critical Features

1. **Multi-Asset Support**
   - ❌ USDT over Liquid wallet functionality
   - ❌ Asset selection in send/receive forms
   - ❌ Multi-asset balance display
   - ❌ Asset-specific fee calculation
   - ❌ Cross-asset conversion rates

2. **Bitcoin Savings Wallet**
   - ❌ Separate BTC wallet implementation
   - ❌ Swap interface to/from Liquid
   - ❌ BTC address generation and management
   - ❌ BTC transaction broadcasting

3. **Boltz Integration**
   - ❌ Boltz API client implementation
   - ❌ Submarine swap creation and monitoring
   - ❌ Swap status tracking and updates
   - ❌ Swap refund mechanisms

4. **Production-Ready Features**
   - ❌ Comprehensive error handling
   - ❌ Swap failure recovery
   - ❌ Transaction status monitoring
   - ❌ Proper loading states and UX feedback
   - ❌ Security key management
   - ❌ Backup/recovery system

## Implementation Plan

### Phase 1: Foundation Layer (2-3 weeks)

#### 1.1 LiquidJS Integration
**Goal**: Replace Breez SDK with direct LiquidJS implementation

**Tasks**:
- [ ] Install and configure LiquidJS (`liquidjs-lib`)
- [ ] Implement Liquid network connection management
- [ ] Create Liquid wallet class with key management
- [ ] Implement address generation (confidential addresses)
- [ ] Add transaction creation and broadcasting
- [ ] Implement UTXO management and selection
- [ ] Add blinding key handling for confidential transactions

**Files to Create**:
- `src/lib/wallet/liquid/liquidWallet.ts`
- `src/lib/wallet/liquid/types.ts` 
- `src/lib/wallet/liquid/utils.ts`
- `src/lib/wallet/liquid/keyManager.ts`

#### 1.2 Asset Management System
**Goal**: Support LBTC and USDT with extensible asset framework

**Tasks**:
- [ ] Define asset metadata structure
- [ ] Implement asset registry with L-BTC and USDT
- [ ] Create asset balance tracking
- [ ] Add asset-specific validation logic
- [ ] Implement asset conversion utilities

**Files to Create**:
- `src/lib/wallet/assets/assetRegistry.ts`
- `src/lib/wallet/assets/types.ts`
- `src/lib/wallet/assets/utils.ts`

#### 1.3 Boltz API Client
**Goal**: Complete Boltz Exchange REST API integration

**Tasks**:
- [ ] Implement Boltz API client with full endpoint coverage
- [ ] Add submarine swap creation (Normal swaps: Lightning → Bitcoin)
- [ ] Add reverse submarine swap creation (Reverse swaps: Bitcoin → Lightning) 
- [ ] Implement swap status monitoring and webhooks
- [ ] Add swap refund functionality
- [ ] Implement rate fetching and fee calculation
- [ ] Add proper error handling and retry logic

**Files to Create**:
- `src/lib/integrations/boltz/client.ts`
- `src/lib/integrations/boltz/types.ts`
- `src/lib/integrations/boltz/swapManager.ts`
- `src/lib/integrations/boltz/webhooks.ts`

### Phase 2: Core Wallet Operations (3-4 weeks)

#### 2.1 Enhanced Send Operations
**Goal**: Complete send functionality for all supported assets

**Tasks**:
- [ ] Implement multi-asset send preparation
- [ ] Add Lightning invoice parsing and validation
- [ ] Create Liquid address send functionality
- [ ] Implement Bitcoin address send with Boltz swaps
- [ ] Add proper fee estimation for each asset type
- [ ] Implement transaction signing and broadcasting
- [ ] Add transaction status tracking

**Files to Update**:
- `src/lib/wallet/breez/walletService.ts` → `src/lib/wallet/walletService.ts`
- `src/routes/(protected)/dashboard/wallet/_components/sendTab/`

#### 2.2 Enhanced Receive Operations  
**Goal**: Complete receive functionality for all supported assets

**Tasks**:
- [ ] Implement Lightning invoice generation
- [ ] Add Liquid address generation for LBTC/USDT
- [ ] Create Bitcoin address generation with Boltz integration
- [ ] Implement payment request QR code generation
- [ ] Add payment monitoring and status updates
- [ ] Implement webhook handling for payments

**Files to Update**:
- `src/routes/(protected)/dashboard/wallet/_components/receiveTab/`

#### 2.3 Bitcoin Savings Wallet
**Goal**: Implement separate BTC wallet with swap functionality

**Tasks**:
- [ ] Create Bitcoin wallet class (HD wallet)
- [ ] Implement Bitcoin address generation and management
- [ ] Add Bitcoin transaction creation and broadcasting
- [ ] Create swap interface (Liquid ↔ Bitcoin via Boltz)
- [ ] Implement swap scheduling and automation
- [ ] Add proper backup and recovery for Bitcoin keys

**Files to Create**:
- `src/lib/wallet/bitcoin/bitcoinWallet.ts`
- `src/lib/wallet/bitcoin/types.ts`
- `src/lib/wallet/swaps/swapManager.ts`

### Phase 3: Advanced Features (2-3 weeks)

#### 3.1 Multi-Asset UI/UX
**Goal**: Complete multi-asset user interface

**Tasks**:
- [ ] Redesign balance card for multiple assets
- [ ] Add asset selection components
- [ ] Implement asset-specific send/receive forms
- [ ] Create asset conversion calculator
- [ ] Add multi-asset transaction history
- [ ] Implement asset-specific QR codes

**Components to Create/Update**:
- `BalanceCard.svelte` - Multi-asset balance display
- `AssetSelector.svelte` - Asset selection component
- `SwapInterface.svelte` - Liquid ↔ Bitcoin swap UI
- `TransactionHistory.svelte` - Multi-asset transaction list

#### 3.2 Swap Management UI
**Goal**: User-friendly swap interface and monitoring

**Tasks**:
- [ ] Create swap initiation interface
- [ ] Implement swap status monitoring dashboard
- [ ] Add swap history and management
- [ ] Create swap failure recovery UI
- [ ] Implement automated swap scheduling
- [ ] Add swap cost/benefit calculator

**Components to Create**:
- `SwapDashboard.svelte`
- `SwapStatusMonitor.svelte`
- `SwapHistory.svelte`
- `SwapRecovery.svelte`

#### 3.3 Security & Backup
**Goal**: Production-ready security features

**Tasks**:
- [ ] Implement secure key storage (browser-based)
- [ ] Add seed phrase backup/recovery system
- [ ] Create PIN/password protection
- [ ] Implement transaction signing security
- [ ] Add device-specific security measures
- [ ] Create audit trail for sensitive operations

### Phase 4: Production Readiness (2-3 weeks)

#### 4.1 Error Handling & Recovery
**Goal**: Robust error handling and user recovery

**Tasks**:
- [ ] Implement comprehensive error boundaries
- [ ] Add automatic retry mechanisms for failed operations
- [ ] Create user-friendly error messages and recovery actions
- [ ] Implement transaction failure recovery
- [ ] Add network connectivity handling
- [ ] Create emergency wallet recovery procedures

#### 4.2 Performance & Optimization  
**Goal**: Optimize for production performance

**Tasks**:
- [ ] Implement efficient UTXO management
- [ ] Add transaction batching capabilities
- [ ] Optimize asset metadata loading
- [ ] Implement proper caching strategies
- [ ] Add background sync operations
- [ ] Optimize UI performance for large transaction histories

#### 4.3 Testing & Quality Assurance
**Goal**: Comprehensive testing coverage

**Tasks**:
- [ ] Unit tests for all wallet operations
- [ ] Integration tests with Boltz API
- [ ] End-to-end testing for complete workflows
- [ ] Security testing for key management
- [ ] Performance testing under load
- [ ] Browser compatibility testing

## Technical Architecture

### New Architecture Stack

```
┌─────────────────────────────────────────────────────────────┐
│                        UI Layer (Svelte 5)                 │
├─────────────────────────────────────────────────────────────┤
│                    Wallet Service Layer                     │
├─────────────────────────────────────────────────────────────┤
│  LiquidJS Wallet  │  Bitcoin Wallet  │   Boltz Client       │
├─────────────────────────────────────────────────────────────┤
│  Liquid Network   │  Bitcoin Network │   Boltz Exchange     │
└─────────────────────────────────────────────────────────────┘
```

### Key Dependencies to Add

```json
{
  "dependencies": {
    "liquidjs-lib": "^6.0.0",
    "bitcoinjs-lib": "^6.1.0", 
    "bip32": "^4.0.0",
    "bip39": "^3.1.0",
    "axios": "^1.6.0",
    "qrcode": "^1.5.3"
  }
}
```

### Asset Support Matrix

| Asset | Network | Send | Receive | Lightning | Bitcoin | Notes |
|-------|---------|------|---------|-----------|---------|-------|
| L-BTC | Liquid  | ✅   | ✅      | Via Boltz | Via Boltz | Primary asset |
| USDT  | Liquid  | ✅   | ✅      | Via Boltz | No       | Stablecoin |
| BTC   | Bitcoin | ✅   | ✅      | Via Boltz | Native   | Savings wallet |
| Lightning | Lightning | ✅ | ✅    | Native    | Via Boltz | Not stored |

## Migration Strategy

### Phase 1: Parallel Implementation
- Keep existing Breez SDK functionality
- Implement new LiquidJS wallet alongside
- Allow users to choose implementation

### Phase 2: Feature Parity
- Ensure new implementation matches all Breez features
- Add missing multi-asset capabilities
- Implement comprehensive testing

### Phase 3: Migration
- Migrate user funds from Breez to new wallet
- Provide clear migration instructions
- Maintain backward compatibility for recovery

### Phase 4: Cleanup
- Remove Breez SDK dependencies
- Clean up legacy code
- Optimize bundle size

## Risk Mitigation

### Technical Risks
- **Liquid Network Complexity**: Implement comprehensive testing on testnet
- **Key Management Security**: Use established libraries and security practices
- **Boltz API Reliability**: Implement proper retry logic and fallback mechanisms
- **Multi-Asset Complexity**: Start with L-BTC/USDT only, expand gradually

### User Experience Risks
- **Complexity Increase**: Design intuitive UI with clear asset separation
- **Migration Difficulty**: Provide step-by-step migration tools
- **Performance Issues**: Implement proper loading states and optimization

### Business Risks  
- **Development Timeline**: Use phased approach with regular deliverables
- **User Adoption**: Maintain feature parity during transition
- **Regulatory Compliance**: Ensure all implementations meet compliance requirements

## Success Metrics

### Technical Metrics
- [ ] 100% feature parity with current Breez implementation
- [ ] < 3 second transaction confirmation times
- [ ] < 1% transaction failure rate
- [ ] 99.9% uptime for wallet operations

### User Experience Metrics
- [ ] < 5 clicks for any common operation
- [ ] < 30 seconds for transaction completion
- [ ] Positive user feedback on multi-asset functionality
- [ ] Successful migration of 95%+ existing users

## Next Steps

1. **Review and Approval**: Review this plan and approve technical approach
2. **Environment Setup**: Set up development environment with new dependencies
3. **Phase 1 Kickoff**: Begin LiquidJS integration and Boltz API client development
4. **Regular Check-ins**: Weekly progress reviews and plan adjustments
5. **Testing Strategy**: Define comprehensive testing approach for each phase

---

**Estimated Total Timeline**: 10-13 weeks  
**Team Size**: 2-3 developers  
**Priority Level**: High - Critical for product scalability and user control