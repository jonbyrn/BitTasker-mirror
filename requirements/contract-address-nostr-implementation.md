# Contract Address in Nostr Messages - Implementation Plan

## Overview

This document outlines the implementation plan for including critical blockchain metadata in Nostr contract messages to ensure contracts remain functional when smart contract addresses change. This approach maintains full decentralization and peer-to-peer compatibility without requiring backend tracking.

## Problem Statement

Currently, when the smart contract address is updated (via environment variables), existing contracts break because they rely on the current environment variable value rather than the address that was actually used when the contract was created. This makes contracts fragile and dependent on centralized configuration.

## Solution

Include the following critical data in each Nostr contract message:
1. **Contract Address** - The exact smart contract address used for this escrow
2. **Network + Environment** - Network identifier (RSK/BSC) and environment (mainnet/testnet)
3. **Total Payment in Dollars** - The total payment amount in USD including fees
4. **BTC Price at Creation** - The BTC price in USD at contract creation time (for historical accuracy and accounting)

## Versioned Approach for Required Fields

To make new fields **required** while maintaining **backward compatibility**, we use a versioned contract format:

### Version 1 (Legacy) - Backward Compatible
- **Format**: `contractFormatVersion: 1` or missing (defaults to 1)
- **Fields**: All new fields are **optional**
- **Behavior**: Uses fallback logic (env vars, transaction extraction)
- **Status**: Continues working indefinitely

### Version 2 (New) - Required Fields
- **Format**: `contractFormatVersion: 2`
- **Fields**: All new fields are **required** (enforced at compile-time and runtime)
- **Validation**: Fails fast if required fields are missing
- **Behavior**: Self-contained, no dependency on env vars

### Benefits
- ✅ **Type Safety**: TypeScript discriminated unions enforce correct handling
- ✅ **Required Fields**: New contracts must include all critical data
- ✅ **Backward Compatible**: Old contracts continue working
- ✅ **Future Proof**: Easy to add v3, v4, etc.
- ✅ **Clear Intent**: Version field makes format explicit

## Implementation Plan

### Testing Strategy

**Critical**: Tests must be built incrementally with each phase and verified before proceeding to the next phase. This ensures functional output at each step.

#### Testing Approach

1. **Incremental Testing**: Build tests alongside each phase implementation
2. **Phase Validation**: Run tests after each phase before proceeding
3. **Comprehensive Testing**: Full test suite at the end
4. **Fast Feedback**: Prioritize high-value tests that catch common AI implementation mistakes

#### Test Execution Order

**Before Each Phase:**
- Review existing tests
- Identify what needs testing for current phase

**During Each Phase:**
- Write tests as you implement
- Run tests frequently during development

**After Each Phase:**
- Run all tests for current phase
- Fix any failures before proceeding
- Verify backward compatibility

**At End:**
- Run comprehensive test suite
- Verify all integration points
- Validate backward compatibility

#### High-Value Test Categories

1. **Type Guard Tests** (Priority 1 - ~30 seconds)
   - Catches version detection bugs
   - Validates discriminated union logic
   - Fast feedback

2. **Validation Tests** (Priority 1 - ~1 minute)
   - Catches data corruption
   - Validates required fields
   - Prevents invalid data entry

3. **Contract Resolution Tests** (Priority 1 - ~1 minute)
   - Validates core use case
   - Tests v1 fallback logic
   - Tests v2 stored address

4. **Backward Compatibility Tests** (Priority 1 - ~30 seconds)
   - Prevents breaking changes
   - Validates v1 contract support
   - Tests mixed v1/v2 scenarios

5. **Data Flow Tests** (Priority 2 - ~2 minutes)
   - Validates end-to-end data flow
   - Catches missing data propagation
   - Tests integration points

6. **Calculation Tests** (Priority 2 - ~30 seconds)
   - Validates financial calculations
   - Prevents calculation errors
   - Tests precision handling

7. **Integration Tests** (Priority 3 - ~5 minutes)
   - Validates complete lifecycle
   - Tests with mocks (no E2E needed)
   - Catches integration issues

### Phase 1: Type Definitions with Versioning

#### 1.1 Create Versioned Contract Types
**File:** `src/lib/types/contract.ts`

Use discriminated unions to handle old vs new contract formats:

```typescript
// Contract format version
export type ContractFormatVersion = 1 | 2;

// Base contract fields (common to all versions)
interface BaseNostrContract {
	escrowId: string;
	taskId: string;
	taskTitle: string;
	taskDescription: string;
	freelancerPubkey: string;
	clientPubkey: string;
	amount: string; // RBTC amount
	currency: string; // 'RBTC'
	status: ContractStatus;
	createdAt: number;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	messageType: 'contract';
	// References to latest status events
	latestStatusEventId?: string;
	latestClientStatusEventId?: string;
	latestFreelancerStatusEventId?: string;
	// Transaction hash from escrow creation
	transactionHash?: string;
	// Dispute proposal
	disputeProposal?: DisputeProposal;
	// Completion evidence attachments
	completionAttachments?: Attachment[];
}

// Version 1: Legacy format (backward compatibility)
export interface NostrContractV1 extends BaseNostrContract {
	contractFormatVersion?: 1; // Optional for backward compatibility
	// No new required fields
}

// Version 2: New format with required blockchain metadata
export interface NostrContractV2 extends BaseNostrContract {
	contractFormatVersion: 2; // Required discriminator
	// REQUIRED: Contract address used for this escrow
	contractAddress: string;
	// REQUIRED: Network identification
	network: 'RSK' | 'BSC';
	environment: 'mainnet' | 'testnet';
	// REQUIRED: Total payment in USD (including fees)
	totalPaymentUsd: number;
	// REQUIRED: BTC price in USD at contract creation (for historical accuracy)
	btcPriceAtCreation: number;
}

// Union type for all contract versions
export type NostrContract = NostrContractV1 | NostrContractV2;

// Type guards for version checking
export function isNostrContractV2(contract: NostrContract): contract is NostrContractV2 {
	return contract.contractFormatVersion === 2;
}

export function isNostrContractV1(contract: NostrContract): contract is NostrContractV1 {
	return !contract.contractFormatVersion || contract.contractFormatVersion === 1;
}
```

#### 1.2 Update `CreateContractParams` Interface
**File:** `src/lib/types/contract.ts`

Make new fields required for new contracts:

```typescript
export interface CreateContractParams {
	// ... existing fields ...
	
	// REQUIRED for new contracts (v2)
	contractAddress: string;
	network: 'RSK' | 'BSC';
	environment: 'mainnet' | 'testnet';
	totalPaymentUsd: number;
	btcPriceAtCreation: number;
	contractFormatVersion?: ContractFormatVersion; // Defaults to 2
}
```

#### 1.3 Update `PendingContractCreation` Interface
**File:** `src/lib/utils/wallet/escrowEvents.ts`

