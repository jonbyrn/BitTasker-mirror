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
import { Contract, keccak256, solidityPacked } from 'ethers';
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

// EtherSwap ABI - claim function and query function for Rootstock
// Based on Boltz's EtherSwap contract structure
// IMPORTANT: The claim function takes the PREIMAGE (not the hash)
// The contract will hash it internally and use that to look up the swap
const ETHER_SWAP_ABI = [
	'function claim(bytes32 preimage, uint256 amount, address refundAddress, uint256 timeoutBlockHeight) external',
	'function swaps(bytes32) view returns (address refundAddress, uint256 amount, address claimAddress, uint256 timeoutBlockHeight)'
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
				// Boltz has confirmed the lockup transaction
				console.log('🔒 Lockup confirmed, attempting to claim rBTC...');
				try {
					const wallet = this.walletGetter?.();
					if (!wallet) {
						console.error('❌ Wallet not available for claiming. User must claim manually.');
						swapData.status = 'transaction.confirmed'; // Keep this status for manual claim
					} else {
						await this.claimRBTC(swapData, nsec, wallet);
					}
				} catch (error) {
					console.error('❌ Auto-claim failed:', error);
					// Don't throw - user can manually claim later
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
	 * Claim rBTC from EtherSwap contract
	 * This method is called internally when the swap reaches transaction.confirmed status
	 * It requires the user's RSK wallet to be connected
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

			// Get EtherSwap contract address from Boltz API
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

			// Validate swap data
			if (!swapData.preimage || !swapData.onchainAmount || !swapData.refundAddress || !swapData.timeoutBlockHeight) {
				throw new Error('Missing required swap data for claiming');
			}

			// Convert preimage to bytes32 format (0x prefix + hex)
			const preimageBytes32 = '0x' + swapData.preimage;

			// Convert satoshis to wei (1 sat = 10^10 wei on RSK)
			const amountWei = BigInt(swapData.onchainAmount) * SATOSHI_TO_WEI;

			// For EtherSwap, Boltz uses the preimage hash as the key in the swaps mapping
			// The contract stores swaps using: swaps[preimageHash] = SwapData(...)
			const preimageHashBytes32 = '0x' + swapData.preimageHash;
			
			console.log('🔍 Attempting to query swap from contract...');
			console.log('📋 Swap lookup parameters:', {
				preimageHash: preimageHashBytes32,
				amount: amountWei.toString(),
				claimAddress: swapData.rbtcAddress,
				refundAddress: swapData.refundAddress,
				timeoutBlockHeight: swapData.timeoutBlockHeight,
				lockupTxHash: swapData.lockupTxHash
			});
			
			// Query the swap details from the contract using the preimage hash
			// The swaps mapping uses: mapping(bytes32 => Swap) public swaps;
			// where the key is the preimage hash (SHA256 of the preimage)
			try {
				// Add a small delay to ensure the lockup transaction has been processed
				console.log('⏳ Waiting 2 seconds for lockup transaction to be fully processed...');
				await new Promise(resolve => setTimeout(resolve, 2000));
				
				console.log('🔍 Querying contract with preimage hash:', preimageHashBytes32);
				const swapDetails = await etherSwapContract.swaps(preimageHashBytes32);
				console.log('📋 Raw swap details from contract:', swapDetails);
				console.log('📋 Parsed swap details:', {
					refundAddress: swapDetails[0],
					amount: swapDetails[1]?.toString(),
					claimAddress: swapDetails[2],
					timeoutBlockHeight: swapDetails[3]?.toString()
				});
				
				// Check if swap exists - amount > 0 means the swap is locked
				if (!swapDetails[1] || swapDetails[1].toString() === '0') {
					console.warn('⚠️ Swap not found in contract or not yet locked');
					console.warn('💡 Possible reasons:');
					console.warn('   1. Lockup transaction still being mined (wait a bit longer)');
					console.warn('   2. Wrong preimage hash (check swap creation)');
					console.warn('   3. Wrong contract address');
					console.warn('📊 Debug info:', {
						swapId: swapData.id,
						preimageHash: preimageHashBytes32,
						lockupTxHash: swapData.lockupTxHash,
						contractAddress: etherSwapAddress
					});
					throw new Error(
						`Swap not found in EtherSwap contract (amount is 0 or undefined). ` +
						`The lockup transaction may still be processing. Please wait a moment and try again.`
					);
				}
				
				// Validate swap parameters match what we expect
				const contractAmount = swapDetails[1];
				const contractClaimAddress = swapDetails[2];
				const contractRefundAddress = swapDetails[0];
				const contractTimeout = swapDetails[3];
				
				console.log('🔍 Validating swap parameters...');
				console.log('Expected claim address:', swapData.rbtcAddress);
				console.log('Contract claim address:', contractClaimAddress);
				
				// Check if claim address matches (case-insensitive)
				if (contractClaimAddress.toLowerCase() !== swapData.rbtcAddress.toLowerCase()) {
					throw new Error(
						`Claim address mismatch! ` +
						`Expected: ${swapData.rbtcAddress}, ` +
						`Contract has: ${contractClaimAddress}`
					);
				}
				
				console.log('✅ Swap found in contract and parameters validated');
				console.log('✅ Ready to claim', amountWei.toString(), 'wei (', swapData.onchainAmount, 'sats)');
			} catch (queryError) {
				console.error('❌ Failed to query swap from contract:', queryError);
				
				// If it's our custom error, rethrow it
				if (queryError instanceof Error && queryError.message.includes('Swap not found in EtherSwap contract')) {
					throw queryError;
				}
				
				// Check if it's a contract call error
				if (queryError instanceof Error && queryError.message.includes('execution reverted')) {
					throw new Error(
						`Contract query failed: The swap doesn't exist in the contract yet. ` +
						`This usually means the lockup transaction is still being processed. ` +
						`Wait a few more seconds and try again. ` +
						`Lockup TX: ${swapData.lockupTxHash || 'unknown'}`
					);
				}
				
				// Otherwise, wrap it with more context
				throw new Error(
					`Cannot query swap from contract: ${queryError instanceof Error ? queryError.message : 'Unknown error'}. ` +
					`This might indicate the lockup transaction hasn't been processed yet.`
				);
			}

			console.log('🎯 Calling contract claim function with params:', {
				preimage: preimageBytes32,
				amount: amountWei.toString(),
				refundAddress: swapData.refundAddress,
				timeoutBlockHeight: swapData.timeoutBlockHeight
			});

			// Call the claim function on the EtherSwap contract
			// The function signature is: claim(bytes32 preimage, uint256 amount, address refundAddress, uint256 timeoutBlockHeight)
			const tx = await etherSwapContract.claim(
				preimageBytes32,
				amountWei,
				swapData.refundAddress,
				swapData.timeoutBlockHeight
			);

			console.log('Claim transaction sent:', tx.hash);

			// Update swap data with claim transaction hash
			swapData.claimTxHash = tx.hash;
			swapData.status = 'transaction.claim.pending';
			swapData.updatedAt = Date.now();

			// Save updated swap data to Nostr
			await this.saveSwapToNostr(swapData, nsec);

			// Wait for transaction confirmation (optional - can be done in background)
			const receipt = await tx.wait();
			console.log('Claim transaction confirmed:', receipt.hash);

			// Update status to settled
			swapData.status = 'invoice.settled';
			swapData.updatedAt = Date.now();
			await this.saveSwapToNostr(swapData, nsec);

			return { txHash: tx.hash };
		} catch (error) {
			console.error('Failed to claim rBTC:', error);
			
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

