# Payment and Escrow System

This document outlines the requirements for implementing the payment and escrow system in BitTasker.

## Description

The payment and escrow system handles all financial transactions on the BitTasker platform, including task payments, fee collection, escrow management, and Bitcoin wallet integration. It ensures secure and trustless transactions between task posters and service providers.

## 1. Screens

### Wallet Management

- **Wallet Dashboard**:
  - Current balance display
  - Transaction history
  - Deposit/withdrawal options
  - Pending escrow amounts
- **Deposit Screen**:
  - Bitcoin address display
  - QR code for deposits
  - Transaction status tracking
- **Withdrawal Screen**:
  - Address input/selection
  - Amount specification
  - Fee options
  - Confirmation steps

### Payment Flow

- **Task Payment Screen**:
  - Task cost display
  - Platform fee calculation
  - Payment method selection
  - Confirmation dialog
- **Escrow Management**:
  - Active escrows list
  - Escrow status tracking
  - Release conditions display
  - Manual release option

### Transaction History

- **Transaction List**:
  - Filterable transaction history
  - Transaction details view
  - Receipt generation
  - Export options
- **Payment Status Indicators**:
  - Visual indicators for payment states
  - Pending payment alerts
  - Escrow status badges

## 2. Schema

### Wallet Type

```typescript
interface Wallet {
	id: string;
	userId: string;
	balance: number; // In satoshis
	escrowedAmount: number; // In satoshis
	pendingAmount: number; // In satoshis
	depositAddress: string;
	transactions: WalletTransaction[];
	createdAt: Date;
	updatedAt: Date;
}
```

### WalletTransaction Type

```typescript
interface WalletTransaction {
	id: string;
	walletId: string;
	type: 'deposit' | 'withdrawal' | 'task_payment' | 'task_receipt' | 'refund' | 'fee';
	amount: number; // In satoshis
	status: 'pending' | 'confirmed' | 'failed' | 'cancelled';
	txHash?: string; // Bitcoin transaction hash
	confirmations?: number;
	relatedId?: string; // Task ID, escrow ID, etc.
	description: string;
	metadata?: {
		[key: string]: any;
	};
	createdAt: Date;
	updatedAt: Date;
	confirmedAt?: Date;
}
```

### Escrow Type

```typescript
interface Escrow {
	id: string;
	taskId: string;
	clientId: string;
	providerId: string;
	amount: number; // In satoshis
	platformFee: number; // In satoshis
	status: 'funded' | 'released' | 'disputed' | 'refunded' | 'cancelled';
	releaseCondition: 'manual' | 'time_based' | 'milestone' | 'multi_signature';
	conditions?: {
		releaseDate?: Date;
		milestoneId?: string;
		requiredSignatures?: string[]; // User IDs
	};
	transactions: {
		fundingTxId: string;
		releaseTxId?: string;
		refundTxId?: string;
	};
	createdAt: Date;
	updatedAt: Date;
	releasedAt?: Date;
	refundedAt?: Date;
}
```

## 3. APIs

### Wallet Management

- `GET /api/wallet` - Get user's wallet information

  - Returns: Wallet object

- `GET /api/wallet/transactions` - Get wallet transactions

  - Query params: Pagination, filters (type, status, date range)
  - Returns: Array of WalletTransaction objects

- `POST /api/wallet/withdraw` - Request a withdrawal
  - Body: Destination address, amount, fee level
  - Returns: Created WalletTransaction object

### Payment and Escrow

- `POST /api/tasks/{taskId}/escrow` - Create escrow for a task

  - Body: Amount, releaseCondition, conditions
  - Returns: Created Escrow object

- `GET /api/tasks/{taskId}/escrow` - Get escrow details

  - Returns: Escrow object

- `POST /api/escrow/{escrowId}/release` - Release funds from escrow

  - Returns: Updated Escrow object

- `POST /api/escrow/{escrowId}/dispute` - Dispute an escrow
  - Body: Dispute reason
  - Returns: Updated Escrow object with dispute info

### Bitcoin Integration

- `GET /api/wallet/address` - Get deposit address

  - Returns: Bitcoin address and QR code data

- `GET /api/wallet/fee-estimate` - Get current fee estimates

  - Returns: Fee rates for different priority levels

- `POST /api/transactions/verify` - Verify a Bitcoin transaction
  - Body: Transaction hash
  - Returns: Verification result with confirmations

## 4. Dependencies

- Bitcoin node or third-party Bitcoin API service
- Secure key management solution
- Payment processing service
- QR code generation library
- Transaction monitoring service
- Multi-signature wallet library

## 5. Services

### Frontend Services

- `WalletService`:
  - Methods for wallet management
  - Balance checking
  - Transaction history display
  - Deposit/withdrawal handling
- `PaymentService`:
  - Task payment processing
  - Fee calculation
  - Payment confirmation
  - Receipt generation
- `EscrowService`:
  - Escrow creation and management
  - Release condition handling
  - Dispute initiation
  - Escrow status tracking

### Backend Services

- `BitcoinWalletService`:
  - Wallet creation and management
  - Address generation
  - Transaction signing and broadcasting
  - Balance monitoring
- `EscrowManagementService`:
  - Escrow creation and funding
  - Condition monitoring and verification
  - Fund release and refund processing
  - Dispute handling
- `TransactionMonitoringService`:
  - Bitcoin transaction tracking
  - Confirmation monitoring
  - Deposit detection
  - Blockchain fee estimation