Make new fields required (they're always available at creation time):

```typescript
interface PendingContractCreation {
	// ... existing fields ...
	
	// REQUIRED: New fields for v2 contracts
	contractAddress: string;
	network: 'RSK' | 'BSC';
	environment: 'mainnet' | 'testnet';
	totalPaymentUsd: number;
	btcPriceAtCreation: number; // BTC price at creation time (for historical accuracy)
}
```

#### 1.4 Build Type Guard Tests (REQUIRED BEFORE PROCEEDING)
**File:** `src/lib/tests/contract/typeGuards.test.ts` (NEW)

**Critical**: Build these tests immediately after implementing type guards to catch version detection bugs.

```typescript
import { describe, it, expect } from 'vitest';
import { isNostrContractV2, isNostrContractV1 } from '$lib/types/contract';
import type { NostrContractV1, NostrContractV2 } from '$lib/types/contract';

describe('Contract Type Guards', () => {
	describe('isNostrContractV2', () => {
		it('returns true for v2 contracts with contractFormatVersion: 2', () => {
			const v2Contract: NostrContractV2 = {
				contractFormatVersion: 2,
				contractAddress: '0x1234567890123456789012345678901234567890',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
				escrowId: '123',
				taskId: '456',
				// ... other required fields
			};
			expect(isNostrContractV2(v2Contract)).toBe(true);
		});

		it('returns false for v1 contracts without contractFormatVersion', () => {
			const v1Contract: NostrContractV1 = {
				escrowId: '123',
				taskId: '456',
				// No contractFormatVersion
			};
			expect(isNostrContractV2(v1Contract)).toBe(false);
		});

		it('returns false for v1 contracts with contractFormatVersion: 1', () => {
			const v1Contract: NostrContractV1 = {
				contractFormatVersion: 1,
				escrowId: '123',
				taskId: '456',
			};
			expect(isNostrContractV2(v1Contract)).toBe(false);
		});

		it('handles undefined contractFormatVersion gracefully', () => {
			const contract = {
				escrowId: '123',
			} as NostrContractV1;
			expect(isNostrContractV2(contract)).toBe(false);
		});
	});

	describe('isNostrContractV1', () => {
		it('returns true for contracts without contractFormatVersion', () => {
			const contract = {
				escrowId: '123',
			} as NostrContractV1;
			expect(isNostrContractV1(contract)).toBe(true);
		});

		it('returns true for contracts with contractFormatVersion: 1', () => {
			const contract: NostrContractV1 = {
				contractFormatVersion: 1,
				escrowId: '123',
			};
			expect(isNostrContractV1(contract)).toBe(true);
		});

		it('returns false for v2 contracts', () => {
			const v2Contract: NostrContractV2 = {
				contractFormatVersion: 2,
				contractAddress: '0x1234567890123456789012345678901234567890',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
				escrowId: '123',
				// ... other required fields
			};
			expect(isNostrContractV1(v2Contract)).toBe(false);
		});
	});
});
```

**Validation Steps:**
1. Run tests: `npm run test:unit src/lib/tests/contract/typeGuards.test.ts`
2. Verify all tests pass
3. Check test coverage (should be 100% for type guards)
4. **DO NOT PROCEED** to Phase 2 until all tests pass

### Phase 2: Data Collection

#### 2.1 Update Escrow Creation Flow
**File:** `src/lib/utils/wallet/escrowBid.ts`

Modify `acceptBidAndCreateEscrow` to:
1. Get contract address before creating escrow
2. Determine network and environment
3. Calculate total payment in USD
4. Capture BTC price at creation time
5. Pass all data to pending contract registration

**Key Changes:**
- Get contract address from network config before escrow creation
- Determine network/environment from the `network` parameter
- Calculate total payment USD: `(baseAmount + clientFee) * btcPrice`
- Store `btcPriceAtCreation` in pending contract (use the `btcPrice` parameter passed to the function)

#### 2.2 Update Multi-Network Escrow Manager
**File:** `src/lib/utils/wallet/multiNetworkEscrow.ts`

Ensure `createEscrow` method returns:
- Contract address (from network config)
- Network and environment (from parameters)
- Total payment amount (calculated internally)

**Note:** The method already receives `network` and `environment` parameters, and has access to contract address via `getNetworkConfig()`.

#### 2.3 Update Pending Contract Registration
**File:** `src/lib/utils/wallet/escrowBid.ts`

Modify `registerPendingContractByTxHash` call to include new fields:

```typescript
registerPendingContractByTxHash({
	// ... existing fields ...
	contractAddress: contractAddress, // From network config
	network: network, // From parameter
	environment: environment, // Determine from network config
	totalPaymentUsd: totalPaymentUsd, // Calculate: (baseAmount + clientFee) * btcPrice
	btcPriceAtCreation: btcPrice // Store BTC price at creation time
});
```

### Phase 3: Contract Message Creation

#### 3.1 Update Contract Creation Function
**File:** `src/lib/utils/nostr-bid.ts`

Modify `createContract` function to create v2 contracts with validation:

```typescript
export async function createContract(params: CreateContractParams): Promise<void> {
	try {
		// Validate required fields for v2 contracts
		const version = params.contractFormatVersion || 2;
		
		if (version === 2) {
			if (!params.contractAddress) {
				throw new Error('contractAddress is required for v2 contracts');
			}
			if (!params.network) {
				throw new Error('network is required for v2 contracts');
			}
			if (!params.environment) {
				throw new Error('environment is required for v2 contracts');
			}
			if (params.totalPaymentUsd === undefined || params.totalPaymentUsd === null) {
				throw new Error('totalPaymentUsd is required for v2 contracts');
			}
			if (params.btcPriceAtCreation === undefined || params.btcPriceAtCreation === null) {
				throw new Error('btcPriceAtCreation is required for v2 contracts');
			}
		}
		
		const npub = await getNpub();
		const clientPubkey = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		// Create v2 contract with all required fields
		const contractData: NostrContractV2 = {
			// ... existing base fields ...
			contractFormatVersion: 2,
			contractAddress: params.contractAddress,
			network: params.network,
			environment: params.environment,
			totalPaymentUsd: params.totalPaymentUsd,
			btcPriceAtCreation: params.btcPriceAtCreation,
			transactionHash: params.transactionHash,
			// ... rest of fields ...
		};

		// Send as encrypted DM
		const contractMessage = JSON.stringify(contractData);
		await sendDirectMessage(contractMessage, params.freelancerPubkey, undefined, [
			['d', `contract-${params.escrowId}`],
			['p', params.freelancerPubkey],
			['e', params.escrowId],
			['t', params.taskId],
			['s', 'active'],
			['c', 'creation'],
			['v', '2'] // Version tag for easy filtering
		]);
	} catch (error) {
		console.warn('Error creating contract:', error);
		throw error; // Re-throw to ensure validation errors are caught
	}
}
```

#### 3.2 Update Escrow Event Handler
**File:** `src/lib/utils/wallet/escrowEvents.ts`

Modify `handleEscrowCreated` to pass new fields from pending contract:

```typescript
const contractParams: CreateContractParams = {
	// ... existing fields ...
	contractAddress: pendingContract.contractAddress,
	network: pendingContract.network,
	environment: pendingContract.environment,
	totalPaymentUsd: pendingContract.totalPaymentUsd,
	btcPriceAtCreation: pendingContract.btcPriceAtCreation,
	transactionHash: event.transactionHash
};
```

### Phase 4: Contract Resolution Logic with Version Handling

#### 4.1 Create Contract Address Resolver
**File:** `src/lib/utils/wallet/contractResolver.ts` (NEW)

Create a version-aware resolver with fallback logic:

```typescript
/**
 * Resolve contract address for a given contract
 * Version 2: Uses stored address (required)
 * Version 1: Falls back to transaction or env vars
 */
export async function resolveContractAddress(
	contract: NostrContract,
	network?: 'RSK' | 'BSC',
	environment?: 'mainnet' | 'testnet'
): Promise<string> {
	// Version 2: Contract address is required
	if (isNostrContractV2(contract)) {
		return ethers.getAddress(contract.contractAddress);
	}
	
	// Version 1: Fallback logic for legacy contracts
	if (isNostrContractV1(contract)) {
		// 1. Try to extract from transaction
		if (contract.transactionHash) {
			const address = await extractContractAddressFromTx(
				contract.transactionHash,
				network || 'RSK',
				environment || 'testnet'
			);
			if (address) return address;
		}
		
		// 2. Final fallback: Use current env var
		return getCurrentContractAddress(
			network || 'RSK',
			environment || 'testnet'
		);
	}
	
	// Should never reach here, but TypeScript needs this
	throw new Error('Invalid contract format');
}

/**
 * Resolve network and environment for a contract
 */
export function resolveContractNetwork(
	contract: NostrContract
): { network: 'RSK' | 'BSC'; environment: 'mainnet' | 'testnet' } {
	if (isNostrContractV2(contract)) {
		return {
			network: contract.network,
			environment: contract.environment
		};
	}
	
	// Version 1: Use defaults or current config
	return {
		network: 'RSK',
		environment: 'testnet'
	};
}

/**
 * Get total payment in USD
 */
export function getTotalPaymentUsd(contract: NostrContract): number | null {
	if (isNostrContractV2(contract)) {
		return contract.totalPaymentUsd;
	}
	
	// Version 1: Not available
	return null;
}

/**
 * Get BTC price at contract creation
 */
export function getBtcPriceAtCreation(contract: NostrContract): number | null {
	if (isNostrContractV2(contract)) {
		return contract.btcPriceAtCreation;
	}
	
	// Version 1: Not available
	return null;
}
```

#### 4.2 Update Contract Interaction Code
**Files:** 
- `src/lib/utils/wallet/escrow.ts`
- `src/lib/utils/wallet/multiNetworkEscrow.ts`

Modify contract connection logic to:
1. Check if contract has stored address
2. Use stored address if available
3. Fall back to current env var for backward compatibility

#### 4.3 Build Contract Resolution Tests (REQUIRED BEFORE PROCEEDING)
**File:** `src/lib/tests/contract/resolver.test.ts` (NEW)

**Critical**: Build these tests immediately after implementing resolver functions to validate the core use case.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
	resolveContractAddress, 
	resolveContractNetwork,
	getTotalPaymentUsd,
	getBtcPriceAtCreation
} from '$lib/utils/wallet/contractResolver';
import type { NostrContractV1, NostrContractV2 } from '$lib/types/contract';

