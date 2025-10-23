# Breez SDK Liquid Advanced Fees Implementation Plan

## Overview

This document outlines a comprehensive plan for implementing advanced fee management in BitTasker's wallet system using the Breez SDK Nodeless (Liquid Implementation). The plan is based on detailed analysis of Breez's fee structure and capabilities, incorporating findings from [official Breez documentation](https://sdk-doc-liquid.breez.technology/guide/end-user_fees.html) and [fee structure details](https://doc.breez.technology/What-are-the-Breez-Fees.html).

## Current Breez SDK Liquid Fee Structure

### Base Fees (Non-Configurable)

Based on [Breez documentation](https://sdk-doc-liquid.breez.technology/guide/end-user_fees.html), the Breez SDK Liquid implementation uses fixed fee structures for different operations:

#### Lightning Payments
- **Sending Lightning**: 
  - Lockup Transaction Fee: ~34 sats (0.1 sat/vbyte)
  - Claim Transaction Fee: ~19 sats (0.1 sat/vbyte)
  - Swap Service Fee: 0.1% of amount sent
- **Receiving Lightning**: 
  - Lockup Transaction Fee: ~27 sats (0.1 sat/vbyte)
  - Claim Transaction Fee: ~20 sats (0.1 sat/vbyte)
  - Swap Service Fee: 0.25% of amount received

#### Bitcoin On-chain Payments
- **Sending to BTC Address**:
  - L-BTC Lockup Transaction Fee: ~34 sats (0.1 sat/vbyte)
  - BTC Lockup Transaction Fee: Based on current Bitcoin mempool
  - Swap Service Fee: 0.1% of amount sent
  - BTC Claim Transaction Fee: Based on current Bitcoin mempool
- **Receiving from BTC Address**:
  - L-BTC Claim Transaction Fee: ~20 sats (0.1 sat/vbyte)
  - BTC Claim Transaction Fee: Based on Bitcoin mempool at swap time
  - Swapper Service Fee: 0.1% of amount received

#### Multi-Asset Support
- **Asset Fee Payment**: Supported assets (like USDT) can pay their own fees when `estimateAssetFees: true`
- **Cross-Asset Optimization**: Different assets have different fee structures

### Partner Fees (Configurable)

According to [Breez documentation](https://sdk-doc-liquid.breez.technology/guide/end-user_fees.html), partners can configure additional fees through the **Breez Partners Portal**:

- **Additional Fee Percentage**: Custom percentage added to base fees
- **Lightning Address Payouts**: Revenue share configuration
- **Fee Distribution**: Transparent partner fee allocation

## Implementation Architecture

### Core Components

```typescript
// Fee Management System Architecture
interface BreezFeeManager {
  // Base fee calculation
  calculateBaseFees(operation: PaymentOperation): Promise<FeeBreakdown>;
  
  // Partner fee integration
  applyPartnerFees(baseFees: FeeBreakdown): Promise<FeeBreakdown>;
  
  // Asset-specific fee optimization
  optimizeAssetFees(transaction: Transaction): Promise<AssetFeeOptimization>;
  
  // Real-time fee intelligence
  provideFeeIntelligence(context: TransactionContext): Promise<FeeRecommendation>;
}

interface FeeBreakdown {
  lockupFee: number;           // L-BTC lockup fee
  claimFee: number;            // L-BTC claim fee
  serviceFee: number;          // Breez swap service fee
  networkFee?: number;         // Bitcoin network fee (for BTC operations)
  partnerFee?: number;         // Additional partner fee
  assetFee?: number;           // Asset-specific fee optimization
  total: number;               // Total fee in satoshis
  percentage: number;          // Fee as percentage of transaction
  estimatedAssetFees?: number; // Asset fee estimate for USDT/other assets
}

interface PaymentOperation {
  type: 'lightning_send' | 'lightning_receive' | 'bitcoin_send' | 'bitcoin_receive' | 'liquid_send' | 'liquid_receive';
  amount: number;
  asset: 'L-BTC' | 'USDT' | 'BTC';
  destination: string;
  addressType: 'lightning' | 'bitcoin' | 'liquid';
}
```

## Phase 1: Enhanced Fee Display & Transparency

### 1.1 Fee Breakdown Component

```typescript
interface FeeDisplayProps {
  operation: PaymentOperation;
  breakdown: FeeBreakdown;
  showDetails: boolean;
  allowAssetFeePayment?: boolean;
}

// Real-time fee calculation with Breez SDK integration
async function calculateTransactionFees(operation: PaymentOperation): Promise<FeeBreakdown> {
  const prepareResponse = await prepareSendPayment({
    destination: operation.destination,
    amount: {
      type: operation.asset === 'USDT' ? 'asset' : 'bitcoin',
      ...(operation.asset === 'USDT' ? {
        assetId: getAssetId('USDT'),
        receiverAmount: operation.amount,
        estimateAssetFees: true // Enable asset fee estimation
      } : {
        receiverAmountSat: Math.floor(operation.amount * 100_000_000)
      })
    }
  });

  return {
    lockupFee: LIQUID_LOCKUP_FEE, // ~34 sats for sends, ~27 for receives
    claimFee: LIQUID_CLAIM_FEE,   // ~19-20 sats
    serviceFee: prepareResponse.feesSat || 0,
    networkFee: operation.addressType === 'bitcoin' ? await getBitcoinNetworkFee() : 0,
    estimatedAssetFees: prepareResponse.estimatedAssetFees,
    total: prepareResponse.feesSat || 0,
    percentage: ((prepareResponse.feesSat || 0) / (operation.amount * 100_000_000)) * 100
  };
}
```

### 1.2 Fee Alert System

```typescript
interface FeeAlert {
  type: 'high_fee' | 'small_amount' | 'asset_optimization' | 'timing_suggestion';
  severity: 'info' | 'warning' | 'error';
  message: string;
  action?: FeeOptimizationAction;
}

interface FeeOptimizationAction {
  type: 'use_asset_fees' | 'switch_payment_method' | 'defer_transaction' | 'batch_transaction';
  description: string;
  estimatedSavings: number;
}

// Fee alert logic based on Breez constraints
function generateFeeAlerts(breakdown: FeeBreakdown, operation: PaymentOperation): FeeAlert[] {
  const alerts: FeeAlert[] = [];
  
  // High fee percentage alert
  if (breakdown.percentage > 5) {
    alerts.push({
      type: 'high_fee',
      severity: 'warning',
      message: `Transaction fee is ${breakdown.percentage.toFixed(1)}% of amount. Consider larger transactions to reduce relative fees.`,
    });
  }
  
  // Asset fee optimization suggestion
  if (operation.asset === 'USDT' && breakdown.estimatedAssetFees) {
    alerts.push({
      type: 'asset_optimization',
      severity: 'info',
      message: `Pay fees with USDT to save ~${breakdown.estimatedAssetFees} sats`,
      action: {
        type: 'use_asset_fees',
        description: 'Use USDT for fee payment',
        estimatedSavings: breakdown.estimatedAssetFees
      }
    });
  }
  
  // Small amount warning (under dust limit)
  if (operation.amount * 100_000_000 < 546) {
    alerts.push({
      type: 'small_amount',
      severity: 'error',
      message: 'Amount below dust limit (546 sats). Transaction will fail.',
    });
  }
  
  return alerts;
}
```

### 1.3 Historical Fee Tracking

```typescript
interface FeeHistory {
  timestamp: number;
  operation: PaymentOperation;
  breakdown: FeeBreakdown;
  transactionId: string;
  success: boolean;
}

class FeeHistoryManager {
  private history: FeeHistory[] = [];
  
  async trackTransaction(operation: PaymentOperation, breakdown: FeeBreakdown, txId: string): Promise<void> {
    this.history.push({
      timestamp: Date.now(),
      operation,
      breakdown,
      transactionId: txId,
      success: true
    });
    
    // Store in local storage or database
    await this.persistHistory();
  }
  
  getAverageFees(timeframe: '24h' | '7d' | '30d'): FeeStats {
    const since = Date.now() - this.getTimeframeMs(timeframe);
    const recentTransactions = this.history.filter(h => h.timestamp > since);
    
    return {
      averagePercentage: this.calculateAverage(recentTransactions, 'percentage'),
      averageAbsolute: this.calculateAverage(recentTransactions, 'total'),
      transactionCount: recentTransactions.length,
      totalFeesPaid: recentTransactions.reduce((sum, h) => sum + h.breakdown.total, 0)
    };
  }
}
```

## Phase 2: Smart Fee Optimization

### 2.1 Payment Method Intelligence

```typescript
class PaymentMethodOptimizer {
  
  async suggestOptimalMethod(
    amount: number, 
    destination: string, 
    asset: string
  ): Promise<PaymentMethodRecommendation> {
    
    const addressType = await this.detectAddressType(destination);
    const lightningFee = await this.calculateLightningFee(amount, asset);
    const bitcoinFee = await this.calculateBitcoinFee(amount, asset);
    
    // Lightning is generally cheaper for smaller amounts due to fixed Bitcoin fees
    if (amount < 0.001 && addressType === 'lightning') {
      return {
        recommended: 'lightning',
        reason: 'Lightning is more cost-effective for small amounts',
        savings: bitcoinFee - lightningFee,
        feeComparison: { lightning: lightningFee, bitcoin: bitcoinFee }
      };
    }
    
    // For larger amounts, compare actual fees
    if (lightningFee < bitcoinFee * 0.8) {
      return {
        recommended: 'lightning',
        reason: 'Lightning offers significant savings',
        savings: bitcoinFee - lightningFee,
        feeComparison: { lightning: lightningFee, bitcoin: bitcoinFee }
      };
    }
    
    return {
      recommended: 'bitcoin',
      reason: 'Bitcoin offers better value for this transaction size',
      savings: lightningFee - bitcoinFee,
      feeComparison: { lightning: lightningFee, bitcoin: bitcoinFee }
    };
  }
  
  private async calculateLightningFee(amount: number, asset: string): Promise<number> {
    // Lightning fees: ~53 sats fixed + 0.1% for sends, 0.25% for receives
    const fixedFee = 53; // lockup + claim
    const percentageFee = (amount * 100_000_000) * 0.001; // 0.1%
    return fixedFee + percentageFee;
  }
  
  private async calculateBitcoinFee(amount: number, asset: string): Promise<number> {
    const mempool = await this.getMempoolInfo();
    const liquidFee = 54; // L-BTC lockup + claim
    const bitcoinNetworkFee = mempool.fastestFee * 250; // Estimate 250 vbytes
    const percentageFee = (amount * 100_000_000) * 0.001; // 0.1%
    
    return liquidFee + bitcoinNetworkFee + percentageFee;
  }
}
```

### 2.2 Mempool Integration & Timing Optimization

```typescript
interface MempoolData {
  fastestFee: number;   // sats/vbyte for next block
  halfHourFee: number;  // sats/vbyte for ~30 min confirmation
  hourFee: number;      // sats/vbyte for ~1 hour confirmation
  economyFee: number;   // sats/vbyte for low priority
  minimumFee: number;   // current minimum accepted fee
}

class MempoolMonitor {
  private mempoolData: MempoolData | null = null;
  
  async fetchMempoolData(): Promise<MempoolData> {
    try {
      const response = await fetch('https://mempool.space/api/v1/fees/recommended');
      this.mempoolData = await response.json();
      return this.mempoolData!;
    } catch (error) {
      // Fallback to conservative estimates if mempool.space is unavailable
      return {
        fastestFee: 20,
        halfHourFee: 15,
        hourFee: 10,
        economyFee: 5,
        minimumFee: 1
      };
    }
  }
  
  async suggestOptimalTiming(
    amount: number, 
    urgency: 'immediate' | 'soon' | 'eventual'
  ): Promise<TimingRecommendation> {
    const mempool = await this.fetchMempoolData();
    
    // For Bitcoin transactions, timing matters significantly
    // For Lightning, timing has minimal impact due to fixed Liquid fees
    
    if (urgency === 'eventual' && mempool.economyFee < mempool.fastestFee * 0.5) {
      return {
        suggestion: 'defer',
        reasoning: `Current fast fee: ${mempool.fastestFee} sat/vB. Economy fee: ${mempool.economyFee} sat/vB. Wait for lower fees.`,
        estimatedSavings: (mempool.fastestFee - mempool.economyFee) * 250, // 250 vbyte estimate
        timeToWait: await this.estimateTimeForFeeLevel(mempool.economyFee)
      };
    }
    
    return {
      suggestion: 'proceed',
      reasoning: 'Current fees are reasonable for your urgency level',
      estimatedSavings: 0,
      timeToWait: 0
    };
  }
}
```

## Phase 3: Asset Fee Management

### 3.1 Multi-Asset Fee Payment

```typescript
class AssetFeeManager {
  
  async calculateOptimalFeeAsset(
    transaction: Transaction,
    availableAssets: AssetBalance[]
  ): Promise<AssetFeeRecommendation> {
    
    const recommendations: AssetFeeOption[] = [];
    
    // L-BTC (default)
    const lbtcFee = await this.calculateFeeInAsset(transaction, 'L-BTC');
    recommendations.push({
      asset: 'L-BTC',
      feeAmount: lbtcFee.amount,
      feeInSats: lbtcFee.satoshis,
      available: true,
      isDefault: true
    });
    
    // USDT fee payment (if supported and available)
    if (transaction.asset === 'USDT' && this.supportsAssetFees('USDT')) {
      const usdtFee = await this.calculateAssetSpecificFee(transaction, 'USDT');
      recommendations.push({
        asset: 'USDT',
        feeAmount: usdtFee.amount,
        feeInSats: usdtFee.satoshiEquivalent,
        available: this.hasSufficientBalance(availableAssets, 'USDT', usdtFee.amount),
        savings: lbtcFee.satoshis - usdtFee.satoshiEquivalent
      });
    }
    
    // Return optimal recommendation
    return {
      recommended: this.findOptimalAsset(recommendations),
      options: recommendations,
      reasoning: this.generateRecommendationReasoning(recommendations)
    };
  }
  
  private async calculateAssetSpecificFee(
    transaction: Transaction, 
    feeAsset: string
  ): Promise<AssetFeeCalculation> {
    
    // Use Breez SDK's estimateAssetFees functionality
    const prepareResponse = await prepareSendPayment({
      destination: transaction.destination,
      amount: {
        type: 'asset',
        assetId: getAssetId(transaction.asset),
        receiverAmount: transaction.amount,
        estimateAssetFees: true // This enables asset fee estimation
      }
    });
    
    return {
      amount: prepareResponse.estimatedAssetFees || 0,
      satoshiEquivalent: prepareResponse.feesSat || 0,
      exchangeRate: await this.getAssetExchangeRate(feeAsset)
    };
  }
}
```

### 3.2 Cross-Asset Fee Optimization

```typescript
interface AssetFeeOptimization {
  originalAsset: string;
  originalFee: number;
  optimizedAsset: string;
  optimizedFee: number;
  savings: number;
  conversionRequired: boolean;
}

class CrossAssetOptimizer {
  
  async optimizeFeePayment(
    transaction: Transaction,
    userBalances: AssetBalance[]
  ): Promise<AssetFeeOptimization[]> {
    
    const optimizations: AssetFeeOptimization[] = [];
    
    // For USDT transactions, check if paying fees in USDT is cheaper
    if (transaction.asset === 'USDT') {
      const lbtcFee = await this.calculateLBTCFee(transaction);
      const usdtFee = await this.calculateUSDTFee(transaction);
      
      if (usdtFee.total < lbtcFee.total && this.hasSufficientUSDT(userBalances, usdtFee.amount)) {
        optimizations.push({
          originalAsset: 'L-BTC',
          originalFee: lbtcFee.total,
          optimizedAsset: 'USDT',
          optimizedFee: usdtFee.total,
          savings: lbtcFee.total - usdtFee.total,
          conversionRequired: false
        });
      }
    }
    
    return optimizations;
  }
  
  private async calculateUSDTFee(transaction: Transaction): Promise<FeeCalculation> {
    // USDT can pay its own fees when estimateAssetFees is true
    // This leverages Breez SDK's built-in asset fee capability
    const feeInUSDT = await this.getAssetFeeEstimate(transaction, 'USDT');
    const feeInSats = await this.convertUSDTToSats(feeInUSDT);
    
    return {
      amount: feeInUSDT,
      total: feeInSats,
      breakdown: {
        serviceFee: feeInSats * 0.8, // Most of the fee
        networkFee: feeInSats * 0.2  // Smaller portion
      }
    };
  }
}
```

## Phase 4: Partner Fee Integration

### 4.1 Breez Partners Portal Integration

Based on [Breez's partner documentation](https://sdk-doc-liquid.breez.technology/guide/end-user_fees.html), partner fees are configured through the Partners Portal.

```typescript
interface PartnerFeeConfiguration {
  additionalFeePercentage: number;    // Set via Partners Portal
  lightningAddressPayout: string;     // Lightning address for fee payouts
  feeDistribution: 'percentage' | 'fixed';
  minimumFee: number;
  maximumFee: number;
  enabled: boolean;
}

class PartnerFeeManager {
  private config: PartnerFeeConfiguration | null = null;
  
  async loadPartnerConfiguration(): Promise<void> {
    // Partner fees are configured via Breez Partners Portal
    // They're applied automatically by the Breez SDK
    // This method would fetch current configuration if available via API
    
    try {
      // Note: Partner fees are typically configured at the API key level
      // and applied automatically by Breez infrastructure
      this.config = await this.fetchPartnerConfig();
    } catch (error) {
      console.warn('Partner fee configuration not available');
      this.config = null;
    }
  }
  
  calculatePartnerFee(baseFee: number, amount: number): number {
    if (!this.config || !this.config.enabled) {
      return 0;
    }
    
    const partnerFee = (amount * this.config.additionalFeePercentage) / 100;
    
    return Math.max(
      this.config.minimumFee,
      Math.min(this.config.maximumFee, partnerFee)
    );
  }
  
  async trackPartnerRevenue(transaction: Transaction, partnerFee: number): Promise<void> {
    // Track partner fee revenue for analytics and payouts
    await this.logPartnerTransaction({
      transactionId: transaction.id,
      baseFee: transaction.fees.total - partnerFee,
      partnerFee: partnerFee,
      partnerPercentage: this.config?.additionalFeePercentage || 0,
      timestamp: Date.now(),
      payoutAddress: this.config?.lightningAddressPayout
    });
  }
}
```

### 4.2 Revenue Analytics & Transparency

```typescript
interface PartnerRevenueAnalytics {
  totalRevenue: number;
  transactionCount: number;
  averageFeePerTransaction: number;
  revenueByTimeframe: TimeFrameRevenue[];
  payoutSchedule: PayoutInfo[];
}

class RevenueTracker {
  
  async getPartnerRevenueAnalytics(timeframe: string): Promise<PartnerRevenueAnalytics> {
    const transactions = await this.getPartnerTransactions(timeframe);
    
    return {
      totalRevenue: transactions.reduce((sum, tx) => sum + tx.partnerFee, 0),
      transactionCount: transactions.length,
      averageFeePerTransaction: this.calculateAverage(transactions.map(tx => tx.partnerFee)),
      revenueByTimeframe: await this.groupByTimeframe(transactions),
      payoutSchedule: await this.getUpcomingPayouts()
    };
  }
  
  async displayFeeTransparency(transaction: Transaction): Promise<FeeTransparency> {
    const baseFees = await this.calculateBaseFees(transaction);
    const partnerFee = await this.calculatePartnerFee(transaction);
    
    return {
      userPays: baseFees.total + partnerFee,
      breezReceives: baseFees.total,
      partnerReceives: partnerFee,
      breakdown: {
        'Breez Service Fee': baseFees.serviceFee,
        'Network Fees': baseFees.networkFee,
        'Partner Fee': partnerFee
      },
      transparency: {
        'Fee goes to Breez for infrastructure': baseFees.serviceFee,
        'Fee goes to Bitcoin/Liquid network': baseFees.networkFee,
        'Fee goes to app partner': partnerFee
      }
    };
  }
}
```

## Phase 5: Advanced Intelligence & Optimization

### 5.1 Machine Learning Fee Prediction

```typescript
class FeeIntelligenceEngine {
  
  async predictOptimalSendTime(
    amount: number,
    urgency: 'low' | 'medium' | 'high'
  ): Promise<FeeOptimizationPrediction> {
    
    const mempoolTrends = await this.analyzeMempoolTrends();
    const historicalPatterns = await this.getHistoricalFeePatterns();
    
    // For Lightning transactions, timing has minimal impact due to Breez's fixed fees
    // For Bitcoin transactions, timing can significantly impact costs
    
    if (urgency === 'low') {
      const optimalTime = await this.predictLowestFeeWindow();
      return {
        recommendation: 'wait',
        optimalTime: optimalTime,
        estimatedSavings: await this.calculateTimingSavings(amount, optimalTime),
        confidence: this.calculatePredictionConfidence(mempoolTrends)
      };
    }
    
    return {
      recommendation: 'send_now',
      optimalTime: Date.now(),
      estimatedSavings: 0,
      confidence: 1.0
    };
  }
  
  private async analyzeMempoolTrends(): Promise<MempoolTrend[]> {
    // Analyze historical mempool data to identify patterns
    const historicalData = await this.fetchHistoricalMempoolData();
    
    return this.identifyTrends(historicalData, {
      timeOfDay: true,      // Fees often lower at night UTC
      dayOfWeek: true,      // Weekends typically have lower fees
      marketEvents: true,   // Major events can spike fees
      seasonality: true     // Long-term seasonal patterns
    });
  }
}
```

### 5.2 User Preference Learning

```typescript
interface UserFeePreferences {
  preferredFeeLevel: 'low' | 'medium' | 'high';
  maxFeePercentage: number;
  preferAssetFees: boolean;
  alertThresholds: {
    highFeeWarning: number;      // Percentage
    smallAmountWarning: number;  // Satoshis
  };
  timingPreferences: {
    allowDeferred: boolean;
    maxWaitTime: number;  // Hours
  };
}

class UserFeePreferenceManager {
  
  async learnFromUserBehavior(userId: string): Promise<UserFeePreferences> {
    const userTransactions = await this.getUserTransactionHistory(userId);
    
    // Analyze user's historical choices to infer preferences
    const averageFeePercentage = this.calculateAverageFeePercentage(userTransactions);
    const preferredUrgency = this.inferUrgencyPreference(userTransactions);
    const assetFeeUsage = this.analyzeAssetFeeUsage(userTransactions);
    
    return {
      preferredFeeLevel: this.mapToFeeLevel(averageFeePercentage),
      maxFeePercentage: averageFeePercentage * 1.5, // 50% buffer
      preferAssetFees: assetFeeUsage > 0.7, // If user chooses asset fees 70% of time
      alertThresholds: {
        highFeeWarning: averageFeePercentage * 2,
        smallAmountWarning: this.findSmallestTransaction(userTransactions)
      },
      timingPreferences: {
        allowDeferred: this.analyzesTimingFlexibility(userTransactions),
        maxWaitTime: this.inferMaxWaitTime(userTransactions)
      }
    };
  }
}
```

## Implementation Roadmap

### Immediate Implementation (Week 1-2)

1. **Enhanced Fee Display**
   - Implement real-time fee breakdown using Breez SDK
   - Add fee alerts and warnings
   - Display partner fees transparently

2. **Asset Fee Payment**
   - Implement `estimateAssetFees: true` for USDT transactions
   - Add UI toggle for asset fee payment
   - Show savings when using asset fees

### Short Term (Week 3-4)

3. **Payment Method Intelligence**
   - Add automatic Lightning vs Bitcoin recommendations
   - Implement fee comparison display
   - Add small amount warnings

4. **Basic Timing Optimization**
   - Integrate mempool.space API
   - Add "wait for lower fees" suggestions
   - Implement deferred transaction queue

### Medium Term (Month 2)

5. **Advanced Asset Management**
   - Cross-asset fee optimization
   - Multi-asset fee comparison
   - Automatic asset conversion for optimal fees

6. **Partner Fee Integration**
   - Implement partner fee tracking
   - Add revenue analytics dashboard
   - Ensure fee transparency compliance

### Long Term (Month 3+)

7. **Machine Learning Intelligence**
   - Implement fee prediction algorithms
   - Add user preference learning
   - Optimize for user-specific patterns

8. **Advanced Features**
   - Batch transaction optimization
   - Advanced timing predictions
   - Custom fee strategies

## Technical Implementation Details

### Core Fee Service

```typescript
class BreezFeeService {
  private mempoolMonitor: MempoolMonitor;
  private assetFeeManager: AssetFeeManager;
  private partnerFeeManager: PartnerFeeManager;
  private preferenceManager: UserFeePreferenceManager;
  
  constructor() {
    this.mempoolMonitor = new MempoolMonitor();
    this.assetFeeManager = new AssetFeeManager();
    this.partnerFeeManager = new PartnerFeeManager();
    this.preferenceManager = new UserFeePreferenceManager();
  }
  
  async calculateOptimalFees(
    operation: PaymentOperation,
    userPreferences: UserFeePreferences
  ): Promise<OptimalFeeRecommendation> {
    
    // Calculate base fees using Breez SDK
    const baseFees = await this.calculateBaseFees(operation);
    
    // Apply partner fees
    const partnerFees = await this.partnerFeeManager.calculatePartnerFee(
      baseFees.total, 
      operation.amount
    );
    
    // Check for asset fee optimization
    const assetOptimization = await this.assetFeeManager.calculateOptimalFeeAsset(
      operation,
      await this.getUserAssetBalances()
    );
    
    // Generate timing recommendation
    const timingRec = await this.mempoolMonitor.suggestOptimalTiming(
      operation.amount,
      this.inferUrgency(userPreferences)
    );
    
    // Generate alerts
    const alerts = this.generateFeeAlerts(baseFees, operation, userPreferences);
    
    return {
      baseFees,
      partnerFees,
      assetOptimization,
      timingRecommendation: timingRec,
      alerts,
      totalOptimizedFee: this.calculateOptimizedTotal(baseFees, assetOptimization),
      estimatedSavings: this.calculateTotalSavings(baseFees, assetOptimization, timingRec)
    };
  }
}
```

### Integration with Enhanced Send Form

The enhanced send form will integrate with this fee service to provide real-time fee optimization:

```typescript
// In EnhancedSendForm.svelte
let feeService = new BreezFeeService();
let feeRecommendation = $state<OptimalFeeRecommendation | null>(null);
let userPreferences = $state<UserFeePreferences>(defaultPreferences);

async function updateFeeRecommendation() {
  if (!recipientAddress || !amount) return;
  
  const operation: PaymentOperation = {
    type: getOperationType(addressType, selectedAsset),
    amount: parseFloat(useFiatInput ? convertFiatToCrypto(fiatAmount) : amount),
    asset: selectedAsset,
    destination: recipientAddress,
    addressType
  };
  
  feeRecommendation = await feeService.calculateOptimalFees(operation, userPreferences);
}

// Update fee recommendation when inputs change
$effect(() => {
  updateFeeRecommendation();
});
```

## Key Constraints & Considerations

### Breez SDK Limitations

1. **Fixed Fee Structure**: Base fees are determined by Breez and cannot be modified
2. **No RBF/CPFP**: Replace-by-Fee and Child-Pays-for-Parent are not supported
3. **Limited Fee Control**: Lightning routing fees are determined by the network
4. **Partner Fee Configuration**: Must be set via Breez Partners Portal, not directly in code

### Liquid Network Benefits

1. **Lower Base Fees**: Liquid transactions are cheaper than Bitcoin on-chain
2. **Fast Confirmations**: ~1 minute vs ~10 minutes for Bitcoin
3. **Asset Fee Payment**: USDT and other assets can pay their own fees
4. **Predictable Costs**: More stable fee structure than Bitcoin

### User Experience Priorities

1. **Transparency**: Users must understand where fees go and why
2. **Simplicity**: Advanced features should not complicate basic usage
3. **Trust**: Clear explanation of partner fees and revenue sharing
4. **Control**: Users should have options to optimize based on their preferences

## Success Metrics

### Technical Metrics
- Fee calculation accuracy (within 5% of actual)
- API response time (<500ms for fee calculations)
- Asset fee optimization adoption rate
- Partner fee transparency compliance

### User Experience Metrics
- Reduction in abandoned transactions due to high fees
- User satisfaction with fee transparency
- Adoption rate of fee optimization suggestions
- Support ticket reduction related to fee confusion

### Business Metrics
- Partner fee revenue tracking accuracy
- Fee-related user complaints reduction
- Competitive fee positioning vs other Lightning wallets
- User retention improvement through better fee UX

## References

1. [Breez SDK Liquid Documentation](https://sdk-doc-liquid.breez.technology/)
2. [Breez End-User Fees Documentation](https://sdk-doc-liquid.breez.technology/guide/end-user_fees.html)
3. [Breez Fee Structure Details](https://doc.breez.technology/What-are-the-Breez-Fees.html)
4. [Breez Partners Portal](https://partners.breez.technology/) (referenced in documentation)
5. [Liquid Network Documentation](https://docs.liquid.net/)
6. [Mempool.space API](https://mempool.space/api)

---

*This plan provides a comprehensive approach to implementing advanced fee management while working within the constraints and capabilities of the Breez SDK Nodeless (Liquid) implementation. The phased approach ensures incremental value delivery while building toward a sophisticated fee optimization system.*