## 6. Edge Cases

- **Transaction Failures**: Handle Bitcoin transaction failures or timeouts

- **Network Issues**: Handle temporary Bitcoin network congestion or outages

- **Fee Volatility**: Adapt to rapid changes in Bitcoin network fees

- **Partial Payments**: Handle cases where users send partial payments

- **Exchange Rate Fluctuations**: Account for Bitcoin price volatility during tasks

- **Escrow Disputes**: Process for handling disputed escrows with fair resolution

- **Incomplete Transactions**: Handle cases where transactions remain unconfirmed

- **Refund Scenarios**: Support for various refund scenarios and partial refunds

- **Security Breaches**: Protocols for handling potential security incidents

- **Multi-device Synchronization**: Keep wallet state consistent across devices

## 7. Test Plan

### Bitcoin Wallet Tests

#### Wallet Creation and Management Tests

- Test wallet creation process
- Test Bitcoin address generation
- Test balance calculation
- Test address validation
- Test multi-wallet support
- Test key backup procedures
- Test recovery phrase validation

#### Transaction Tests

- Test Bitcoin deposit detection
- Test withdrawal transaction creation
- Test transaction fee calculation
- Test transaction confirmation monitoring
- Test handling of unconfirmed transactions
- Test transaction history recording
- Test transaction categorization

#### Security Tests

- Test private key encryption
- Test authorization for wallet operations
- Test withdrawal confirmation security
- Test session management for wallet access
- Test rate limiting for sensitive operations
- Test audit logging for all wallet activities
- Test handling of suspicious transaction patterns

### Escrow System Tests

#### Escrow Creation Tests

- Test escrow creation with valid parameters
- Test funding validation requirements
- Test fee calculation accuracy
- Test escrow status transitions
- Test escrow metadata recording
- Test notification generation for escrow events
- Test handling escrow creation failures

#### Release Condition Tests

- Test manual release process
- Test time-based automatic releases
- Test milestone-based releases
- Test multi-signature release requirements
- Test partial releases for milestone-based tasks
- Test condition verification logic
- Test override capabilities for authorized users

#### Dispute Resolution Tests

- Test dispute initiation process
- Test evidence submission for disputes
- Test mediator assignment
- Test resolution option implementation
- Test partial release after dispute
- Test complete refunds after disputes
- Test dispute status tracking

### Payment Process Tests

#### Task Payment Tests

- Test payment calculation accuracy
- Test platform fee application
- Test payment initiation flow
- Test payment confirmation process
- Test receipt generation
- Test payment status updates
- Test handling payment failures

#### Fee Management Tests

- Test platform fee calculation
- Test variable fee structures
- Test fee collection process
- Test fee reporting and accounting
- Test fee adjustment capabilities
- Test discounts and promotions
- Test tax handling where applicable

#### Refund Tests

- Test full refund process
- Test partial refund calculations
- Test refund transaction creation
- Test refund status tracking
- Test refund notification generation
- Test automatic vs. manual refund processes
- Test refund documentation and receipts

### Integration Tests

#### Bitcoin Network Integration

- Test interaction with Bitcoin nodes
- Test transaction broadcasting
- Test blockchain monitoring
- Test handling of network congestion
- Test fee estimation accuracy
- Test mempool monitoring
- Test handling of chain reorganizations

#### Payment Flow Tests

- Test end-to-end payment process
- Test escrow creation to release flow
- Test dispute to resolution flow
- Test withdrawal request to completion
- Test deposit detection and crediting
- Test balance updates across all affected entities
- Test task status updates based on payment status

#### Third-party Service Integration

- Test Bitcoin API service integration
- Test exchange rate API integration
- Test blockchain explorer integration
- Test backup service integration
- Test notification service integration for payment events
- Test analytics integration for transaction data
- Test integration with accounting systems

### UI Component Tests

#### Wallet Dashboard Tests

- Test balance display accuracy
- Test transaction history rendering
- Test filtering and sorting options
- Test pagination of transaction history
- Test visual indicators for transaction status
- Test responsive design for different devices
- Test accessibility of wallet interface

#### Payment Interface Tests

- Test payment form validation
- Test fee display and calculation
- Test confirmation dialogs
- Test loading states during payment processing
- Test error handling and user feedback
- Test payment method selection
- Test receipt display and download

#### Escrow Management Interface

- Test escrow list display
- Test escrow detail view
- Test escrow status visualization
- Test action buttons based on escrow state
- Test dispute interface usability
- Test release confirmation process
- Test escrow history display

### Performance Tests

- Test system handling high transaction volume
- Test concurrent payment processing
- Test blockchain monitoring with large number of addresses
- Test transaction history retrieval with large datasets
- Test escrow system under peak load
- Test fee calculation with complex structures
- Test system response during Bitcoin network congestion

### Security Tests

- Test payment authorization checks
- Test escrow access controls
- Test withdrawal security measures
- Test private key storage security
- Test API endpoint security
- Test protection against double-spending attempts
- Test transaction signature validation
- Test protection against CSRF in payment flows
- Test rate limiting for sensitive payment operations
- Test input validation for Bitcoin addresses and amounts

### Disaster Recovery Tests

- Test wallet backup and restoration
- Test transaction database recovery
- Test handling of blockchain reorgs affecting payments
- Test system recovery after service interruptions
- Test data consistency validation after recovery
- Test reconciliation processes for interrupted transactions
- Test manual intervention procedures for edge cases