describe('Contract Resolution', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('resolveContractAddress', () => {
		it('returns stored address for v2 contracts', async () => {
			const v2Contract: NostrContractV2 = {
				contractFormatVersion: 2,
				contractAddress: '0xStoredAddress123456789012345678901234567890',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
				escrowId: '123',
				// ... other required fields
			};
			
			const address = await resolveContractAddress(v2Contract);
			expect(address).toBe('0xStoredAddress123456789012345678901234567890');
		});

		it('returns checksummed address for v2 contracts', async () => {
			const v2Contract: NostrContractV2 = {
				contractFormatVersion: 2,
				contractAddress: '0xabcd12345678901234567890123456789012345678',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
				escrowId: '123',
				// ... other required fields
			};
			
			const address = await resolveContractAddress(v2Contract);
			// Should be checksummed
			expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
		});

		it('falls back to env var for v1 contracts without transaction hash', async () => {
			const v1Contract: NostrContractV1 = {
				escrowId: '123',
				taskId: '456',
				// No transactionHash
			};
			
			// Mock env var
			vi.stubEnv('VITE_RSK_CONTRACT_ADDRESS_TESTNET', '0xEnvVarAddress123456789012345678901234567890');
			
			const address = await resolveContractAddress(v1Contract, 'RSK', 'testnet');
			expect(address).toBe('0xEnvVarAddress123456789012345678901234567890');
		});

		it('extracts address from transaction for v1 contracts with transaction hash', async () => {
			const v1Contract: NostrContractV1 = {
				escrowId: '123',
				taskId: '456',
				transactionHash: '0xtxHash',
			};
			
			// Mock transaction extraction
			const mockExtractAddress = vi.fn().mockResolvedValue('0xExtractedAddress123456789012345678901234567890');
			vi.mock('$lib/utils/wallet/transactionExtractor', () => ({
				extractContractAddressFromTx: mockExtractAddress,
			}));
			
			const address = await resolveContractAddress(v1Contract, 'RSK', 'testnet');
			expect(address).toBe('0xExtractedAddress123456789012345678901234567890');
			expect(mockExtractAddress).toHaveBeenCalledWith('0xtxHash', 'RSK', 'testnet');
		});

		it('throws error for invalid contract format', async () => {
			const invalidContract = {
				escrowId: '123',
			} as any;
			
			await expect(resolveContractAddress(invalidContract))
				.rejects.toThrow('Invalid contract format');
		});
	});

	describe('resolveContractNetwork', () => {
		it('returns stored network/environment for v2 contracts', () => {
			const v2Contract: NostrContractV2 = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				network: 'BSC',
				environment: 'mainnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
				escrowId: '123',
				// ... other required fields
			};
			
			const network = resolveContractNetwork(v2Contract);
			expect(network).toEqual({
				network: 'BSC',
				environment: 'mainnet',
			});
		});

		it('returns defaults for v1 contracts', () => {
			const v1Contract: NostrContractV1 = {
				escrowId: '123',
			};
			
			const network = resolveContractNetwork(v1Contract);
			expect(network).toEqual({
				network: 'RSK',
				environment: 'testnet',
			});
		});
	});

	describe('getTotalPaymentUsd', () => {
		it('returns stored value for v2 contracts', () => {
			const v2Contract: NostrContractV2 = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 5500,
				btcPriceAtCreation: 50000,
				escrowId: '123',
				// ... other required fields
			};
			
			expect(getTotalPaymentUsd(v2Contract)).toBe(5500);
		});

		it('returns null for v1 contracts', () => {
			const v1Contract: NostrContractV1 = {
				escrowId: '123',
			};
			
			expect(getTotalPaymentUsd(v1Contract)).toBeNull();
		});
	});

	describe('getBtcPriceAtCreation', () => {
		it('returns stored value for v2 contracts', () => {
			const v2Contract: NostrContractV2 = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
				escrowId: '123',
				// ... other required fields
			};
			
			expect(getBtcPriceAtCreation(v2Contract)).toBe(50000);
		});

		it('returns null for v1 contracts', () => {
			const v1Contract: NostrContractV1 = {
				escrowId: '123',
			};
			
			expect(getBtcPriceAtCreation(v1Contract)).toBeNull();
		});
	});
});
```

**Validation Steps:**
1. Run tests: `npm run test:unit src/lib/tests/contract/resolver.test.ts`
2. Verify all tests pass
3. Check test coverage (should be 95%+ for resolver functions)
4. **DO NOT PROCEED** to Phase 5 until all tests pass

### Phase 5: Migration Strategy & Validation

#### 5.1 Build Validation Tests (REQUIRED BEFORE PROCEEDING)
**File:** `src/lib/tests/contract/validation.test.ts` (NEW)

**Critical**: Build these tests immediately after implementing validation to catch data corruption bugs.

```typescript
import { describe, it, expect } from 'vitest';
import { parseNostrContract } from '$lib/utils/nostr-bid';
import type { NostrContractV2 } from '$lib/types/contract';

