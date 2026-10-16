import { walletManager } from '$lib/stores/wallet/wallet-manager';
import {
	bolt11Expired,
	bolt11MatchesSats,
	escrowStageSats,
	lightningNodeEmpty,
	refusedBotPayee,
	satsChannelOpen
} from '../escrow-rail';
import type { EscrowProof } from './types';

interface LnWallet {
	listPeers?: () => Promise<unknown>;
	listChannels?: () => Promise<unknown>;
	decodeLnInvoice: (invoice: string) => Promise<{
		payee?: string;
		amtMsat?: number | bigint | null;
		timestamp?: number;
		expirySeconds?: number;
		paymentHash?: string;
	}>;
}

export async function payLnBtc(
	wallet: LnWallet,
	invoice: string,
	lockedSats: number
): Promise<EscrowProof> {
	const peers = typeof wallet.listPeers === 'function' ? await wallet.listPeers() : [];
	const channels = typeof wallet.listChannels === 'function' ? await wallet.listChannels() : [];
	if (!satsChannelOpen(channels)) {
		throw new Error(
			lightningNodeEmpty(peers, channels)
				? 'Lightning node has no peer'
				: 'Lightning node has no channel'
		);
	}
	const decoded = await wallet.decodeLnInvoice(invoice);
	if (refusedBotPayee(decoded.payee)) throw new Error('Lightning peer is refused');
	const matchesStage = escrowStageSats(lockedSats).some((sats) =>
		bolt11MatchesSats(decoded.amtMsat, sats)
	);
	if (!matchesStage) throw new Error('Lightning invoice amount does not match the locked sats');
	const nowSec = Math.floor(Date.now() / 1000);
	if (bolt11Expired(decoded.timestamp, decoded.expirySeconds, nowSec)) {
		throw new Error('Lightning invoice is expired');
	}
	const paid = await walletManager.payLightningInvoice({ lnInvoice: invoice });
	if (paid.status !== 'Succeeded' && paid.status !== 'settled') {
		throw new Error('Lightning payment did not succeed');
	}
	return {
		kind: 'preimage',
		value: paid.preimage || paid.txid,
		paymentHash: paid.paymentHash ?? decoded.paymentHash
	};
}
