<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { Buffer } from 'buffer';
	import { getPublicKey } from 'nostr-tools';
	import { NDKRelaySet } from '@nostr-dev-kit/ndk';
	import { createDebug } from '$lib/utils/debug';
	import { boltzProvider } from '$lib/services/BoltzProvider';
	import {
		scanUnclaimedLockups,
		refundLockupDirect,
		loadClaimDataFromNostr,
		type UnclaimedLockup
	} from '$lib/services/swap-chain.service';
	import { claimTbtcOnArbitrum, claimRbtcOnRsk } from '$lib/services/swap-chain/boltz/claims';
	import { TBTC_ARB, ETHERSWAP_ADDRESS, BLOCKSCOUT_API_BASE, LOCKUP_TOPIC, CLAIM_TOPIC } from '$lib/services/swap-chain/utils';
	import { encodeEtherSwapRefund } from '$lib/services/swap-chain/abi';
	import { getNostrKeyPair } from '$lib/utils/nostrKeys';
	import { getRSKAddress, walletManager, sendRawTransaction } from '$lib/stores/wallet.store';
	import { ndk } from '$lib/nostr/ndk';
	import { applyNdkSignerFromNsec } from '$lib/nostr/ndkSigner';
	import nip44 from '$lib/nostr/nip44';
	import KINDS from '$lib/utils/constants/kinds';
	import { resolveExplicitRelayUrls } from '$lib/utils/relayUrls';
	import { NOSTR_FINAL_STATES } from '$lib/utils/wallet/swapStatusMap';

	const d = createDebug('debug-swaps');
	const RELAYS = resolveExplicitRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL);
	const SWAP_TYPES = ['boltz-swap-chain', 'bittasker-swap-chain', 'boltz-swap-reverse', 'boltz-swap-submarine'] as const;

	// ── Swap row ──────────────────────────────────────────────────────
	interface SwapRow {
		swapId: string;
		swapType: string;
		nostrStatus: string;
		preimage: string;
		createdAt: number; // milliseconds (from Nostr event created_at * 1000)
		fromAsset: string;
		toAsset: string;
		fromAmount: number;
		toAmount: number;
		lockupTxHash: string;
		claimTxHash: string;
		claimDetails: { lockupAddress: string; amount: number; refundAddress: string; timeoutBlockHeight: number } | null;
		lockupClaimAddress: string;
		refundAddress: string;
		boltzStatus: string;
		boltzChecked: boolean;
		boltzClaimDetails: { lockupAddress: string; amount: number; refundAddress: string; timeoutBlockHeight: number } | null;
		boltzTransactionId: string;
		recovering: boolean;
		recoverResult: { ok: boolean; msg: string; txHash?: string } | null;
	}

	// ── State ─────────────────────────────────────────────────────────
	let rskAddress = $state('');
	let walletReady = $state(false);
	let initError = $state('');
	let swaps = $state<SwapRow[]>([]);
	let loading = $state(false);
	let loadError = $state('');
	let showAdvanced = $state(false);
	let lockups = $state<UnclaimedLockup[]>([]);
	let scanning = $state(false);
	let refundingTxHash = $state<string | null>(null);
	let refundResults = $state<Record<string, { ok: boolean; msg: string }>>({});

	interface LogEntry { time: string; level: 'info' | 'success' | 'error' | 'warn'; msg: string }
	let logs = $state<LogEntry[]>([]);

	function log(level: LogEntry['level'], msg: string) {
		logs = [{ time: new Date().toLocaleTimeString(), level, msg }, ...logs].slice(0, 200);
		if (level === 'error') d.error(msg); else d.log('[%s] %s', level, msg);
	}

	// ── Init ──────────────────────────────────────────────────────────
	onMount(async () => {
		try {
			await walletManager.initialize();
			rskAddress = await getRSKAddress();
			walletReady = true;
			log('success', `Wallet ready — RSK: ${rskAddress}`);
			await loadSwaps();
		} catch (err) {
			initError = (err as Error).message;
			log('error', `Wallet init failed: ${initError}`);
		}
	});

	// ── Fetch swaps directly from NDK ─────────────────────────────────
	async function loadSwaps() {
		loading = true;
		loadError = '';
		log('info', 'Fetching swaps from Nostr via NDK...');

		try {
			const { nsec } = await getNostrKeyPair();
			await applyNdkSignerFromNsec(nsec);
			const npub = getPublicKey(nsec);
			const nsecHex = Buffer.from(nsec).toString('hex');
			const conversationKey = await nip44.getConversationKey(nsecHex, npub);
			const relaySet = NDKRelaySet.fromRelayUrls(RELAYS, ndk);

			// Fetch all swap events from all types
			let allEvents: Array<{ swapId: string; swapType: string; content: Record<string, unknown>; createdAtSec: number }> = [];

			for (const swapType of SWAP_TYPES) {
				log('info', `  Fetching ${swapType}...`);
				try {
					const events = await ndk.fetchEvents(
						{ authors: [npub], kinds: [KINDS.PENDING_SWAPS], '#t': [swapType] },
						{ closeOnEose: true },
						relaySet
					);

					// Deduplicate by swapId, keep latest by created_at
					const latestById = new SvelteMap<string, { swapId: string; swapType: string; content: Record<string, unknown>; createdAtSec: number }>();
					for (const event of events) {
						const swapId = event.tagValue('d');
						if (!swapId) continue;
						const existing = latestById.get(swapId);
						const eventTs = event.created_at ?? 0;
						if (!existing || eventTs > existing.createdAtSec) {
							try {
								if (!event.content || typeof event.content !== 'string') continue;
								const decrypted = await nip44.decrypt(event.content, conversationKey);
								const data = JSON.parse(decrypted) as Record<string, unknown>;
								if (!NOSTR_FINAL_STATES.includes((data.status as string) ?? '')) {
									latestById.set(swapId, { swapId, swapType, content: data, createdAtSec: eventTs });
								}
							} catch {
								// skip undecryptable
							}
						}
					}
					allEvents = [...allEvents, ...latestById.values()];
					log('info', `    → ${latestById.size} swap(s)`);
				} catch (err) {
					log('warn', `    Failed: ${(err as Error).message}`);
				}
			}

			log('info', `Found ${allEvents.length} pending swap(s)`);

			// Sort by Nostr created_at (seconds) descending — newest first
			allEvents.sort((a, b) => b.createdAtSec - a.createdAtSec);

			// Build rows
			const rows: SwapRow[] = allEvents.map((ev) => {
				const s = ev.content;
				return {
					swapId: ev.swapId,
					swapType: (s.type as string) ?? ev.swapType,
					nostrStatus: (s.status as string) ?? '?',
					preimage: (s.preimage as string) ?? '',
					createdAt: ev.createdAtSec * 1000, // convert to ms for display
					fromAsset: (s.fromAsset as string) ?? '',
					toAsset: (s.toAsset as string) ?? '',
					fromAmount: (s.fromAmount as number) ?? (s.amount as number) ?? 0,
					toAmount: (s.toAmount as number) ?? (s.onchainAmount as number) ?? 0,
					lockupTxHash: (s.lockupTxHash as string) ?? '',
					claimTxHash: (s.claimTxHash as string) ?? '',
					claimDetails: (s.claimDetails as SwapRow['claimDetails']) ?? null,
					lockupClaimAddress: (s.lockupClaimAddress as string) ?? '',
					refundAddress: (s.refundAddress as string) ?? '',
					boltzStatus: '',
					boltzChecked: false,
					boltzClaimDetails: null,
					boltzTransactionId: '',
					recovering: false,
					recoverResult: null
				};
			});

			swaps = rows;
			loading = false;
			log('success', `Loaded ${rows.length} swap(s), newest first`);

			// Check Boltz status SEQUENTIALLY — one at a time.
			// This avoids the race condition where parallel swaps = swaps.map(...)
			// overwrites each other's changes.
			for (let i = 0; i < swaps.length; i++) {
				const swapId = swaps[i].swapId;
				try {
					const timeoutPromise = new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('timeout')), 8000)
					);
					const boltz = await Promise.race([boltzProvider.getSwapStatus(swapId), timeoutPromise]);
					// Direct index assignment — Svelte detects this on $state arrays
					swaps[i] = { ...swaps[i], boltzStatus: boltz.status, boltzChecked: true, boltzClaimDetails: boltz.claimDetails ?? null, boltzTransactionId: boltz.transactionId ?? '' };
				} catch (err) {
					d.warn('Boltz check failed for %s: %s', swapId, (err as Error).message);
					swaps[i] = { ...swaps[i], boltzStatus: 'unknown', boltzChecked: true };
				}

				// If Nostr didn't persist claimDetails (bittasker-swap-chain events
				// drop them via buildSwapContent) and Boltz API didn't return them,
				// fetch from the on-chain lockup transaction as a self-healing step.
				const row = swaps[i];
				if (!row.claimDetails && !row.boltzClaimDetails && row.boltzTransactionId) {
					log('info', `  Fetching claim details from chain for ${swapId.slice(0, 12)}...`);
					const chainDetails = await fetchClaimDetailsFromRsk(row.boltzTransactionId)
						?? await fetchClaimDetailsFromArbitrum(row.boltzTransactionId);
					if (chainDetails) {
						swaps[i] = { ...swaps[i], claimDetails: chainDetails };
						log('success', `  Recovered claim details from chain for ${swapId.slice(0, 12)}`);
					}
				}
			}
			log('info', 'All Boltz checks complete');
		} catch (err) {
			loadError = (err as Error).message;
			log('error', `Failed to load swaps: ${loadError}`);
			loading = false;
		}
	}

	// ── Checksum address helper (ethers v6 requires EIP-55) ────────────
	// IMPORTANT: must lowercase first — ethers.getAddress() throws on
	// mixed-case input that doesn't match EIP-55 (e.g. "0x9AEA6DDA...")
	let _ethersMod: typeof import('ethers') | null = null;
	async function cs(addr: string): Promise<string> {
		if (!_ethersMod) _ethersMod = await import('ethers');
		return _ethersMod.ethers.getAddress(addr.toLowerCase());
	}

	// ── Fetch claim details from Arbitrum lockup tx ────────────────────
	// For RBTC→TBTC swaps: Boltz locks tBTC on Arbitrum (ERC20Swap).
	// Event: Lockup(bytes32 indexed preimageHash, uint256 amount, address token,
	//         address indexed claimAddress, address indexed refundAddress, uint256 timelock)
	// topic0=sig, topic1=preimageHash, topic2=claimAddress, topic3=refundAddress
	// data = amount + token + timelock
	async function fetchClaimDetailsFromArbitrum(lockupTxHash: string): Promise<{
		lockupAddress: string; amount: number; claimAddress: string; refundAddress: string; timeoutBlockHeight: number;
	} | null> {
		try {
			const { ethers } = await import('ethers');
			const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
			const receipt = await provider.getTransactionReceipt(lockupTxHash);
			if (!receipt?.to) { log('warn', '  Arbitrum: No receipt or contract address'); return null; }

			const lockupLogs = receipt.logs.filter((l) => l.address.toLowerCase() === receipt.to!.toLowerCase() && l.topics.length === 4);
			if (lockupLogs.length === 0) { log('warn', '  Arbitrum: No Lockup event found in tx logs'); return null; }

			const lockupLog = lockupLogs[0];
			const claimAddress = ethers.getAddress('0x' + lockupLog.topics[2].slice(26));
			const refundAddress = ethers.getAddress('0x' + lockupLog.topics[3].slice(26));

			// Parse data: 3 x 32-byte words (amount, token, timelock)
			const data = lockupLog.data;
			const amount = Number(BigInt(data.slice(0, 66)));
			const timeoutBlockHeight = Number(BigInt('0x' + data.slice(130, 194)));

			const details = { lockupAddress: receipt.to, amount, claimAddress, refundAddress, timeoutBlockHeight };
			log('success', `  Arbitrum claim details: ${details.amount} wei, timelock ${details.timeoutBlockHeight}, claim ${details.claimAddress.slice(0, 10)}...`);
			return details;
		} catch (err) {
			d.warn('fetchClaimDetailsFromArbitrum failed: %s', (err as Error).message);
			log('warn', `  Arbitrum fetch failed: ${(err as Error).message}`);
			return null;
		}
	}

	// ── Fetch claim details from RSK lockup tx ────────────────────────
	// For TBTC→RBTC swaps: Boltz locks RBTC on RSK (EtherSwap).
	// Event: Lockup(bytes32 indexed preimageHash, uint256 amount,
	//         address indexed refundAddress, address claimAddress, uint256 timelock)
	// topic0=sig, topic1=preimageHash, topic2=refundAddress (msg.sender/Boltz)
	// data = amount (wei) + claimAddress (user, padded) + timelock
	async function fetchClaimDetailsFromRsk(lockupTxHash: string): Promise<{
		lockupAddress: string; amount: number; claimAddress: string; refundAddress: string; timeoutBlockHeight: number;
	} | null> {
		try {
			const { ethers } = await import('ethers');
			const provider = new ethers.JsonRpcProvider('https://public-node.rsk.co');
			const receipt = await provider.getTransactionReceipt(lockupTxHash);
			if (!receipt) { log('warn', '  RSK: No receipt found'); return null; }

			// Find the Lockup event from the EtherSwap contract
			const lockupLogs = receipt.logs.filter((l) =>
				l.topics[0]?.toLowerCase() === LOCKUP_TOPIC.toLowerCase() &&
				l.address.toLowerCase() === ETHERSWAP_ADDRESS.toLowerCase()
			);
			if (lockupLogs.length === 0) { log('warn', '  RSK: No Lockup event found'); return null; }

			const lockupLog = lockupLogs[0];
			// topic2 = refundAddress (Boltz/msg.sender, can refund after timelock)
			const refundAddress = ethers.getAddress('0x' + lockupLog.topics[2].slice(26));

			// Parse data: 3 x 32-byte words (amount_wei, claimAddress, timelock)
			const data = lockupLog.data;
			const amountWei = Number(BigInt(data.slice(0, 66)));
			const amount = Math.round(amountWei / 1e10); // wei → sats (claimRbtcOnRsk expects sats)
			// data[32:64] = claimAddress (user, can claim with preimage)
			const claimAddress = ethers.getAddress('0x' + data.slice(90, 130));
			const timeoutBlockHeight = Number(BigInt('0x' + data.slice(130, 194)));

			const details = { lockupAddress: ETHERSWAP_ADDRESS, amount, claimAddress, refundAddress, timeoutBlockHeight };
			log('success', `  RSK claim details: ${details.amount} sats, timelock ${details.timeoutBlockHeight}, claim ${details.claimAddress.slice(0, 10)}...`);
			return details;
		} catch (err) {
			d.warn('fetchClaimDetailsFromRsk failed: %s', (err as Error).message);
			log('warn', `  RSK fetch failed: ${(err as Error).message}`);
			return null;
		}
	}

	// ── Recover a single swap ─────────────────────────────────────────
	async function recoverSwap(row: SwapRow) {
		const idx = swaps.findIndex((s) => s.swapId === row.swapId);
		if (idx < 0) return;
		swaps[idx] = { ...swaps[idx], recovering: true, recoverResult: null };
		log('info', `Recovering swap ${row.swapId.slice(0, 12)}...`);

		try {
			// Step 1: Get Boltz status if not checked
			let boltzStatus = swaps[idx].boltzStatus;
			let boltzClaimDetails = swaps[idx].boltzClaimDetails;
			if (!swaps[idx].boltzChecked) {
				const boltz = await boltzProvider.getSwapStatus(row.swapId);
				boltzStatus = boltz.status;
				boltzClaimDetails = boltz.claimDetails ?? null;
				swaps[idx] = { ...swaps[idx], boltzStatus, boltzChecked: true, boltzClaimDetails, boltzTransactionId: boltz.transactionId ?? '' };
			}

			// Already done?
			if (['transaction.claimed', 'invoice.settled', 'invoice.paid'].includes(boltzStatus)) {
				swaps[idx] = { ...swaps[idx], recovering: false, recoverResult: { ok: true, msg: 'Already claimed — funds are in your wallet.' } };
				return;
			}
			if (boltzStatus === 'transaction.refunded') {
				swaps[idx] = { ...swaps[idx], recovering: false, recoverResult: { ok: true, msg: 'Already refunded.' } };
				return;
			}

			// Step 2: Get preimage
			let preimage = swaps[idx].preimage;
			if (!preimage) {
				log('info', '  No preimage in Nostr data, trying Preferences...');
				const cd = await loadClaimDataFromNostr(row.swapId);
				if (cd) { preimage = cd.preimageHex; log('success', '  Preimage recovered'); }
			}
			if (!preimage) {
				swaps[idx] = { ...swaps[idx], recovering: false, recoverResult: { ok: false, msg: 'No preimage found — cannot claim.' } };
				return;
			}

			// Step 3: Get claim details — try Boltz API, then Nostr, then on-chain
			let claimDetails = boltzClaimDetails ?? swaps[idx].claimDetails;
			if (!claimDetails) {
				const lockupTx = swaps[idx].boltzTransactionId;
				if (lockupTx) {
					log('info', '  No claim details in Boltz/Nostr, fetching from on-chain...');
					// Try RSK first (Boltz locks RBTC on RSK for TBTC→RBTC swaps)
					claimDetails = await fetchClaimDetailsFromRsk(lockupTx);
					if (!claimDetails) {
						// Try Arbitrum (Boltz locks tBTC on Arbitrum for RBTC→TBTC swaps)
						log('info', '  Not found on RSK, trying Arbitrum...');
						claimDetails = await fetchClaimDetailsFromArbitrum(lockupTx);
					}
					if (claimDetails) {
						swaps[idx] = { ...swaps[idx], claimDetails };
					}
				}
			}
			if (!claimDetails) {
				swaps[idx] = { ...swaps[idx], recovering: false, recoverResult: { ok: false, msg: 'No claim details found — swap may already be resolved.' } };
				return;
			}

			// Step 4: Execute claim
			const claimable = ['transaction.server.confirmed', 'transaction.claim.pending', 'transaction.server.mempool', 'transaction.confirmed'];
			if (claimable.includes(boltzStatus)) {
				log('info', `  Boltz locked funds (${boltzStatus}). Claiming...`);
				const isArbitrum = claimDetails.lockupAddress.toLowerCase() !== ETHERSWAP_ADDRESS.toLowerCase();

				// CRITICAL: checksum all addresses — ethers v6 rejects non-EIP-55 addresses
				const claimAddr = await cs(swaps[idx].lockupClaimAddress || rskAddress);
				const refundAddr = await cs(claimDetails.refundAddress);
				const contractAddr = await cs(claimDetails.lockupAddress);

				if (isArbitrum) {
					// claimTbtcOnArbitrum already passes feeToken=TBTC_ARB to the gasless relay.
					// The gasless relay uses tBTC (produced atomically by the claim) for gas —
					// no pre-existing ETH on Arbitrum needed.
					const preimageHex0x = preimage.startsWith('0x') ? preimage : '0x' + preimage;
					log('info', '  Claiming tBTC on Arbitrum (gasless relay uses tBTC for gas)...');
					const err = await claimTbtcOnArbitrum({ contractAddress: contractAddr, preimageHex: preimageHex0x, amount: claimDetails.amount, tokenAddress: TBTC_ARB, claimAddress: claimAddr, refundAddress: refundAddr, timelock: claimDetails.timeoutBlockHeight, sourceConnectedWalletId: null });
					if (err) throw err;
					swaps[idx] = { ...swaps[idx], recovering: false, recoverResult: { ok: true, msg: 'tBTC claimed on Arbitrum!' } };
					log('success', '  tBTC claimed!');
				} else {
					// claimRbtcOnRsk → encodeEtherSwapClaim adds 0x prefix internally
					const preimageHex = preimage.startsWith('0x') ? preimage.slice(2) : preimage;
					log('info', '  Claiming rBTC on RSK...');
					const err = await claimRbtcOnRsk({ preimageHex, amount: claimDetails.amount, claimAddress: claimAddr, refundAddress: refundAddr, timelock: claimDetails.timeoutBlockHeight, sourceConnectedWalletId: null });
					if (err) throw err;
					swaps[idx] = { ...swaps[idx], recovering: false, recoverResult: { ok: true, msg: 'rBTC claimed on RSK!' } };
					log('success', '  rBTC claimed!');
				}
			} else if (['swap.expired', 'transaction.failed'].includes(boltzStatus)) {
				swaps[idx] = { ...swaps[idx], recovering: false, recoverResult: { ok: false, msg: `Swap ${boltzStatus}. Use RSK Scanner below to refund.` } };
			} else {
				swaps[idx] = { ...swaps[idx], recovering: false, recoverResult: { ok: false, msg: `Cannot recover: status is "${boltzStatus}".` } };
			}
		} catch (err) {
			swaps[idx] = { ...swaps[idx], recovering: false, recoverResult: { ok: false, msg: (err as Error).message } };
			log('error', `  Recovery failed: ${(err as Error).message}`);
		}
	}

	// ── RSK Scanner ───────────────────────────────────────────────────
	async function handleScan() {
		scanning = true; lockups = []; refundResults = {};
		log('info', 'Scanning RSK for lockups...');
		try {
			const { data, error } = await scanUnclaimedLockups();
			if (error) throw error;
			lockups = data;
			log('success', `Found ${data.length} lockup(s)`);
		} catch (err) { log('error', `Scan failed: ${(err as Error).message}`); } finally { scanning = false; }
	}

 	async function handleRefund(lockup: UnclaimedLockup) {
		refundingTxHash = lockup.txHash; refundResults[lockup.txHash] = { ok: false, msg: 'Refunding...' };
		log('info', `Refunding ${lockup.amountSats} sats...`);
		try {
			const { txHash, error } = await refundLockupDirect(lockup);
			if (error) throw error;
			refundResults[lockup.txHash] = { ok: true, msg: `TX: ${txHash}` };
			log('success', `Refund TX: ${txHash}`);
		} catch (err) { refundResults[lockup.txHash] = { ok: false, msg: (err as Error).message }; log('error', `Refund failed: ${(err as Error).message}`); } finally { refundingTxHash = null; }
	}

	// ── Refund RBTC from Boltz EtherSwap on RSK ──────────────────────
	// Queries Blockscout by preimageHash (topic1) to find the Lockup event,
	// then calls EtherSwap.refund(preimageHash, claimAddress, timelock).
	async function handleRefundRSK(row: SwapRow) {
		const idx = swaps.findIndex((s) => s.swapId === row.swapId);
		if (idx < 0) return;
		swaps[idx] = { ...swaps[idx], recovering: true, recoverResult: null };
		log('info', `Refunding RBTC for swap ${row.swapId}...`);

		try {
			const preimage = swaps[idx].preimage;
			if (!preimage) throw new Error('No preimage available — cannot refund without it');

			const { ethers } = await import('ethers');
			const preimageHash = ethers.sha256('0x' + preimage);
			log('info', `  PreimageHash: ${preimageHash.slice(0, 18)}...`);

			// Query Blockscout for Lockup event by preimageHash (topic1)
			const lockupUrl = `${BLOCKSCOUT_API_BASE}?module=logs&action=getLogs&address=${ETHERSWAP_ADDRESS}&topic0=${LOCKUP_TOPIC}&topic1=${preimageHash}&topic0_1_opr=and&fromBlock=0&toBlock=latest`;
			log('info', '  Querying Blockscout for Lockup event...');
			const lockupResp = await fetch(lockupUrl);
			const lockupData = (await lockupResp.json()) as { result?: Array<{ topics: string[]; data: string; blockNumber: string; transactionHash: string }> };

			if (!lockupData.result || lockupData.result.length === 0) {
				throw new Error('No Lockup event found on RSK for this preimageHash. The lockup may never have been created.');
			}

			const event = lockupData.result[0];
			const dataHex = event.data;

			// Parse event data: amount (uint256) + claimAddress (address, padded) + timelock (uint256)
			const amount = BigInt('0x' + dataHex.slice(2, 66));
			const claimAddress = '0x' + dataHex.slice(90, 130);
			const timelock = Number(BigInt('0x' + dataHex.slice(130, 194)));
			const lockupBlock = parseInt(event.blockNumber, 16);

			log('info', `  Lockup found: ${ethers.formatEther(amount)} RBTC | claim: ${claimAddress.slice(0, 14)}... | timelock: ${timelock} | block: ${lockupBlock}`);

			// Check if already claimed
			const claimUrl = `${BLOCKSCOUT_API_BASE}?module=logs&action=getLogs&address=${ETHERSWAP_ADDRESS}&topic0=${CLAIM_TOPIC}&topic1=${preimageHash}&topic0_1_opr=and&fromBlock=0&toBlock=latest`;
			const claimResp = await fetch(claimUrl);
			const claimData = (await claimResp.json()) as { result?: Array<unknown> };
			if (Array.isArray(claimData.result) && claimData.result.length > 0) {
				throw new Error('Already claimed — Boltz took the RBTC using the preimage');
			}

			// Check timelock
			const rskProvider = new ethers.JsonRpcProvider('https://public-node.rsk.co');
			const currentBlock = await rskProvider.getBlockNumber();
			log('info', `  Current RSK block: ${currentBlock} | Timelock: ${timelock}`);

			if (currentBlock < timelock) {
				const blocksLeft = timelock - currentBlock;
				const minutesLeft = Math.ceil((blocksLeft * 30) / 60);
				throw new Error(`Timelock not expired — ~${minutesLeft}m remaining (${blocksLeft} blocks). Wait until block ${timelock}.`);
			}

			// Encode and send refund TX
			const calldata = encodeEtherSwapRefund(preimageHash, claimAddress, timelock);
			log('info', `  Sending refund to ${ETHERSWAP_ADDRESS.slice(0, 14)}...`);
			const txHash = await sendRawTransaction({
				to: ETHERSWAP_ADDRESS,
				data: calldata,
				value: '0',
				chain: 'rsk'
			});

			swaps[idx] = { ...swaps[idx], recovering: false, recoverResult: { ok: true, msg: `Refund TX: ${txHash}` } };
			log('success', `Refund sent! TX: ${txHash}`);
			log('info', `View: https://rootstock.blockscout.com/tx/${txHash}`);
		} catch (err) {
			swaps[idx] = { ...swaps[idx], recovering: false, recoverResult: { ok: false, msg: (err as Error).message } };
			log('error', `Refund failed: ${(err as Error).message}`);
		}
	}

	// ── Helpers ───────────────────────────────────────────────────────
	function fmtTime(ms: number): string { return ms ? new Date(ms).toLocaleString() : '—'; }

	function statusColor(s: string): string {
		if (['transaction.claimed', 'invoice.settled', 'invoice.paid'].includes(s)) return 'badge-success';
		if (['swap.expired', 'transaction.failed', 'transaction.refunded'].includes(s)) return 'badge-error';
		if (['transaction.server.confirmed', 'transaction.confirmed', 'transaction.claim.pending'].includes(s)) return 'badge-info';
		if (s === 'unknown') return 'badge-ghost';
		return 'badge-warning';
	}

	const STATUS_LABELS: Record<string, string> = { 'transaction.claimed': 'Claimed', 'invoice.settled': 'Settled', 'invoice.paid': 'Paid', 'transaction.refunded': 'Refunded', 'swap.expired': 'Expired', 'transaction.failed': 'Failed', 'transaction.server.confirmed': 'Claimable', 'transaction.confirmed': 'Confirmed', 'transaction.claim.pending': 'Claim Pending', 'transaction.server.mempool': 'Locking...', 'transaction.mempool': 'In Mempool', 'invoice.pending': 'Invoice Pending', 'swap.created': 'Created', 'unknown': 'Unknown' };
	function statusLabel(s: string): string { return STATUS_LABELS[s] ?? s; }

	function canRecover(row: SwapRow): boolean {
		return ['transaction.server.confirmed', 'transaction.claim.pending', 'transaction.server.mempool', 'transaction.confirmed'].includes(row.boltzStatus);
	}

	function copyText(text: string) { navigator.clipboard.writeText(text).catch(() => {}); }
	function clearLog() { logs = []; }