describe('Contract Validation', () => {
	describe('v2 Contract Validation', () => {
		it('accepts valid v2 contract with all required fields', () => {
			const validContract = {
				contractFormatVersion: 2,
				contractAddress: '0x1234567890123456789012345678901234567890',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
				escrowId: '123',
				taskId: '456',
				// ... other required fields
			};
			expect(() => parseNostrContract(validContract)).not.toThrow();
		});

		it('rejects v2 contract with missing contractAddress', () => {
			const invalidContract = {
				contractFormatVersion: 2,
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
				// Missing contractAddress
			};
			expect(() => parseNostrContract(invalidContract))
				.toThrow('v2 contract missing required field: contractAddress');
		});

		it('rejects v2 contract with missing network', () => {
			const invalidContract = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				environment: 'testnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
				// Missing network
			};
			expect(() => parseNostrContract(invalidContract))
				.toThrow('v2 contract missing required field: network');
		});

		it('rejects v2 contract with missing environment', () => {
			const invalidContract = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				network: 'RSK',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
				// Missing environment
			};
			expect(() => parseNostrContract(invalidContract))
				.toThrow('v2 contract missing required field: environment');
		});

		it('rejects v2 contract with missing totalPaymentUsd', () => {
			const invalidContract = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				network: 'RSK',
				environment: 'testnet',
				btcPriceAtCreation: 50000,
				// Missing totalPaymentUsd
			};
			expect(() => parseNostrContract(invalidContract))
				.toThrow('v2 contract missing required field: totalPaymentUsd');
		});

		it('rejects v2 contract with missing btcPriceAtCreation', () => {
			const invalidContract = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 100,
				// Missing btcPriceAtCreation
			};
			expect(() => parseNostrContract(invalidContract))
				.toThrow('v2 contract missing required field: btcPriceAtCreation');
		});

		it('rejects v2 contract with invalid address format', () => {
			const invalidContract = {
				contractFormatVersion: 2,
				contractAddress: 'invalid-address',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
			};
			expect(() => parseNostrContract(invalidContract))
				.toThrow('Invalid contract address format');
		});

		it('rejects v2 contract with invalid network value', () => {
			const invalidContract = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				network: 'INVALID',
				environment: 'testnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
			};
			expect(() => parseNostrContract(invalidContract))
				.toThrow('Invalid network value');
		});

		it('rejects v2 contract with invalid environment value', () => {
			const invalidContract = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				network: 'RSK',
				environment: 'INVALID',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
			};
			expect(() => parseNostrContract(invalidContract))
				.toThrow('Invalid environment value');
		});

		it('rejects v2 contract with negative totalPaymentUsd', () => {
			const invalidContract = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: -100,
				btcPriceAtCreation: 50000,
			};
			expect(() => parseNostrContract(invalidContract))
				.toThrow('Invalid totalPaymentUsd value');
		});

		it('rejects v2 contract with zero totalPaymentUsd', () => {
			const invalidContract = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 0,
				btcPriceAtCreation: 50000,
			};
			expect(() => parseNostrContract(invalidContract))
				.toThrow('Invalid totalPaymentUsd value');
		});

		it('rejects v2 contract with NaN totalPaymentUsd', () => {
			const invalidContract = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: NaN,
				btcPriceAtCreation: 50000,
			};
			expect(() => parseNostrContract(invalidContract))
				.toThrow('Invalid totalPaymentUsd value');
		});

		it('rejects v2 contract with negative btcPriceAtCreation', () => {
			const invalidContract = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: -50000,
			};
			expect(() => parseNostrContract(invalidContract))
				.toThrow('Invalid btcPriceAtCreation value');
		});
	});

	describe('v1 Contract Validation (Backward Compatibility)', () => {
		it('accepts valid v1 contract without v2 fields', () => {
			const v1Contract = {
				escrowId: '123',
				taskId: '456',
				amount: '0.1',
				status: 'active',
				// No v2 fields required
			};
			expect(() => parseNostrContract(v1Contract)).not.toThrow();
		});

		it('accepts v1 contract with contractFormatVersion: 1', () => {
			const v1Contract = {
				contractFormatVersion: 1,
				escrowId: '123',
				taskId: '456',
			};
			expect(() => parseNostrContract(v1Contract)).not.toThrow();
		});
	});

	describe('Invalid Input Handling', () => {
		it('rejects null input', () => {
			expect(() => parseNostrContract(null)).toThrow('Invalid contract data');
		});

		it('rejects undefined input', () => {
			expect(() => parseNostrContract(undefined)).toThrow('Invalid contract data');
		});

		it('rejects string input', () => {
			expect(() => parseNostrContract('invalid')).toThrow('Invalid contract data');
		});

		it('rejects array input', () => {
			expect(() => parseNostrContract([])).toThrow('Invalid contract data');
		});
	});
});
```

**Validation Steps:**
1. Run tests: `npm run test:unit src/lib/tests/contract/validation.test.ts`
2. Verify all tests pass
3. Check test coverage (should be 95%+ for validation)
4. **DO NOT PROCEED** to Phase 6 until all tests pass

#### 5.2 Backward Compatibility Strategy
- **Version 1 contracts**: Continue to work with fallback logic
- **Version 2 contracts**: Require all new fields (enforced at creation)
- **Type safety**: Discriminated unions ensure correct handling
- **Runtime validation**: New contracts must include all required fields

#### 5.2 Contract Parsing & Validation
**File:** `src/lib/utils/nostr-bid.ts` (add validation helper)

```typescript
/**
 * Parse and validate contract from Nostr message
 * Handles both v1 (legacy) and v2 (new) formats
 */
