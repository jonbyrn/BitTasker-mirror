/**
 * Load payment contracts for the review system via NDK + on-chain reads under `utils/contract`.
 * Replaces legacy `escrow.contractOps.getContracts` + `adaptContractEvent`.
 */
import type { NDKEvent } from '@nostr-dev-kit/ndk';
import type { NDKFilter } from '@nostr-dev-kit/ndk';
import { NDKPaymentContract } from '$lib/nostr/events/contract';
import { ndk } from '$lib/nostr/ndk';
import KINDS from '$lib/utils/constants/kinds';
import { getNpub } from '$lib/utils/nostrKeys';
import { nip19 } from 'nostr-tools';
import { loadPaymentContractDetails } from '$lib/utils/contract/v1';
import { loadPaymentContractDetailsV2 } from '$lib/utils/contract/v2/loadPaymentContractDetailsV2';
import type { ContractChain, SecurePaymentLegacy } from '$lib/utils/contract/types';
import { ContractStatus } from '$lib/utils/contract/types';
import type { IContractForReview } from '$lib/utils/reviews/contract-interface';
import { adaptNDKContract } from '$lib/utils/reviews/contractAdapter';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('contract:reviews-ndk');

function pubkeyHexFromNpubOrHex(npubOrHex: string): string {
	if (npubOrHex.startsWith('npub')) {
		return nip19.decode(npubOrHex).data as string;
	}
	return npubOrHex;
}

function contractStateToLabel(state: number | undefined): string {
	if (state === undefined) return '';
	const byNumber = ContractStatus as unknown as Record<number, string>;
	const label = byNumber[state];
	return typeof label === 'string' ? label : '';
}

async function loadSecurePaymentForContract(
	contract: NDKPaymentContract,
	chain: ContractChain = 'rsk'
): Promise<SecurePaymentLegacy | null> {
	const paymentId = contract.paymentId?.trim();
	const contractAddress = contract.contractAddress?.trim();
	if (!paymentId || !contractAddress) {
		return null;
	}

	const version = contract.version === 'v2' ? 'v2' : 'v1';

	try {
		if (version === 'v2') {
			return await loadPaymentContractDetailsV2(paymentId, contractAddress, chain);
		}
		return await loadPaymentContractDetails(paymentId, contractAddress, chain);
	} catch (err) {
		d.warn('loadSecurePaymentForContract: chain read failed', {
			paymentId,
			contractAddress,
			version,
			err
		});
		return null;
	}
}

/**
 * Build {@link IContractForReview} from an NDK payment contract using `utils/contract` chain loaders.
 */
export async function buildIContractForReviewFromNdk(
	contract: NDKPaymentContract
): Promise<IContractForReview | null> {
	const payment = await loadSecurePaymentForContract(contract);
	const liveLabel = contractStateToLabel(payment?.state);
	const wallets =
		payment?.tasker && payment?.taskee ? { tasker: payment.tasker, taskee: payment.taskee } : null;
	return adaptNDKContract(contract, liveLabel || undefined, wallets);
}

async function ndkPaymentContractFromEvent(ev: NDKEvent): Promise<NDKPaymentContract | null> {
	if (!ev.ndk) {
		Object.assign(ev, { ndk });
	}
	return (await NDKPaymentContract.from(ev)) ?? null;
}

/**
 * Lists Kind 30006 contracts where the user appears on `#p`, same routing as `DashboardContractsPanelNDK`.
 */
export async function fetchNdkPaymentContractsForUser(
	limit: number
): Promise<NDKPaymentContract[]> {
	const npub = await getNpub();
	const pubkeyHex = pubkeyHexFromNpubOrHex(npub);
	const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';

	const filter: NDKFilter = {
		kinds: [KINDS.CONTRACT],
		limit,
		'#p': [pubkeyHex],
		'#n': [network]
	};

	const set = await ndk.fetchEvents(filter, { closeOnEose: true });
	const out: NDKPaymentContract[] = [];

	for (const ev of set) {
		const c = await ndkPaymentContractFromEvent(ev);
		if (c) out.push(c);
	}

	out.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
	return out;
}

/**
 * Fetches the current user's contracts from NDK and adapts each to {@link IContractForReview} using on-chain status.
 */
export async function fetchContractsForReview(options?: {
	limit?: number;
}): Promise<IContractForReview[]> {
	const limit = options?.limit ?? 100;
	const ndkContracts = await fetchNdkPaymentContractsForUser(limit);

	const CHUNK = 8;
	const results: IContractForReview[] = [];

	for (let i = 0; i < ndkContracts.length; i += CHUNK) {
		const chunk = ndkContracts.slice(i, i + CHUNK);
		const adapted = await Promise.all(chunk.map((c) => buildIContractForReviewFromNdk(c)));
		for (const row of adapted) {
			if (row) results.push(row);
		}
	}

	return results;
}

/**
 * Resolve a single contract by escrow / payment `d` tag (payment id string on wire).
 */
export async function fetchIContractForReviewByEscrowId(
	escrowId: string
): Promise<IContractForReview | null> {
	const trimmed = escrowId?.trim();
	if (!trimmed) return null;

	const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	const filter: NDKFilter = {
		kinds: [KINDS.CONTRACT],
		'#d': [trimmed],
		'#n': [network],
		limit: 10
	};

	const set = await ndk.fetchEvents(filter, { closeOnEose: true });
	const events = [...set].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));

	for (const ev of events) {
		const c = await ndkPaymentContractFromEvent(ev);
		if (!c) continue;
		const adapted = await buildIContractForReviewFromNdk(c);
		if (adapted) return adapted;
	}

	return null;
}
