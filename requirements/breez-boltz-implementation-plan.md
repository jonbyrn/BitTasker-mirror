# Breez + Boltz Implementation Plan

## Executive Summary

This document outlines the implementation plan for enhancing the current Breez SDK Liquid implementation with additional capabilities using:
- **Breez SDK Liquid** for core wallet functionality (maintained)
- **Boltz Exchange REST API** for submarine swaps and additional asset support
- **BTC Savings Wallet** for optional Bitcoin storage

The enhanced stack will support LBTC, USDT over Liquid, Lightning (in/out), and BTC with improved user control and economic viability, while leveraging the existing Breez infrastructure.

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

#### 1.1 Enhanced Breez SDK Integration
**Goal**: Improve current Breez SDK implementation and add missing features

**Tasks**:
- [ ] Complete Breez SDK multi-asset configuration
- [ ] Implement proper asset metadata handling for USDT
- [ ] Add comprehensive error handling for Breez operations
- [ ] Enhance transaction status monitoring
- [ ] Implement proper event listener management
- [ ] Add asset balance tracking and display
- [ ] Complete send payment functionality
- [ ] Integrate passkey verification for Breez wallet operations

**Files to Update**:
- `src/lib/wallet/breez/walletService.ts` - Add missing multi-asset functions and passkey integration
- `src/lib/wallet/breez/types.ts` - Add asset-specific types
- `src/lib/wallet/breez/utils.ts` - Add asset utilities
- `src/lib/wallet/breez/security.ts` - New file for passkey integration

#### 1.2 Boltz API Client Integration
**Goal**: Complete Boltz Exchange REST API integration for BTC swaps

**Tasks**:
- [ ] Implement Boltz API client with full endpoint coverage
- [ ] Add submarine swap creation (Lightning → Bitcoin)
- [ ] Add reverse submarine swap creation (Bitcoin → Lightning) 
- [ ] Implement swap status monitoring and webhooks
- [ ] Add swap refund functionality
- [ ] Implement rate fetching and fee calculation
- [ ] Add proper error handling and retry logic

**Files to Create**:
- `src/lib/integrations/boltz/client.ts`
- `src/lib/integrations/boltz/types.ts`
- `src/lib/integrations/boltz/swapManager.ts`
- `src/lib/integrations/boltz/webhooks.ts`

#### 1.3 Bitcoin Wallet Foundation
**Goal**: Create separate Bitcoin wallet for savings functionality

**Tasks**:
- [ ] Install and configure BitcoinJS (`bitcoinjs-lib`, `bip32`, `bip39`)
- [ ] Create Bitcoin HD wallet class
- [ ] Implement Bitcoin address generation and management
- [ ] Add Bitcoin transaction creation and broadcasting
- [ ] Integrate with Boltz for Liquid ↔ Bitcoin swaps
- [ ] Add proper key management and security

**Files to Create**:
- `src/lib/wallet/bitcoin/bitcoinWallet.ts`
- `src/lib/wallet/bitcoin/types.ts`
- `src/lib/wallet/bitcoin/utils.ts`
- `src/lib/wallet/bitcoin/keyManager.ts`
- `src/lib/wallet/bitcoin/security.ts` - Passkey integration for Bitcoin wallet

### Phase 2: Core Wallet Operations (3-4 weeks)

#### 2.1 Enhanced Send Operations
**Goal**: Complete send functionality for all supported assets

**Tasks**:
- [ ] Implement multi-asset send preparation with passkey verification
- [ ] Add Lightning invoice parsing and validation
- [ ] Create Liquid address send functionality with passkey re-authorization
- [ ] Implement Bitcoin address send with Boltz swaps and passkey confirmation
- [ ] Add proper fee estimation for each asset type
- [ ] Implement transaction signing and broadcasting with passkey validation
- [ ] Add transaction status tracking
- [ ] Create passkey verification UI for all send operations

**Files to Update**:
- `src/lib/wallet/breez/walletService.ts` - Enhance existing Breez functions
- `src/routes/(protected)/dashboard/wallet/_components/sendTab/` - New send components

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

#### 2.3 Integrated Wallet Management
**Goal**: Integrate Breez Liquid wallet with Bitcoin savings and Boltz swaps

**Tasks**:
- [ ] Create unified wallet interface combining Breez + Bitcoin wallets
- [ ] Implement wallet-to-wallet swap functionality via Boltz
- [ ] Add swap scheduling and automation features
- [ ] Create unified transaction history across both wallets
- [ ] Implement proper backup and recovery for all keys
- [ ] Add wallet switching UI and management

**Files to Create**:
- `src/lib/wallet/unifiedWallet.ts`
- `src/lib/wallet/swaps/swapManager.ts`
- `src/lib/wallet/swaps/types.ts`

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

#### 3.3 Enhanced Security with Passkeys
**Goal**: Production-ready security features with passkey integration