export function parseNostrContract(raw: unknown): NostrContract {
	if (!raw || typeof raw !== 'object') {
		throw new Error('Invalid contract data');
	}
	
	const contract = raw as Partial<NostrContract>;
	
	// Check version
	const version = contract.contractFormatVersion || 1;
	
	if (version === 2) {
		// Validate v2 required fields
		if (!contract.contractAddress) {
			throw new Error('v2 contract missing required field: contractAddress');
		}
		if (!contract.network) {
			throw new Error('v2 contract missing required field: network');
		}
		if (!contract.environment) {
			throw new Error('v2 contract missing required field: environment');
		}
		if (contract.totalPaymentUsd === undefined || contract.totalPaymentUsd === null) {
			throw new Error('v2 contract missing required field: totalPaymentUsd');
		}
		if (contract.btcPriceAtCreation === undefined || contract.btcPriceAtCreation === null) {
			throw new Error('v2 contract missing required field: btcPriceAtCreation');
		}
		
		// Validate address format
		try {
			ethers.getAddress(contract.contractAddress);
		} catch {
			throw new Error('Invalid contract address format');
		}
		
		// Validate network/environment values
		if (!['RSK', 'BSC'].includes(contract.network)) {
			throw new Error('Invalid network value');
		}
		if (!['mainnet', 'testnet'].includes(contract.environment)) {
			throw new Error('Invalid environment value');
		}
		
		// Validate USD amount
		if (typeof contract.totalPaymentUsd !== 'number' || contract.totalPaymentUsd <= 0) {
			throw new Error('Invalid totalPaymentUsd value');
		}
		
		// Validate BTC price
		if (typeof contract.btcPriceAtCreation !== 'number' || contract.btcPriceAtCreation <= 0) {
			throw new Error('Invalid btcPriceAtCreation value');
		}
		
		return contract as NostrContractV2;
	}
	
	// Version 1: Legacy format (no validation needed, backward compatible)
	return contract as NostrContractV1;
}
```

#### 5.3 Migration Path
1. **Phase 1-3**: Implement v2 contracts with required fields
2. **Phase 4**: Update contract resolution to handle both versions
3. **Phase 5**: Add validation and type guards
4. **Future**: Old contracts continue working via fallback logic
5. **Optional**: Could add migration utility to upgrade v1 to v2 (not required)

#### 5.4 Runtime Enforcement
- **Creation time**: All new contracts must be v2 with required fields
- **Reading time**: Both v1 and v2 contracts are supported
- **Type guards**: Ensure correct handling based on version
- **Validation**: Fail fast on invalid v2 contracts

### Phase 6: Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ acceptBidAndCreateEscrow(bid, task, btcPrice, network)      │
└──────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Get contract address from network config                 │
│ 2. Determine environment (mainnet/testnet)                 │
│ 3. Calculate totalPaymentUsd = (baseAmount + fees) * btcPrice│
│ 4. Store btcPriceAtCreation = btcPrice (from parameter)      │
└──────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ registerPendingContractByTxHash({                            │
│   contractAddress, network, environment,                    │
│   totalPaymentUsd, btcPriceAtCreation, ...                  │
│ })                                                           │
└──────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ handleEscrowCreated(event)                                  │
│ - Finds pending contract by txHash                          │
│ - Extracts all stored data                                  │
└──────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ createContract({                                             │
│   contractAddress, network, environment,                    │
│   totalPaymentUsd, btcPriceAtCreation, ...                   │
│ })                                                           │
└──────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ NostrContract message sent via encrypted DM                 │
│ Contains: contractAddress, network, environment,           │
│           totalPaymentUsd, btcPriceAtCreation,              │
│           transactionHash                                    │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Workflow

### Critical Testing Requirements

**For AI Builder (or Human Developer):**

1. **Build tests incrementally** - Write tests alongside each phase implementation
2. **Test before proceeding** - Run tests after each phase and fix failures
3. **Validate functionality** - Ensure tests pass before moving to next phase
4. **Comprehensive testing** - Run full test suite at the end

### Phase-by-Phase Testing Requirements

**Phase 1 (Type Definitions):**
- ✅ Build type guard tests immediately
- ✅ Run tests: `npm run test:unit src/lib/tests/contract/typeGuards.test.ts`
- ✅ Verify 100% coverage for type guards
- ❌ **DO NOT PROCEED** to Phase 2 until all tests pass

**Phase 2-3 (Data Collection & Message Creation):**
- ✅ Verify data flows correctly (manual inspection or simple tests)
- ✅ Check that all required fields are collected
- ✅ Verify fields are passed to `createContract`

**Phase 4 (Contract Resolution):**
- ✅ Build resolver tests immediately
- ✅ Run tests: `npm run test:unit src/lib/tests/contract/resolver.test.ts`
- ✅ Verify 95%+ coverage for resolver functions
- ❌ **DO NOT PROCEED** to Phase 5 until all tests pass

**Phase 5 (Validation):**
- ✅ Build validation tests immediately
- ✅ Run tests: `npm run test:unit src/lib/tests/contract/validation.test.ts`
- ✅ Verify 95%+ coverage for validation
- ❌ **DO NOT PROCEED** to Phase 6 until all tests pass

**Phase 6 (Comprehensive Testing):**
- ✅ Build all remaining tests (backward compatibility, data flow, calculations, integration)
- ✅ Run full test suite: `npm run test:unit src/lib/tests/contract/`
- ✅ Check coverage: `npm run test:coverage src/lib/tests/contract/`
- ✅ Verify all tests pass and coverage meets thresholds
- ❌ **DO NOT MERGE** until all tests pass

## Implementation Checklist

### Type Definitions
- [ ] Create `NostrContractV1` interface (legacy format)
- [ ] Create `NostrContractV2` interface (new format with required fields)
- [ ] Create `NostrContract` union type
- [ ] Create type guard functions (`isNostrContractV2`, `isNostrContractV1`)
- [ ] Update `CreateContractParams` interface (make new fields required)
- [ ] Update `PendingContractCreation` interface (make new fields required)
- [ ] **BUILD TESTS**: Create `typeGuards.test.ts` with all type guard tests
- [ ] **VALIDATE**: Run tests and verify all pass before proceeding

### Data Collection
- [ ] Modify `acceptBidAndCreateEscrow` to collect contract address
- [ ] Modify `acceptBidAndCreateEscrow` to determine network/environment
- [ ] Modify `acceptBidAndCreateEscrow` to calculate totalPaymentUsd
- [ ] Modify `acceptBidAndCreateEscrow` to store btcPriceAtCreation
- [ ] Update `registerPendingContractByTxHash` call with new data
- [ ] Update `PendingContractCreation` interface usage

### Contract Message Creation
- [ ] Update `createContract` to include new fields
- [ ] Update `handleEscrowCreated` to pass new fields
- [ ] Verify all data flows correctly

### Contract Resolution
- [ ] Create `contractResolver.ts` with version-aware resolution logic
- [ ] Implement `resolveContractAddress()` with version handling
- [ ] Implement `resolveContractNetwork()` helper
- [ ] Implement `getTotalPaymentUsd()` helper
- [ ] Implement `getBtcPriceAtCreation()` helper
- [ ] Update contract connection code to use resolver
- [ ] **BUILD TESTS**: Create `resolver.test.ts` with all resolver tests
- [ ] **VALIDATE**: Run tests and verify all pass before proceeding

### Validation & Parsing
- [ ] Create `parseNostrContract()` validation function
- [ ] Add validation for v2 required fields
- [ ] Add address format validation
- [ ] Add network/environment enum validation
- [ ] Add USD amount validation
- [ ] Update contract parsing to use validation function
- [ ] **BUILD TESTS**: Create `validation.test.ts` with all validation tests
- [ ] **VALIDATE**: Run tests and verify all pass before proceeding

### Phase 6: Comprehensive Testing

#### 6.1 Build Backward Compatibility Tests
**File:** `src/lib/tests/contract/backwardCompatibility.test.ts` (NEW)

**Critical**: Ensures existing contracts continue to work after implementation.

```typescript
import { describe, it, expect } from 'vitest';
import { parseNostrContract, getUserContracts } from '$lib/utils/nostr-bid';
import { resolveContractAddress, getTotalPaymentUsd, getBtcPriceAtCreation } from '$lib/utils/wallet/contractResolver';
import { isNostrContractV1, isNostrContractV2 } from '$lib/types/contract';
import type { NostrContractV1 } from '$lib/types/contract';

