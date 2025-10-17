/**
 * Boltz Reverse Swap Service (Lightning → rBTC)
 * Client-side implementation with Nostr storage
 * 
 * Features:
 * - Creates reverse submarine swaps from Lightning to Rootstock
 * - Stores swap data encrypted in Nostr events (NIP-44)
 * - Real-time WebSocket monitoring
 * - Automatic claim handling
 * - Recovery from Nostr on app restart
 * 
 * ⚠️ CRITICAL: Understanding Reverse Swap Flow
 * ============================================
 * 
 * In a reverse swap (Lightning → On-chain):
 * 
 * 1. **WE generate the preimage** (random 32 bytes)
 * 2. **WE create the preimage hash** (SHA256 of preimage)
 * 3. **Boltz creates a HOLD/HODL invoice** using our hash
 * 4. **User pays the Lightning invoice** (payment is HELD, not settled yet)
 * 5. **Boltz locks RBTC on-chain** using the same hash (in EtherSwap contract)
 * 6. **WE claim the RBTC** by calling the contract's claim() function with our preimage
 * 7. **Boltz sees our preimage** on-chain and can now settle the Lightning invoice
 * 8. **Invoice is settled** - swap complete!
 * 
 * The key insight: The invoice CANNOT be settled until we reveal the preimage by claiming the RBTC.
 * This is what makes it atomic and trustless - neither party can cheat.
 * 
 * States we'll see:
 * - swap.created: Swap created, invoice ready to pay
 * - invoice.set: Invoice paid and held (waiting for our claim)
 * - transaction.mempool: Boltz's lockup tx in mempool (we can claim now!)
 * - transaction.confirmed: Lockup confirmed (safer to claim)
 * - transaction.claim.pending: Our claim tx submitted
 * - invoice.settled: Boltz settled invoice after seeing our preimage ✅
 */

import type { SwapEvent } from './types';
import { crypto } from 'bitcoinjs-lib';
import { randomBytes } from 'crypto';
import { BoltzClient } from './client';
import { boltzWebSocket } from './websocket';
import { Contract, Interface, keccak256, solidityPacked } from 'ethers';
import { getPublicKey, finalizeEvent, type NostrEvent } from 'nostr-tools';
import nip44 from '$lib/nostr/nip44';
import nostrEventsService from '$lib/api/services/nostr/events';

// Swap data structure for Nostr storage
export interface BoltzSwapData {
	id: string;
	preimage: string; // Will be encrypted
	preimageHash: string;
	invoice: string;
	amount: number;
	rbtcAddress: string;
	status: string;
	lockupTxHash?: string;
	claimTxHash?: string;
	onchainAmount?: number;
	refundAddress?: string;
	timeoutBlockHeight?: number;
	createdAt: number;
	updatedAt: number;
	expiresAt?: number;
}

// EtherSwap ABI - Based on actual Boltz EtherSwap.sol contract
// Reference: https://github.com/BoltzExchange/boltz-core/blob/master/contracts/EtherSwap.sol
// 
// IMPORTANT NOTES:
// 1. The claim function takes the PREIMAGE (not the hash) and uses msg.sender as claimAddress
// 2. The swaps mapping returns bool (not a struct) and is indexed by keccak256 hash of all parameters
// 3. We don't need to query - just call claim() directly and it will revert if swap doesn't exist
const ETHER_SWAP_ABI = [
	// Main claim function - auto-uses msg.sender as claimAddress
	'function claim(bytes32 preimage, uint256 amount, address refundAddress, uint256 timelock) external',
	
	// Query function - returns bool indicating if swap exists (indexed by hashValues result)
	'function swaps(bytes32) view returns (bool)',
	
	// Hash computation helper - combines all parameters into single hash
	'function hashValues(bytes32 preimageHash, uint256 amount, address claimAddress, address refundAddress, uint256 timelock) public pure returns (bytes32)',
	
	// Events
	'event Lockup(bytes32 indexed preimageHash, uint256 amount, address claimAddress, address indexed refundAddress, uint256 timelock)',
	'event Claim(bytes32 indexed preimageHash, bytes32 preimage)'
];

