# Payment and Escrow System

This document outlines the requirements for implementing the payment and escrow system in BitTasker.

## Description

The payment and escrow system facilitates secure Bitcoin transactions between task posters and workers. Task posters fund escrow accounts when tasks are assigned, and funds are released to workers upon successful task completion.

## 1. Screens

### Task Poster Screens

- **Escrow Funding Screen**:

  - Task summary
  - Payment amount in Bitcoin
  - Escrow fee display
  - Bitcoin payment options (wallet connect, QR code, address)
  - Payment confirmation view
  - Transaction history

- **Release Payment Screen**:
  - Task completion confirmation
  - Payment release confirmation
  - Optional tip amount
  - Transaction details

### Worker Screens

- **Payment Status Screen**:

  - Escrow status for active tasks
  - Payment release status
  - Transaction history
  - Withdrawal options

- **Withdrawal Screen**:
  - Available balance display
  - Bitcoin address input
  - Withdrawal fee display
  - Confirmation screen
  - Transaction receipt

## 2. Schema

### Transaction Type

```typescript
interface Transaction {
	id: string;
	type: 'escrow_funding' | 'escrow_release' | 'withdrawal' | 'tip' | 'refund';
	amount: number; // in satoshis
	fee: number; // in satoshis
	status: 'pending' | 'confirmed' | 'failed';
	taskId?: string; // for task-related transactions
	senderId: string;
	receiverId: string;
	txHash?: string; // blockchain transaction hash
	createdAt: Date;
	updatedAt: Date;
	metadata: {
		confirmations?: number;
		escrowId?: string;
		refundReason?: string;
		notes?: string;
	};
}
```

### Escrow Type

```typescript
interface Escrow {
	id: string;
	taskId: string;
	bidId: string;
	amount: number; // in satoshis
	status: 'unfunded' | 'funded' | 'released' | 'disputed' | 'refunded';
	fundingTransactionId?: string;
	releaseTransactionId?: string;
	createdAt: Date;
	updatedAt: Date;
}
```

### Wallet Extension

```typescript
interface UserWallet {
	id: string;
	userId: string;
	balance: number; // in satoshis
	pendingBalance: number; // in satoshis (funds in escrow)
	withdrawalAddresses: {
		address: string;
		label?: string;
		lastUsed?: Date;
	}[];
	transactions: string[]; // array of Transaction IDs
}
```

## 3. APIs

### Escrow Management

- `POST /api/escrow` - Create escrow for a task

  - Body: `{ taskId, bidId, amount }`
  - Returns: Created Escrow object

- `GET /api/tasks/{taskId}/escrow` - Get escrow details for a task

  - Returns: Escrow object with transaction details

- `POST /api/escrow/{escrowId}/fund` - Fund an escrow

  - Body: `{ paymentMethod, txHash? }`
  - Returns: Updated Escrow and Transaction objects

- `POST /api/escrow/{escrowId}/release` - Release funds from escrow

  - Body: `{ tipAmount? }`
  - Returns: Updated Escrow and Transaction objects

- `POST /api/escrow/{escrowId}/dispute` - Dispute an escrow
  - Body: `{ reason, evidence? }`
  - Returns: Updated Escrow object

### Wallet Management

- `GET /api/wallet` - Get user's wallet

  - Returns: UserWallet object with transaction history

- `POST /api/wallet/withdraw` - Withdraw funds

  - Body: `{ amount, address }`
  - Returns: Transaction object

- `GET /api/wallet/transactions` - Get transaction history
  - Query params: Pagination, filters
  - Returns: Array of Transaction objects

## 4. Dependencies

- Bitcoin library for address validation and transaction handling (e.g., `bitcoinjs-lib`)
- QR code generation library (e.g., `qrcode`)
- Secure storage solution for private keys (if applicable)
- Exchange rate API integration

## 5. Services

### Frontend Services

- `WalletService`:
  - Methods for displaying balance
  - Generating QR codes
  - Handling transaction history display
- `EscrowService`:
  - Methods for displaying escrow status
  - Handling payment release/disputes

### Backend Services

- `BitcoinService`:
  - Bitcoin address validation
  - Transaction verification
  - Fee calculation
- `EscrowManagementService`:
  - Create and manage escrow contracts
  - Handle fund release/disputes
  - Integrate with blockchain for transaction verification
- `WalletManagementService`:
  - Track user balances
  - Handle withdrawals
  - Maintain transaction history

## 6. Edge Cases

- **Transaction Confirmation Delays**: Handle cases where Bitcoin transactions are slow to confirm
- **Payment Failures**: Implement proper error handling for failed payments

- **Price Volatility**: Address Bitcoin price fluctuations during tasks that take longer to complete

- **Dispute Resolution**: Define clear processes for handling disputes between task posters and workers

- **Network Fees**: Handle variable Bitcoin network fees and who bears this cost

- **Partial Payments**: Consider how to handle cases where task posters only partially fund the escrow

- **Refunds**: Process for refunding task posters if workers can't complete tasks

- **Security Breaches**: Implement measures to protect against unauthorized withdrawals

- **Double Spending**: Verify Bitcoin transactions have sufficient confirmations

- **Minimum Withdrawal Amounts**: Set thresholds to make withdrawals economically feasible considering network fees