describe('Backward Compatibility', () => {
	describe('v1 Contract Support', () => {
		it('v1 contracts can be parsed without error', () => {
			const v1Contract: NostrContractV1 = {
				escrowId: '123',
				taskId: '456',
				amount: '0.1',
				status: 'active',
				createdAt: Date.now(),
				estimatedStartTime: Date.now(),
				estimatedCompletionTime: Date.now() + 86400000,
				messageType: 'contract',
				freelancerPubkey: 'npub1...',
				clientPubkey: 'npub2...',
				currency: 'RBTC',
			};
			
			expect(() => parseNostrContract(v1Contract)).not.toThrow();
			const parsed = parseNostrContract(v1Contract);
			expect(parsed).toBeDefined();
			expect(isNostrContractV1(parsed)).toBe(true);
		});

		it('v1 contracts can resolve address (falls back)', async () => {
			const v1Contract: NostrContractV1 = {
				escrowId: '123',
				taskId: '456',
			};
			
			vi.stubEnv('VITE_RSK_CONTRACT_ADDRESS_TESTNET', '0xFallbackAddress123456789012345678901234567890');
			
			const address = await resolveContractAddress(v1Contract, 'RSK', 'testnet');
			expect(address).toBeDefined();
			expect(address).toBe('0xFallbackAddress123456789012345678901234567890');
		});

		it('v1 contracts return null for v2-only fields', () => {
			const v1Contract: NostrContractV1 = {
				escrowId: '123',
			};
			
			expect(getTotalPaymentUsd(v1Contract)).toBeNull();
			expect(getBtcPriceAtCreation(v1Contract)).toBeNull();
		});
	});

	describe('Mixed v1/v2 Contract Support', () => {
		it('getUserContracts handles mixed v1/v2 contracts', async () => {
			// Mock getUserContracts to return both types
			const v1Contract: NostrContractV1 = {
				escrowId: '1',
				taskId: '1',
				// ... v1 fields
			};
			
			const v2Contract = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
				escrowId: '2',
				taskId: '2',
				// ... v2 fields
			};
			
			// Mock implementation
			// Both should be readable and functional
			expect(isNostrContractV1(v1Contract)).toBe(true);
			expect(isNostrContractV2(v2Contract)).toBe(true);
		});
	});
});
```

#### 6.2 Build Data Flow Integration Tests
**File:** `src/lib/tests/contract/creationFlow.test.ts` (NEW)

**Critical**: Validates end-to-end data flow through contract creation chain.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { acceptBidAndCreateEscrow } from '$lib/utils/wallet/escrowBid';
import { handleEscrowCreated } from '$lib/utils/wallet/escrowEvents';
import { createContract } from '$lib/utils/nostr-bid';
import { getUserContracts } from '$lib/utils/nostr-bid';

describe('Contract Creation Data Flow', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('all required v2 fields flow from acceptBid to Nostr message', async () => {
		// Setup mocks
		const mockBtcPrice = 50000;
		const mockContractAddress = '0x1234567890123456789012345678901234567890';
		const mockNetwork = 'RSK';
		const mockEnvironment = 'testnet';
		
		// Mock acceptBidAndCreateEscrow
		const capturedPendingContract = { /* will capture */ };
		vi.spyOn(/* acceptBidAndCreateEscrow implementation */);
		
		// Mock handleEscrowCreated
		const capturedCreateParams = { /* will capture */ };
		vi.spyOn(createContract).mockImplementation(async (params) => {
			Object.assign(capturedCreateParams, params);
		});
		
		// Execute flow
		const mockBid = { /* bid data */ };
		const mockTask = { /* task data */ };
		await acceptBidAndCreateEscrow(mockBid, mockTask, mockBtcPrice, mockNetwork);
		
		const mockEscrowEvent = {
			escrowId: '123',
			transactionHash: '0xtxHash',
		};
		await handleEscrowCreated(mockEscrowEvent);
		
		// Verify all fields present
		expect(capturedCreateParams.contractAddress).toBe(mockContractAddress);
		expect(capturedCreateParams.network).toBe(mockNetwork);
		expect(capturedCreateParams.environment).toBe(mockEnvironment);
		expect(capturedCreateParams.totalPaymentUsd).toBeDefined();
		expect(capturedCreateParams.totalPaymentUsd).toBeGreaterThan(0);
		expect(capturedCreateParams.btcPriceAtCreation).toBe(mockBtcPrice);
	});
});
```

#### 6.3 Build Calculation Tests
**File:** `src/lib/tests/contract/calculation.test.ts` (NEW)

**Critical**: Validates financial calculations are accurate.

```typescript
import { describe, it, expect } from 'vitest';

describe('USD Calculation', () => {
	it('calculates totalPaymentUsd correctly', () => {
		const baseAmount = 0.1; // RBTC
		const clientFee = 0.01; // RBTC
		const btcPrice = 50000; // USD
		
		const totalPaymentUsd = (baseAmount + clientFee) * btcPrice;
		expect(totalPaymentUsd).toBe(5500); // 0.11 * 50000
	});

	it('handles precision correctly', () => {
		const baseAmount = 0.12345678; // RBTC
		const clientFee = 0.01234567; // RBTC
		const btcPrice = 50000.123; // USD
		
		const totalPaymentUsd = (baseAmount + clientFee) * btcPrice;
		expect(totalPaymentUsd).toBeCloseTo(6790.123, 2);
	});

	it('handles very large amounts', () => {
		const baseAmount = 100; // RBTC
		const clientFee = 10; // RBTC
		const btcPrice = 100000; // USD
		
		const totalPaymentUsd = (baseAmount + clientFee) * btcPrice;
		expect(totalPaymentUsd).toBe(11000000);
	});
});
```

#### 6.4 Build Complete Integration Test
**File:** `src/lib/tests/contract/integration.test.ts` (NEW)

**Critical**: Validates complete contract lifecycle with mocks.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { acceptBidAndCreateEscrow } from '$lib/utils/wallet/escrowBid';
import { handleEscrowCreated } from '$lib/utils/wallet/escrowEvents';
import { getUserContracts } from '$lib/utils/nostr-bid';
import { resolveContractAddress } from '$lib/utils/wallet/contractResolver';
import { isNostrContractV2 } from '$lib/types/contract';