**Tasks**:
- [ ] Integrate existing passkey system for wallet operations
- [ ] Implement passkey re-authorization for all send transactions
- [ ] Add passkey verification for off-platform fund transfers
- [ ] Create secure key storage with passkey protection
- [ ] Add seed phrase backup/recovery with passkey unlock
- [ ] Implement transaction signing security with passkey validation
- [ ] Create audit trail for all sensitive wallet operations
- [ ] Add device-specific security measures with passkey binding

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

### Enhanced Architecture Stack

```
┌─────────────────────────────────────────────────────────────┐
│                        UI Layer (Svelte 5)                 │
├─────────────────────────────────────────────────────────────┤
│                 Unified Wallet Service Layer               │
├─────────────────────────────────────────────────────────────┤
│  Breez SDK Liquid │  Bitcoin Wallet  │   Boltz Client       │
├─────────────────────────────────────────────────────────────┤
│  Liquid Network   │  Bitcoin Network │   Boltz Exchange     │
└─────────────────────────────────────────────────────────────┘
```

### Key Dependencies to Add

```json
{
  "dependencies": {
    "bitcoinjs-lib": "^6.1.0", 
    "bip32": "^4.0.0",
    "bip39": "^3.1.0",
    "axios": "^1.6.0",
    "qrcode": "^1.5.3"
  }
}
```

**Note**: LiquidJS will only be added later if multisig requirements cannot be met with Breez SDK.

## Passkey Security Specifications

### Overview
The wallet implementation will leverage the existing passkey authentication system to provide additional security for all wallet operations. This ensures that any fund movement requires explicit user authorization via biometric or device-based authentication.

### Security Requirements

#### 1. Transaction Authorization
- **All Send Operations**: Every transaction sending funds from the wallet requires passkey re-authorization
- **Off-Platform Transfers**: Any transfer moving funds outside the BitTasker platform requires passkey verification
- **Cross-Wallet Swaps**: Swaps between Liquid and Bitcoin wallets require passkey confirmation
- **Boltz Swaps**: All submarine swaps (Lightning ↔ Bitcoin) require passkey authorization

#### 2. Passkey Integration Points

##### 2.1 Breez SDK Integration
```typescript
interface BreezSecurityService {
  // Verify passkey before any send operation
  verifyPasskeyForSend(amount: number, destination: string, asset: string): Promise<boolean>;
  
  // Re-authorize for high-value transactions
  requirePasskeyReauth(amount: number, threshold: number): Promise<boolean>;
  
  // Audit trail for passkey usage
  logSecurityEvent(operation: string, success: boolean): void;
}
```

##### 2.2 Bitcoin Wallet Integration
```typescript
interface BitcoinSecurityService {
  // Passkey verification for Bitcoin sends
  verifyPasskeyForBitcoinSend(amount: number, address: string): Promise<boolean>;
  
  // Secure key access with passkey
  unlockBitcoinKeysWithPasskey(): Promise<boolean>;
  
  // Backup operations require passkey
  authorizeBackupOperation(): Promise<boolean>;
}
```

##### 2.3 Boltz Swap Security
```typescript
interface BoltzSecurityService {
  // Verify passkey before initiating swaps
  verifyPasskeyForSwap(swapType: 'submarine' | 'reverse', amount: number): Promise<boolean>;
  
  // Emergency swap cancellation with passkey
  authorizeSwapCancellation(swapId: string): Promise<boolean>;
}
```

#### 3. Security Thresholds

##### 3.1 Transaction Limits
- **Micro Transactions**: < $10 USD equivalent - No additional passkey required
- **Standard Transactions**: $10-$100 USD - Single passkey verification
- **High-Value Transactions**: > $100 USD - Passkey re-authorization required
- **Off-Platform Transfers**: Any amount - Always requires passkey verification

##### 3.2 Time-Based Security
- **Session Timeout**: Passkey authorization expires after 5 minutes for wallet operations
- **Daily Limits**: Reset passkey requirements every 24 hours for accumulated transactions
- **Device Binding**: Passkey must be verified on the registered device

#### 4. Implementation Components

##### 4.1 Security Middleware
**File**: `src/lib/wallet/security/passkeyMiddleware.ts`
```typescript
export class PasskeySecurityMiddleware {
  // Intercept all wallet operations
  async interceptWalletOperation(operation: WalletOperation): Promise<AuthResult>;
  
  // Handle passkey verification flow
  async handlePasskeyVerification(context: SecurityContext): Promise<boolean>;
  
  // Manage security state and timeouts
  manageSecuritySession(): void;
}
```

##### 4.2 Security UI Components
**Files**:
- `src/routes/(protected)/dashboard/wallet/_components/security/PasskeyVerification.svelte`
- `src/routes/(protected)/dashboard/wallet/_components/security/SecurityPrompt.svelte`
- `src/routes/(protected)/dashboard/wallet/_components/security/TransactionConfirm.svelte`