// Conversion factor: 1 sat = 10^10 wei on RSK
const SATOSHI_TO_WEI = 10n ** 10n;

export class ReverseSwapService {
	private boltzClient: BoltzClient;
	private activeSwaps: Map<string, BoltzSwapData> = new Map();
	private network: 'mainnet' | 'testnet';
	private walletGetter: (() => any) | null = null;

	constructor(network: 'mainnet' | 'testnet' = 'testnet') {
		this.network = network;
		const apiUrl =
			network === 'mainnet' ? 'https://api.boltz.exchange' : 'http://localhost:9001';
		this.boltzClient = new BoltzClient({ apiUrl, network });
	}

	/**
	 * Set the wallet getter function
	 * This should be called before creating swaps to enable automatic claiming
	 */
	setWalletGetter(getter: () => any): void {
		this.walletGetter = getter;
	}

	/**
	 * Create a reverse swap (Lightning → rBTC)
	 */
	async createReverseSwap(params: {
		amountSats: number;
		rbtcAddress: string;
		description?: string;
		nsec: string; // User's private key for encryption
	}): Promise<{ swapId: string; invoice: string; swapData: BoltzSwapData }> {
		// Generate preimage and hash
		const preimage = randomBytes(32);
		const preimageHash = crypto.sha256(preimage).toString('hex');

		// For EVM chains like RBTC, we use the REST API directly since the client
		// method expects claimPublicKey but EVM swaps use claimAddress
		const apiUrl = this.boltzClient['config'].apiUrl;
		const response = await fetch(`${apiUrl}/v2/swap/reverse`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				from: 'BTC',
				to: 'RBTC',
				invoiceAmount: params.amountSats,
				preimageHash,
				claimAddress: params.rbtcAddress
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to create reverse swap: ${response.status} ${errorText}`);
		}

		const swapResponse = await response.json();

		// Prepare swap data
		const swapData: BoltzSwapData = {
			id: swapResponse.id,
			preimage: preimage.toString('hex'),
			preimageHash,
			invoice: swapResponse.invoice,
			amount: params.amountSats,
			rbtcAddress: params.rbtcAddress,
			status: 'swap.created',
			onchainAmount: swapResponse.onchainAmount,
			refundAddress: swapResponse.refundAddress,
			timeoutBlockHeight: swapResponse.timeoutBlockHeight,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
		};

		// Store in memory
		this.activeSwaps.set(swapResponse.id, swapData);

		// Save to Nostr (encrypted)
		await this.saveSwapToNostr(swapData, params.nsec);

		// Subscribe to WebSocket updates
		boltzWebSocket.subscribeToSwap(swapResponse.id, async (event) => {
			await this.handleSwapUpdate(event, params.nsec);
		});

		return {
			swapId: swapResponse.id,
			invoice: swapResponse.invoice,
			swapData
		};
	}

	/**
	 * Handle swap status updates from WebSocket
	 */
	private async handleSwapUpdate(event: SwapEvent, nsec: string): Promise<void> {
		const swapData = this.activeSwaps.get(event.swapId);
		if (!swapData) return;

		// Update swap data
		swapData.status = event.status;
		swapData.updatedAt = Date.now();

		if (event.transaction) {
			console.log('📝 Transaction update:', event.transaction);
			swapData.lockupTxHash = event.transaction.id;
		}

		// Handle different states
		switch (event.status) {
			case 'invoice.set':
				// Invoice has been paid and is on hold - waiting for our claim
				console.log('⚡ Invoice paid and held, waiting for RBTC claim...');
				swapData.status = 'invoice.set';
				break;

			case 'transaction.mempool':
				// Boltz's lockup transaction is in mempool (after invoice was paid)
				// ⚠️ IMPORTANT: We should NOT attempt to claim yet because the lockup
				// transaction hasn't been mined. The contract doesn't have the swap data yet.
				console.log('🔒 Lockup transaction in mempool, waiting for confirmation...');
				console.log('⏳ Swap will be ready to claim once the lockup transaction is confirmed');
				swapData.status = 'transaction.mempool';
				break;

			case 'transaction.confirmed':
			// Boltz has confirmed the lockup transaction - NOW we can claim!
			console.log('✅ Lockup confirmed! Attempting to claim rBTC...');
			console.log('📋 Swap parameters:', {
				id: swapData.id,
				amount: swapData.onchainAmount,
				claimAddress: swapData.rbtcAddress,
				refundAddress: swapData.refundAddress,
				timelock: swapData.timeoutBlockHeight
			});
			
				try {
					const wallet = this.walletGetter?.();
					if (!wallet) {
					console.warn('⚠️ Wallet not available for auto-claiming. User must claim manually.');
						swapData.status = 'transaction.confirmed'; // Keep this status for manual claim
					} else {
						await this.claimRBTC(swapData, nsec, wallet);
					}
				} catch (error) {
					console.error('❌ Auto-claim failed:', error);
					// Don't throw - user can manually claim later
				swapData.status = 'transaction.confirmed'; // Keep ready for manual retry
				}
				break;

			case 'invoice.settled':
				// Success! Boltz settled the invoice after seeing our preimage
				console.log('✅ Swap successful - Invoice settled by Boltz:', swapData.id);
				break;

			case 'invoice.expired':
			case 'swap.expired':
			case 'transaction.failed':
				console.error('❌ Swap failed:', swapData.id, event.status);
				break;
		}

		// Update Nostr storage
		await this.saveSwapToNostr(swapData, nsec);
	}

	/**
	 * Get actual lockup parameters from the Lockup event in the blockchain transaction
	 * This is CRITICAL because the Boltz API response may have different values than what's actually locked
	 * 
	 * The Lockup event contains the EXACT parameters that were used:
	 * event Lockup(bytes32 indexed preimageHash, uint256 amount, address claimAddress, address indexed refundAddress, uint256 timelock)
	 */
	private async getLockupEventParameters(
		contractAddress: string,
		preimageHash: string,
		lockupTxHash: string,
		provider: any
	): Promise<{
		amount: bigint;
		claimAddress: string;
		refundAddress: string;
		timelock: number;
	} | null> {
		try {
			console.log('🔍 Fetching lockup transaction receipt:', lockupTxHash);
			
			// Wait for the transaction receipt with retry logic
			// The RPC node might need a few moments to index the transaction
			let receipt = null;
			const maxRetries = 10;
			const retryDelay = 2000; // 2 seconds
			
			for (let i = 0; i < maxRetries; i++) {
				receipt = await provider.getTransactionReceipt(lockupTxHash);
				
				if (receipt) {
					console.log('✅ Receipt found after', i + 1, 'attempt(s)');
					break;
				}
				
				if (i < maxRetries - 1) {
					console.log(`⏳ Receipt not available yet, waiting ${retryDelay}ms... (attempt ${i + 1}/${maxRetries})`);
					await new Promise(resolve => setTimeout(resolve, retryDelay));
				}
			}
			
			if (!receipt) {
				console.error('❌ Transaction receipt not found after', maxRetries, 'attempts');
				return null;
			}

			console.log('📋 Receipt found with', receipt.logs.length, 'logs');

			// Create contract interface to parse events
			const iface = new Interface(ETHER_SWAP_ABI);

			// The preimageHash should be 0x-prefixed for comparison
			const preimageHashWithPrefix = preimageHash.startsWith('0x') ? preimageHash : '0x' + preimageHash;

			// Find the Lockup event in the logs
			for (const log of receipt.logs) {
				// Check if this log is from our contract
				if (log.address.toLowerCase() !== contractAddress.toLowerCase()) {
					continue;
				}

				try {
					const parsed = iface.parseLog({
						topics: [...log.topics],
						data: log.data
					});

					console.log('📝 Parsed event:', parsed?.name, 'with args:', parsed?.args);

					if (parsed?.name === 'Lockup') {
						// Event structure: Lockup(bytes32 indexed preimageHash, uint256 amount, address claimAddress, address indexed refundAddress, uint256 timelock)
						const eventPreimageHash = parsed.args[0];
						const eventAmount = parsed.args[1];
						const eventClaimAddress = parsed.args[2];
						const eventRefundAddress = parsed.args[3];
						const eventTimelock = parsed.args[4];

						console.log('🔍 Checking Lockup event:', {
							eventPreimageHash,
							expectedPreimageHash: preimageHashWithPrefix,
							matches: eventPreimageHash.toLowerCase() === preimageHashWithPrefix.toLowerCase()
						});

						// Check if this is the event for our swap
						if (eventPreimageHash.toLowerCase() === preimageHashWithPrefix.toLowerCase()) {
							console.log('✅ Found matching Lockup event!');
							return {
								amount: eventAmount,
								claimAddress: eventClaimAddress,
								refundAddress: eventRefundAddress,
								timelock: Number(eventTimelock)
							};
						}
					}
				} catch (e) {
					// Not a Lockup event or failed to parse, continue
					console.log('⚠️ Failed to parse log:', e);
				}
			}

			console.warn('⚠️ No matching Lockup event found in transaction');
			return null;
		} catch (error) {
			console.error('❌ Failed to get lockup event parameters:', error);
			return null;
		}
	}

	/**
	 * Claim rBTC from EtherSwap contract
	 * 
	 * IMPORTANT: EtherSwap contract structure (from EtherSwap.sol):
	 * - Contract uses keccak256 hash of ALL parameters to index swaps
	 * - The claim() function auto-uses msg.sender as claimAddress
	 * - We don't need to query the contract - just call claim() directly
	 * - If swap doesn't exist or already claimed, the contract will revert
	 * 
	 * This method is called when swap reaches 'transaction.confirmed' status
	 */
	async claimRBTC(
		swapData: BoltzSwapData,
		nsec: string,
		walletSigner?: any
	): Promise<{ txHash: string }> {
		try {
			if (!walletSigner) {
				throw new Error('RSK wallet not connected. Please connect your wallet to claim funds.');
			}

			// Validate required swap data
			if (!swapData.preimage || !swapData.onchainAmount || !swapData.refundAddress || !swapData.timeoutBlockHeight) {
				throw new Error('Missing required swap data for claiming. Data: ' + JSON.stringify({
					hasPreimage: !!swapData.preimage,
					onchainAmount: swapData.onchainAmount,
					refundAddress: swapData.refundAddress,
					timeoutBlockHeight: swapData.timeoutBlockHeight
				}));
			}

			// Get EtherSwap contract address from Boltz API
			console.log('📡 Fetching EtherSwap contract address from Boltz API...');
			const contractsResponse = await fetch(
				`${this.boltzClient['config'].apiUrl}/v2/chain/RBTC/contracts`
			);

			if (!contractsResponse.ok) {
				throw new Error(`Failed to fetch contract addresses: ${contractsResponse.statusText}`);
			}

			const contracts = await contractsResponse.json();
			console.log('📋 Boltz contracts response:', contracts);
			
			const etherSwapAddress = contracts.swapContracts?.EtherSwap;

			if (!etherSwapAddress) {
				throw new Error('EtherSwap contract address not found in Boltz response');
			}

			console.log('📍 Using EtherSwap contract:', etherSwapAddress);

			// Create contract instance with the user's wallet signer
			const etherSwapContract = new Contract(etherSwapAddress, ETHER_SWAP_ABI, walletSigner);

			// CRITICAL: Get the ACTUAL parameters from the Lockup event
			// The API response may have different values than what was actually locked
			let amountWei: bigint;
			let refundAddress: string;
			let timelock: number;

			if (swapData.lockupTxHash) {
				console.log('📡 Fetching actual lockup parameters from contract event...');
				const eventParams = await this.getLockupEventParameters(
					etherSwapAddress,
					swapData.preimageHash,
					swapData.lockupTxHash,
					walletSigner.provider
				);

				if (eventParams) {
					console.log('✅ Got actual parameters from Lockup event:', {
						amount: eventParams.amount.toString() + ' wei',
						claimAddress: eventParams.claimAddress,
						refundAddress: eventParams.refundAddress,
						timelock: eventParams.timelock
					});

					// Use event parameters (the REAL values)
					amountWei = eventParams.amount;
					refundAddress = eventParams.refundAddress;
					timelock = eventParams.timelock;

					console.log('✅ Using event parameters for claim');
				} else {
					console.warn('⚠️ Could not fetch Lockup event, using API response values (may fail)');
					// Fall back to API response
					amountWei = BigInt(swapData.onchainAmount) * SATOSHI_TO_WEI;
					refundAddress = swapData.refundAddress!;
					timelock = swapData.timeoutBlockHeight!;
				}
			} else {
				console.warn('⚠️ No lockup TX hash available, using API response values (may fail)');
				// Fall back to API response
				amountWei = BigInt(swapData.onchainAmount) * SATOSHI_TO_WEI;
				refundAddress = swapData.refundAddress!;
				timelock = swapData.timeoutBlockHeight!;
			}

			// Prepare claim parameters
			const preimageBytes32 = '0x' + swapData.preimage;

			console.log('🎯 Claiming with parameters:', {
				preimage: preimageBytes32.slice(0, 20) + '...',
				amount: `${amountWei.toString()} wei (${Number(amountWei / SATOSHI_TO_WEI)} sats)`,
				refundAddress: refundAddress,
				timelock: timelock,
				claimAddress: swapData.rbtcAddress + ' (auto from msg.sender)'
			});

			// Call claim function directly
			// The EtherSwap contract will:
			// 1. Hash the preimage with SHA256
			// 2. Compute swap hash using hashValues(preimageHash, amount, msg.sender, refundAddress, timelock)
			// 3. Check if swap exists and is locked
			// 4. Transfer funds to msg.sender (our wallet)
			console.log('🚀 Calling EtherSwap.claim()...');
			const tx = await etherSwapContract.claim(
				preimageBytes32,
				amountWei,
				refundAddress,
				timelock
			);

			console.log('✅ Claim transaction sent:', tx.hash);
			console.log('⏳ Waiting for transaction confirmation...');

			// Update swap data with claim transaction hash
			swapData.claimTxHash = tx.hash;
			swapData.status = 'transaction.claim.pending';
			swapData.updatedAt = Date.now();
			await this.saveSwapToNostr(swapData, nsec);

			// Wait for transaction confirmation
			const receipt = await tx.wait();
			console.log('✅ Claim transaction confirmed!');
			console.log('📋 Receipt:', {
				transactionHash: receipt.hash,
				blockNumber: receipt.blockNumber,
				gasUsed: receipt.gasUsed?.toString(),
				status: receipt.status
			});

			// Update status to settled
			swapData.status = 'claimed';
			swapData.updatedAt = Date.now();
			await this.saveSwapToNostr(swapData, nsec);

			console.log('🎉 Successfully claimed', swapData.onchainAmount, 'sats of rBTC!');

			return { txHash: tx.hash };
		} catch (error) {
			console.error('❌ Failed to claim rBTC:', error);
			
			// Provide helpful error messages
			if (error instanceof Error) {
				if (error.message.includes('swap has no Ether locked')) {
					console.error('💡 Swap not found in contract. Possible reasons:');
					console.error('   1. Lockup transaction not yet confirmed');
					console.error('   2. Wrong parameters (amount, addresses, or timelock)');
					console.error('   3. Swap already claimed');
					console.error('📊 Swap data:', {
						id: swapData.id,
						amount: swapData.onchainAmount,
						claimAddress: swapData.rbtcAddress,
						refundAddress: swapData.refundAddress,
						timelock: swapData.timeoutBlockHeight,
						lockupTx: swapData.lockupTxHash
					});
				}
			}
			
			// Update swap status to show claim failed
			swapData.status = 'transaction.claim.failed';
			swapData.updatedAt = Date.now();
			await this.saveSwapToNostr(swapData, nsec);

			throw error;
		}
	}

	/**
	 * Save swap data to Nostr (encrypted)
	 */
	private async saveSwapToNostr(swapData: BoltzSwapData, nsec: string): Promise<void> {
		try {
			// Convert hex nsec to Uint8Array if needed
			const nsecBytes = typeof nsec === 'string' && nsec.length === 64 
				? new Uint8Array(Buffer.from(nsec, 'hex'))
				: nsec;
			
			const npub = getPublicKey(nsecBytes as any);

			// Encrypt sensitive data (preimage)
			const conversationKey = await nip44.getConversationKey(nsecBytes as any, npub);
			const nonce = randomBytes(32);
			const encryptedPreimage = await nip44.encrypt(swapData.preimage, conversationKey, nonce);

			// Prepare Nostr event
			const eventTemplate: Partial<NostrEvent> = {
				kind: 30078, // Parameterized replaceable event
				created_at: Math.floor(Date.now() / 1000),
				tags: [
					['d', swapData.id], // Unique identifier
					['a', swapData.amount.toString()], // Amount
					['s', swapData.status], // Status
					['r', swapData.rbtcAddress], // rBTC address
					['t', 'boltz-swap'] // Tag for filtering
				],
				content: JSON.stringify({
					id: swapData.id,
					preimage: encryptedPreimage, // Encrypted
					preimageHash: swapData.preimageHash,
					invoice: swapData.invoice,
					amount: swapData.amount,
					rbtcAddress: swapData.rbtcAddress,
					status: swapData.status,
					lockupTxHash: swapData.lockupTxHash,
					claimTxHash: swapData.claimTxHash,
					onchainAmount: swapData.onchainAmount,
					refundAddress: swapData.refundAddress,
					timeoutBlockHeight: swapData.timeoutBlockHeight,
					createdAt: swapData.createdAt,
					updatedAt: swapData.updatedAt,
					expiresAt: swapData.expiresAt
				})
			};

			// Sign and publish
			const signedEvent = finalizeEvent(eventTemplate as any, nsecBytes as any);
			await nostrEventsService.publishEvent(signedEvent as any);
		} catch (error) {
			console.error('Failed to save swap to Nostr:', error);
			// Don't throw - swap can still work even if Nostr storage fails
		}
	}

	/**
	 * Recover pending swaps from Nostr on app startup
	 */
	async recoverPendingSwaps(nsec: string): Promise<BoltzSwapData[]> {
		try {
			// Convert hex nsec to Uint8Array if needed
			const nsecBytes = typeof nsec === 'string' && nsec.length === 64 
				? new Uint8Array(Buffer.from(nsec, 'hex'))
				: nsec;
			
			const npub = getPublicKey(nsecBytes as any);

			// Query Nostr for user's swap events
			const response = await nostrEventsService.requestEvents({
				filters: [
					{
						authors: [npub],
						kinds: [30078],
						'#t': ['boltz-swap']
					}
				]
			});

			const conversationKey = await nip44.getConversationKey(nsecBytes as any, npub);
			const pendingSwaps: BoltzSwapData[] = [];

			for (const event of response.data || []) {
				try {
					const data = JSON.parse(event.content);

					// Decrypt preimage
					data.preimage = await nip44.decrypt(data.preimage, conversationKey);

					// Check if swap is still pending
					const finalStates = ['invoice.settled', 'swap.expired', 'transaction.failed'];
					if (!finalStates.includes(data.status)) {
						pendingSwaps.push(data);
						this.activeSwaps.set(data.id, data);

						// Resubscribe to WebSocket
						boltzWebSocket.subscribeToSwap(data.id, async (event) => {
							await this.handleSwapUpdate(event, nsec);
						});
					}
				} catch (err) {
					console.error('Failed to process swap event:', err);
				}
			}

			return pendingSwaps;
		} catch (error) {
			console.error('Failed to recover swaps from Nostr:', error);
			return [];
		}
	}

	/**
	 * Get swap by ID
	 */
	getSwap(swapId: string): BoltzSwapData | undefined {
		return this.activeSwaps.get(swapId);
	}

	/**
	 * Get all active swaps
	 */
	getAllSwaps(): BoltzSwapData[] {
		return Array.from(this.activeSwaps.values());
	}

	/**
	 * Check swap status from Boltz API
	 */
	async checkSwapStatus(swapId: string): Promise<string> {
		const status = await this.boltzClient.getSwapStatus(swapId, true); // true = reverse swap
		return status.status;
	}
}

// Export singleton instance
export const reverseSwapService = new ReverseSwapService(
	(import.meta.env.VITE_RSK_NETWORK as 'mainnet' | 'testnet') || 'testnet'
);