describe('Complete Contract Lifecycle Integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('complete flow: bid acceptance → escrow → contract creation → contract reading', async () => {
		// Setup
		const mockBid = { /* bid data */ };
		const mockTask = { /* task data */ };
		const mockBtcPrice = 50000;
		const mockNetwork = 'RSK';
		
		// 1. Accept bid and create escrow
		const escrowResult = await acceptBidAndCreateEscrow(
			mockBid, 
			mockTask, 
			mockBtcPrice, 
			mockNetwork
		);
		
		expect(escrowResult).toBeDefined();
		expect(escrowResult.escrowId).toBeDefined();
		
		// 2. Simulate escrow created event
		const escrowEvent = {
			escrowId: escrowResult.escrowId,
			transactionHash: escrowResult.transactionHash,
		};
		
		await handleEscrowCreated(escrowEvent);
		
		// 3. Verify contract was created with all v2 fields
		const contracts = await getUserContracts();
		const createdContract = contracts.find(c => 
			c.contract.escrowId === escrowResult.escrowId
		);
		
		expect(createdContract).toBeDefined();
		expect(isNostrContractV2(createdContract.contract)).toBe(true);
		expect(createdContract.contract.contractAddress).toBeDefined();
		expect(createdContract.contract.network).toBe(mockNetwork);
		expect(createdContract.contract.environment).toBeDefined();
		expect(createdContract.contract.totalPaymentUsd).toBeDefined();
		expect(createdContract.contract.totalPaymentUsd).toBeGreaterThan(0);
		expect(createdContract.contract.btcPriceAtCreation).toBe(mockBtcPrice);
		
		// 4. Verify contract can be resolved
		const address = await resolveContractAddress(createdContract.contract);
		expect(address).toBe(createdContract.contract.contractAddress);
	});
});
```

#### 6.5 Run Comprehensive Test Suite

**Test Execution Order:**
1. Run all unit tests: `npm run test:unit src/lib/tests/contract/`
2. Run integration tests: `npm run test:unit src/lib/tests/contract/integration.test.ts`
3. Check coverage: `npm run test:coverage src/lib/tests/contract/`
4. Verify all tests pass before merging

**Coverage Goals:**
- Type guards: 100%
- Validation: 95%+
- Resolver functions: 95%+
- Overall contract-related code: 80%+

**Test Checklist:**
- [ ] All type guard tests pass
- [ ] All validation tests pass
- [ ] All resolver tests pass
- [ ] All backward compatibility tests pass
- [ ] All data flow tests pass
- [ ] All calculation tests pass
- [ ] All integration tests pass
- [ ] Coverage meets thresholds
- [ ] No breaking changes detected

### UI Enhancements (Optional - Phase 7)
- [ ] Display `totalPaymentUsd` when available (use type guard)
- [ ] Add `btcPriceAtCreation` to technical details section
- [ ] Add network/environment badges to contract displays
- [ ] Add `contractAddress` display with copy functionality
- [ ] Test UI with v1 contracts (backward compatibility)
- [ ] Test UI with v2 contracts (new fields display)
- [ ] Test responsive design for new UI elements
- [ ] Test accessibility for new UI elements

## Data Validation & Type Safety

### Version 2 Contracts (Required Fields)

#### Contract Address
- **Required**: Yes (v2 only)
- **Format**: Valid Ethereum address
- **Validation**: 
  - Must pass `ethers.getAddress()` checksum validation
  - Must be 42 characters (0x + 40 hex chars)
  - Validated at contract creation and parsing

#### Network & Environment
- **Required**: Yes (v2 only)
- **Network**: Must be `'RSK' | 'BSC'` (type-safe enum)
- **Environment**: Must be `'mainnet' | 'testnet'` (type-safe enum)
- **Validation**: TypeScript enforces values, runtime validates

#### Total Payment USD
- **Required**: Yes (v2 only)
- **Type**: `number`
- **Validation**: 
  - Must be positive number
  - Must not be NaN or Infinity
  - Calculated as: `(baseAmount + clientFee) * btcPrice`
  - Precision: JavaScript number (IEEE 754 double)

#### BTC Price at Creation
- **Required**: Yes (v2 only)
- **Type**: `number`
- **Validation**: 
  - Must be positive number
  - Must not be NaN or Infinity
  - Represents BTC price in USD at contract creation time
  - Used for historical accuracy and accounting purposes
  - Precision: JavaScript number (IEEE 754 double)

### Version 1 Contracts (Legacy)
- **All fields optional**: No validation required
- **Fallback logic**: Uses env vars or transaction extraction
- **Backward compatible**: Continues to work as before

### Type Safety Strategy
1. **Discriminated Unions**: TypeScript ensures correct version handling
2. **Type Guards**: Runtime checks with `isNostrContractV2()` / `isNostrContractV1()`
3. **Required Fields**: Enforced at compile time for v2 contracts
4. **Runtime Validation**: Validates required fields at creation and parsing

## Backward Compatibility Strategy

### Version-Based Compatibility

#### Version 1 Contracts (Legacy)
- **No breaking changes**: Continue to work exactly as before
- **Fallback logic**: 
  1. Try to extract contract address from transaction hash
  2. Fall back to current environment variable
  3. Use default network/environment (RSK testnet)
- **No migration required**: Old contracts work indefinitely

#### Version 2 Contracts (New)
- **Required fields**: All new fields must be present
- **Type safety**: TypeScript enforces required fields
- **Runtime validation**: Fails fast if required fields missing
- **Self-contained**: No dependency on environment variables

### Migration Strategy

#### Automatic Handling
- **Reading contracts**: Version detection via `contractFormatVersion` field
- **Type guards**: Automatically route to correct handling logic
- **No user action**: Seamless handling of both versions

#### Optional Future Enhancements
1. **Migration utility**: Could add function to upgrade v1 → v2 (not required)
2. **Backfill script**: Could update old contracts in Nostr (not recommended - breaks immutability)
3. **Deprecation notice**: Could warn users about v1 contracts (optional)

### Key Benefits
- ✅ **Zero breaking changes**: Old contracts continue working
- ✅ **Type safety**: Compile-time enforcement of required fields
- ✅ **Runtime validation**: Catches errors early
- ✅ **Clear versioning**: Easy to identify contract format
- ✅ **Future-proof**: Easy to add v3, v4, etc. in the future

## Benefits

1. **Decentralization**: Each contract is self-contained
2. **Peer-to-Peer**: No backend dependency
3. **Historical Preservation**: Old contracts remain functional
4. **Multi-Network Support**: Clear network/environment identification
5. **Transparency**: Total payment in USD for user clarity
6. **Historical Accuracy**: BTC price at creation enables accurate accounting and verification
7. **Backward Compatible**: Existing contracts continue to work

## Phase 7: UI Enhancements

### Overview

The UI components are already backward compatible and work with both v1 and v2 contracts. Ensure all modifications are backwards compatible.

### 7.1 Display Total Payment USD (Priority: High)

**Purpose**: Show the actual USD value at contract creation instead of calculating from current BTC price.

**Files to Modify:**
- `src/lib/components/contracts/ContractDrawer.svelte`
- `src/lib/components/contracts/ContractModal.svelte`
- `src/lib/components/contracts/ContractCard.svelte`

**Implementation:**

```svelte
<script>
  import { isNostrContractV2, getTotalPaymentUsd } from '$lib/utils/wallet/contractResolver';
  
  // In component
  const displayAmount = $derived(() => {
    if (contract && isNostrContractV2(contract.contract)) {
      const totalUsd = getTotalPaymentUsd(contract.contract);
      if (totalUsd !== null) {
        return formatUSD(totalUsd);
      }
    }
    // Fallback to calculated amount
    return formatUSDWithSatsSync(contract.contract.amount, btcPrice);
  });
</script>

<!-- Display -->
<span class="font-semibold">{displayAmount}</span>
```

**Benefits:**
- Shows accurate USD value at contract creation
- Better for accounting and historical records
- Falls back gracefully for v1 contracts

**Complexity**: Low

### 7.2 Display BTC Price at Creation (Priority: Medium)

**Purpose**: Show the BTC price used when the contract was created for transparency and accounting.

**Files to Modify:**
- `src/lib/components/contracts/ContractDrawer.svelte` (technical details section)
- `src/lib/components/contracts/ContractModal.svelte` (technical details section)

**Implementation:**

```svelte
<script>
  import { isNostrContractV2, getBtcPriceAtCreation } from '$lib/utils/wallet/contractResolver';
  
  const btcPriceAtCreation = $derived(() => {
    if (contract && isNostrContractV2(contract.contract)) {
      return getBtcPriceAtCreation(contract.contract);
    }
    return null;
  });