##### 4.3 Audit and Logging
**File**: `src/lib/wallet/security/auditLogger.ts`
```typescript
export interface SecurityAuditLog {
  timestamp: Date;
  operation: string;
  amount?: number;
  asset?: string;
  destination?: string;
  passkeyUsed: boolean;
  success: boolean;
  deviceId: string;
  userAgent: string;
}
```

#### 5. User Experience Flow

##### 5.1 Send Transaction Flow
1. User initiates send transaction
2. System validates transaction details
3. If amount exceeds micro threshold → Prompt for passkey verification
4. User provides biometric/passkey authentication
5. System validates passkey and proceeds with transaction
6. Transaction is signed and broadcast
7. Security event is logged

##### 5.2 Off-Platform Transfer Flow
1. User attempts to send funds to external address
2. System detects off-platform destination
3. **Always** prompt for passkey verification regardless of amount
4. Display clear warning about off-platform transfer
5. Require explicit confirmation with passkey
6. Log high-priority security event

##### 5.3 Emergency Scenarios
- **Lost Device**: Account recovery maintains passkey requirements
- **Compromised Account**: All operations locked until passkey re-verification
- **Failed Passkey**: Graceful fallback to account recovery flow

#### 6. Security Monitoring

##### 6.1 Anomaly Detection
- Unusual transaction patterns trigger additional passkey verification
- Geographic location changes require passkey re-verification
- High-frequency transactions trigger cooling-off periods

##### 6.2 Compliance and Auditing
- All passkey interactions logged with timestamps
- Security events stored for compliance reporting
- Regular security health checks and monitoring

### Asset Support Matrix

| Asset | Network | Send | Receive | Lightning | Bitcoin | Notes |
|-------|---------|------|---------|-----------|---------|-------|
| L-BTC | Liquid  | ✅   | ✅      | Via Breez | Via Boltz | Primary asset via Breez |
| USDT  | Liquid  | ✅   | ✅      | Via Breez | No       | Stablecoin via Breez |
| BTC   | Bitcoin | ✅   | ✅      | Via Boltz | Native   | Savings wallet |
| Lightning | Lightning | ✅ | ✅    | Via Breez | Via Boltz | Via Breez SDK |

## Development Strategy

### Phase 1: Enhance Existing Breez SDK
- Complete missing Breez SDK functionality (send payments, multi-asset)
- Add comprehensive error handling and status monitoring
- Implement proper asset balance display and management

### Phase 2: Add Boltz Integration
- Implement Boltz API client for Bitcoin swaps
- Create Bitcoin savings wallet alongside Breez Liquid wallet
- Add swap functionality between Liquid and Bitcoin

### Phase 3: Unified Experience
- Create seamless UI between Breez Liquid and Bitcoin wallets
- Implement automated swap scheduling and management
- Add comprehensive transaction history across both wallets

### Phase 4: Future Considerations
- Evaluate multisig requirements
- Consider LiquidJS integration only if Breez SDK cannot support multisig
- Maintain flexibility for future enhancements

## Risk Mitigation

### Technical Risks
- **Breez SDK Limitations**: Monitor for any multi-asset or advanced feature limitations
- **Key Management Security**: Use established libraries and security practices for Bitcoin wallet
- **Boltz API Reliability**: Implement proper retry logic and fallback mechanisms
- **Multi-Asset Complexity**: Leverage Breez SDK for L-BTC/USDT, add Bitcoin separately

### User Experience Risks
- **Complexity Increase**: Design intuitive UI with clear wallet separation (Liquid vs Bitcoin)
- **Wallet Management**: Provide clear guidance on when to use Liquid vs Bitcoin wallet
- **Performance Issues**: Implement proper loading states and optimization

### Business Risks  
- **Development Timeline**: Use phased approach with regular deliverables
- **Breez SDK Dependencies**: Monitor Breez SDK development and feature roadmap
- **Regulatory Compliance**: Ensure all implementations meet compliance requirements

## Success Metrics

### Technical Metrics
- [ ] 100% completion of missing Breez SDK features (send payments, multi-asset)
- [ ] Successful Boltz API integration with < 1% swap failure rate
- [ ] < 3 second transaction preparation times
- [ ] 99.9% uptime for wallet operations

### User Experience Metrics
- [ ] < 5 clicks for any common operation
- [ ] < 30 seconds for transaction completion
- [ ] Positive user feedback on multi-asset functionality
- [ ] Seamless integration between Breez Liquid and Bitcoin wallets

## Next Steps

1. **Review and Approval**: Review this plan and approve technical approach
2. **Environment Setup**: Set up development environment with Bitcoin wallet dependencies
3. **Phase 1 Kickoff**: Complete Breez SDK implementation and begin Boltz API client development
4. **Regular Check-ins**: Weekly progress reviews and plan adjustments
5. **Testing Strategy**: Define comprehensive testing approach for each phase

---

**Estimated Total Timeline**: 10-13 weeks  
**Team Size**: 2-3 developers  
**Priority Level**: High - Critical for product scalability and user control