</script>

<svelte:head>
	<title>Swap Recovery — BitTasker Debug</title>
</svelte:head>

<div class="mx-auto max-w-6xl px-6 py-6">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">Swap Recovery</h1>
		<p class="text-sm opacity-60">Recover locked funds from failed Boltz swaps.</p>
	</div>

	{#if initError}
		<div class="alert alert-error mb-4"><span>Wallet init failed: {initError}</span></div>
	{:else if !walletReady}
		<div class="alert alert-info mb-4"><span class="loading loading-spinner loading-sm"></span><span>Initializing wallet...</span></div>
	{:else}
		<div class="mb-4 text-xs font-mono opacity-50">RSK: {rskAddress}</div>
	{/if}

	<!-- My Swaps -->
	<div class="card bg-base-200 mb-6">
		<div class="card-body p-5">
			<div class="flex items-center justify-between">
				<h2 class="card-title text-xl">My Swaps</h2>
				<button class="btn btn-ghost btn-sm" disabled={loading || !walletReady} onclick={loadSwaps}>
					{#if loading}<span class="loading loading-spinner loading-xs"></span>{:else}Refresh{/if}
				</button>
			</div>

			{#if loading && swaps.length === 0}
				<div class="flex items-center gap-2 py-8"><span class="loading loading-spinner loading-md"></span><span>Loading swaps from Nostr...</span></div>
			{:else if loadError}
				<div class="alert alert-error mt-2 text-sm">{loadError}</div>
			{:else if swaps.length === 0}
				<p class="py-4 text-sm opacity-50">No swaps found on Nostr.</p>
			{:else}
				<div class="mt-2 space-y-4">
					{#each swaps as row, index (row.swapId)}
						<div class="card bg-base-100 border-2" class:border-success={row.recoverResult?.ok} class:border-error={row.recoverResult && !row.recoverResult.ok} class:border-base-300={!row.recoverResult}>
							<div class="card-body p-4">
								<!-- Swap ID + status -->
								<div class="flex items-center gap-3">
									<span class="cursor-pointer font-mono text-sm hover:opacity-80" role="button" tabindex="0" onclick={() => copyText(row.swapId)} onkeydown={(e) => e.key === 'Enter' && copyText(row.swapId)} title="Click to copy">{row.swapId}</span>
									{#if row.boltzChecked}
										<span class="badge badge-sm {statusColor(row.boltzStatus)}">{statusLabel(row.boltzStatus)}</span>
									{:else}
										<span class="loading loading-spinner loading-xs"></span>
									{/if}
									{#if row.preimage}
										<span class="badge badge-success badge-xs">preimage ✓</span>
									{:else}
										<span class="badge badge-warning badge-xs">no preimage</span>
									{/if}
								</div>

								<!-- Route -->
								<div class="flex items-center gap-3 text-base">
									{#if row.fromAsset}
										<span class="font-bold">{row.fromAsset}</span>
										{#if row.fromAmount}<span class="opacity-60">{row.fromAmount.toLocaleString()} sats</span>{/if}
										<span class="text-primary">→</span>
										<span class="font-bold">{row.toAsset}</span>
										{#if row.toAmount}<span class="opacity-60">{row.toAmount.toLocaleString()}</span>{/if}
									{:else}
										<span class="opacity-50">chain swap ({row.swapType})</span>
									{/if}
								</div>

								<!-- Metadata -->
								<div class="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs">
									<span><span class="opacity-50">Created:</span> {fmtTime(row.createdAt)}</span>
									<span><span class="opacity-50">Type:</span> {row.swapType}</span>
									<span><span class="opacity-50">Nostr:</span> <span class="badge badge-ghost badge-xs">{row.nostrStatus}</span></span>
									{#if row.boltzTransactionId}<span><span class="opacity-50">Boltz TX:</span> <span class="font-mono">{row.boltzTransactionId.slice(0, 16)}...</span></span>{/if}
									{#if row.lockupTxHash}<span><span class="opacity-50">Lockup TX:</span> <span class="font-mono">{row.lockupTxHash.slice(0, 16)}...</span></span>{/if}
									{#if row.claimTxHash}<span><span class="opacity-50">Claim TX:</span> <span class="font-mono">{row.claimTxHash.slice(0, 16)}...</span></span>{/if}
									{#if row.refundAddress}<span><span class="opacity-50">Refund:</span> <span class="font-mono">{row.refundAddress.slice(0, 12)}...</span></span>{/if}
								</div>

								<!-- Claim details -->
								{#if row.boltzClaimDetails ?? row.claimDetails}
									<div class="bg-base-200 mt-2 rounded-lg p-3 text-xs">
										<div class="mb-1 font-bold">{row.boltzClaimDetails ? 'Boltz Claim Details (live)' : 'Claim Details (from Nostr)'}</div>
										<div class="grid grid-cols-2 gap-x-6 gap-y-1 lg:grid-cols-4">
											<div><span class="opacity-50">Contract:</span> <span class="font-mono">{(row.boltzClaimDetails ?? row.claimDetails)!.lockupAddress}</span></div>
											<div><span class="opacity-50">Amount:</span> {(row.boltzClaimDetails ?? row.claimDetails)!.amount.toLocaleString()}</div>
											<div><span class="opacity-50">Timeout:</span> {(row.boltzClaimDetails ?? row.claimDetails)!.timeoutBlockHeight.toLocaleString()}</div>
											<div><span class="opacity-50">Refund:</span> <span class="font-mono">{(row.boltzClaimDetails ?? row.claimDetails)!.refundAddress.slice(0, 12)}...</span></div>
										</div>
										{#if row.lockupClaimAddress}<div class="mt-1"><span class="opacity-50">Claim to:</span> <span class="font-mono">{row.lockupClaimAddress}</span></div>{/if}
									</div>
								{/if}

								<!-- Preimage -->
								{#if row.preimage}<div class="mt-1 text-xs"><span class="opacity-50">Preimage:</span> <span class="break-all font-mono">{row.preimage}</span></div>{/if}

								<!-- Actions -->
								<div class="mt-3 flex items-center gap-3">
									{#if canRecover(row) && row.preimage}
										<button class="btn btn-success btn-sm" disabled={row.recovering} onclick={() => recoverSwap(row)}>
											{#if row.recovering}<span class="loading loading-spinner loading-xs"></span> Recovering...{:else}Recover Funds{/if}
										</button>
									{:else if canRecover(row) && !row.preimage}
										<span class="text-sm text-warning">Boltz has locked funds but no preimage — cannot claim</span>
									{:else if row.boltzStatus === 'swap.expired' || row.boltzStatus === 'transaction.failed'}
										<span class="badge badge-error badge-sm">{statusLabel(row.boltzStatus)}</span>
										<span class="text-sm opacity-60">Use RSK Scanner below to refund</span>
									{:else if row.boltzStatus === 'transaction.claimed' || row.boltzStatus === 'invoice.settled' || row.boltzStatus === 'invoice.paid'}
										<span class="badge badge-success badge-sm">Recovered</span>
									{:else if row.boltzStatus === 'transaction.refunded'}
										<span class="badge badge-ghost badge-sm mr-2">Boltz Refunded</span>
										<button class="btn btn-warning btn-sm" disabled={row.recovering} onclick={() => handleRefundRSK(row)}>
											{#if row.recovering}
												<span class="loading loading-spinner loading-xs"></span> Refunding...
											{:else}
												Refund RBTC
											{/if}
										</button>
									{/if}
									{#if row.boltzTransactionId}
										<a href="https://arbiscan.io/tx/{row.boltzTransactionId}" target="_blank" rel="noopener noreferrer" class="link link-primary text-xs ml-auto">View Lockup TX ↗</a>
									{:else}
										<a href="https://rootstock.blockscout.com/address/{rskAddress}" target="_blank" rel="noopener noreferrer" class="link link-primary text-xs ml-auto">View on Blockscout ↗</a>
									{/if}
								</div>

								<!-- Recover result -->
								{#if row.recoverResult}
									<div class="mt-2 rounded-lg p-3 text-sm {row.recoverResult.ok ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}">
										{row.recoverResult.msg}
										{#if row.recoverResult.txHash}
											<a href={row.recoverResult.msg.includes('Refund') ? `https://rootstock.blockscout.com/tx/${row.recoverResult.txHash}` : `https://arbiscan.io/tx/${row.recoverResult.txHash}`} target="_blank" rel="noopener noreferrer" class="link ml-2 text-xs">View TX ↗</a>
										{/if}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Advanced -->
	<div class="collapse-arrow bg-base-200 collapse mb-6">
		<input type="checkbox" bind:checked={showAdvanced} />
		<div class="collapse-title text-lg font-medium">Advanced Tools</div>
		<div class="collapse-content">
			<h3 class="mt-2 mb-2 font-bold">RSK Lockup Scanner</h3>
			<p class="mb-2 text-sm opacity-60">Scan RSK for all Boltz lockups. Use this to refund rBTC if a swap expired.</p>
			<button class="btn btn-primary btn-sm" disabled={scanning || !walletReady} onclick={handleScan}>
				{#if scanning}<span class="loading loading-spinner loading-xs"></span>{/if} Scan RSK
			</button>
			{#if lockups.length > 0}
				<div class="mt-3 space-y-2">
					{#each lockups as lockup, index (lockup.txHash)}
						<div class="bg-base-100 border-base-300 rounded-lg border p-3">
							<div class="flex items-center justify-between">
								<div>
									<span class="font-bold">{lockup.amountSats.toLocaleString()} sats</span>
									{#if lockup.resolved}<span class="badge badge-ghost badge-xs ml-2">Resolved</span>{:else if lockup.expired}<span class="badge badge-success badge-xs ml-2">Refundable</span>{:else}<span class="badge badge-warning badge-xs ml-2">Timelock Active</span>{/if}
								</div>
								{#if !lockup.resolved && lockup.expired}
									<button class="btn btn-success btn-xs" disabled={refundingTxHash === lockup.txHash} onclick={() => handleRefund(lockup)}>
										{#if refundingTxHash === lockup.txHash}<span class="loading loading-spinner loading-xs"></span>{/if} Refund
									</button>
								{/if}
							</div>
							<div class="mt-1 text-xs font-mono opacity-50">TX: {lockup.txHash} | Block: {lockup.blockNumber} | Timelock: {lockup.timeoutBlockHeight} | Current: {lockup.currentBlock}</div>
							{#if refundResults[lockup.txHash]}<div class="mt-1 text-xs {refundResults[lockup.txHash].ok ? 'text-success' : 'text-error'}">{refundResults[lockup.txHash].msg}</div>{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Log -->
	<div class="card bg-base-200">
		<div class="card-body p-4">
			<div class="flex items-center justify-between">
				<h2 class="card-title text-sm">Log ({logs.length})</h2>
				<button class="btn btn-ghost btn-xs" onclick={clearLog}>Clear</button>
			</div>
			<div class="bg-base-300 max-h-60 overflow-y-auto rounded-lg p-2 font-mono text-xs">
				{#if logs.length === 0}<p class="p-2 opacity-40">No activity yet.</p>
				{:else}{#each logs as entry, index (entry.time + entry.msg)}<div class="border-base-content/5 border-b px-1 py-0.5" class:text-success={entry.level === 'success'} class:text-error={entry.level === 'error'} class:text-warning={entry.level === 'warn'} class:opacity-60={entry.level === 'info'}><span class="opacity-40">{entry.time}</span> <span class="ml-1">{entry.msg}</span></div>{/each}{/if}
			</div>
		</div>
	</div>
</div>