</script>

<!-- In technical details section -->
{#if btcPriceAtCreation}
  <div class="flex justify-between">
    <span class="text-base-content/70">{$t('dashboard.contracts.btc_price_at_creation')}:</span>
    <span class="font-mono text-sm">${btcPriceAtCreation.toLocaleString('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}</span>
  </div>
{/if}
```

**Translation Keys Needed:**
- `dashboard.contracts.btc_price_at_creation`: "BTC Price at Creation"

**Benefits:**
- Transparency for users
- Useful for accounting and verification
- Helps explain USD value differences

**Complexity**: Low

### 7.3 Display Network and Environment Badges (Priority: Medium)

**Purpose**: Clearly show which blockchain network and environment the contract uses.

**Files to Modify:**
- `src/lib/components/contracts/ContractDrawer.svelte`
- `src/lib/components/contracts/ContractModal.svelte`
- `src/lib/components/contracts/ContractCard.svelte`

**Implementation:**

```svelte
<script>
  import { isNostrContractV2 } from '$lib/utils/wallet/contractResolver';
  
  const networkBadge = $derived(() => {
    if (contract && isNostrContractV2(contract.contract)) {
      const network = contract.contract.network;
      const env = contract.contract.environment;
      const badgeClass = network === 'RSK' ? 'badge-primary' : 'badge-secondary';
      const text = `${network} ${env === 'mainnet' ? 'Mainnet' : 'Testnet'}`;
      return { text, badgeClass };
    }
    return null;
  });
</script>

<!-- Near status badges -->
{#if networkBadge}
  <div class="badge {networkBadge.badgeClass} badge-sm">
    {networkBadge.text}
  </div>
{/if}
```

**Benefits:**
- Clear network identification
- Helps users understand which blockchain they're using
- Important for multi-network support

**Complexity**: Low

### 7.4 Display Contract Address (Priority: Low)

**Purpose**: Show the smart contract address for debugging, verification, and block explorer access.

**Files to Modify:**
- `src/lib/components/contracts/ContractDrawer.svelte` (technical details section)
- `src/lib/components/contracts/ContractModal.svelte` (technical details section)

**Implementation:**

```svelte
<script>
  import { isNostrContractV2 } from '$lib/utils/wallet/contractResolver';
  import { getBlockExplorerUrl } from '$lib/utils/wallet/blockExplorer';
  
  const contractAddress = $derived(() => {
    if (contract && isNostrContractV2(contract.contract)) {
      return contract.contract.contractAddress;
    }
    return null;
  });
  
  const explorerUrl = $derived(() => {
    if (contract && isNostrContractV2(contract.contract)) {
      return getBlockExplorerUrl(
        contract.contract.contractAddress,
        contract.contract.network,
        contract.contract.environment
      );
    }
    return null;
  });
  
  function copyAddress() {
    if (contractAddress) {
      navigator.clipboard.writeText(contractAddress);
      // Show toast notification
    }
  }
</script>

<!-- In technical details section -->
{#if contractAddress}
  <div>
    <div class="flex items-center justify-between mb-1">
      <span class="text-base-content/60">{$t('dashboard.contracts.contract_address')}:</span>
      <div class="flex gap-2">
        {#if explorerUrl}
          <a 
            href={explorerUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            class="btn btn-xs btn-ghost"
            aria-label={$t('dashboard.contracts.view_on_explorer')}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        {/if}
        <button 
          class="btn btn-xs btn-ghost"
          onclick={copyAddress}
          aria-label={$t('dashboard.contracts.copy_address')}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>
    </div>
    <div class="font-mono text-xs break-all bg-base-300 p-2 rounded">
      {contractAddress}
    </div>
  </div>
{/if}
```

**Helper Function Needed:**

```typescript
// src/lib/utils/wallet/blockExplorer.ts
export function getBlockExplorerUrl(
  address: string,
  network: 'RSK' | 'BSC',
  environment: 'mainnet' | 'testnet'
): string {
  if (network === 'RSK') {
    if (environment === 'mainnet') {
      return `https://explorer.rsk.co/address/${address}`;
    } else {
      return `https://explorer.testnet.rsk.co/address/${address}`;
    }
  } else if (network === 'BSC') {
    if (environment === 'mainnet') {
      return `https://bscscan.com/address/${address}`;
    } else {
      return `https://testnet.bscscan.com/address/${address}`;
    }
  }
  return '';
}
```

**Translation Keys Needed:**
- `dashboard.contracts.contract_address`: "Contract Address"
- `dashboard.contracts.view_on_explorer`: "View on Block Explorer"
- `dashboard.contracts.copy_address`: "Copy Address"

**Benefits:**
- Enables contract verification
- Easy access to block explorer
- Useful for debugging and support

**Complexity**: Medium (requires copy functionality and block explorer URL generation)

### 7.5 UI Testing Requirements

**Test Cases:**
- [ ] v1 contracts display correctly (no new fields shown)
- [ ] v2 contracts display new fields correctly
- [ ] Type guards work correctly (no runtime errors)
- [ ] Fallback behavior works (calculated USD when `totalPaymentUsd` unavailable)
- [ ] Network badges display correctly
- [ ] Contract address copy functionality works
- [ ] Block explorer links work correctly
- [ ] Responsive design maintained
- [ ] Accessibility requirements met (ARIA labels, keyboard navigation)

**Files to Test:**
- `ContractDrawer.svelte`
- `ContractModal.svelte`
- `ContractCard.svelte`
- `DashboardContractsPanel.svelte`

### 7.6 Implementation Priority

**Phase 7A: High Priority (Recommended)**
1. Display `totalPaymentUsd` when available
2. Display `btcPriceAtCreation` in technical details

**Phase 7B: Medium Priority (Nice to Have)**
3. Display network/environment badges
4. Display contract address with copy functionality

### 7.7 Notes

- **No breaking changes**: All UI enhancements backward compatible
- **Type guards required**: Always use `isNostrContractV2()` before accessing v2 fields
- **Graceful degradation**: v1 contracts should display normally without new fields
- **Translation support**: All new UI text must be translated (English and Spanish)
- **Accessibility**: All new interactive elements must have proper ARIA labels

## Notes

### Version Strategy
- **Version 1**: Legacy format, all new fields optional (backward compatible)
- **Version 2**: New format, all new fields required (type-safe, validated)
- **Future versions**: Easy to extend with discriminated unions

### Key Design Decisions
1. **Discriminated Unions**: Type-safe version handling
2. **Required Fields for v2**: Enforces data completeness for new contracts
3. **Optional for v1**: Maintains backward compatibility
4. **Type Guards**: Runtime version detection
5. **Validation**: Fail fast on invalid v2 contracts

### Benefits of This Approach
- ✅ **Type Safety**: TypeScript enforces required fields at compile time
- ✅ **Runtime Safety**: Validation catches errors early
- ✅ **Backward Compatible**: Old contracts continue working
- ✅ **Future Proof**: Easy to add v3, v4, etc.
- ✅ **Clear Intent**: Version field makes format explicit
- ✅ **No Breaking Changes**: Existing contracts unaffected

### Migration Notes
- Old contracts (v1) work indefinitely with fallback logic
- New contracts (v2) must include all required fields
- No need to migrate existing contracts
- Version detection is automatic via `contractFormatVersion` field

