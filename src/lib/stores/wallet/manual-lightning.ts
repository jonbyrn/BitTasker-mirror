import type { ManualChannelPlan } from './lightning-status';

interface ManualNode {
	connectPeer?: (peerUri: string) => Promise<void>;
	openChannel: (params: {
		peerPubkey: string;
		capacitySat: number;
		isPublic: boolean;
		assetId?: string;
		assetLocalAmount?: number;
	}) => Promise<{ temporaryChannelId: string }>;
}

/**
 * Connect and open one channel after the user confirms the plan.
 * One attempt. A failure is returned to the form; nothing is retried.
 */
export async function openManualChannel(
	wallet: ManualNode,
	plan: ManualChannelPlan
): Promise<{ temporaryChannelId: string }> {
	if (plan.peerUri && typeof wallet.connectPeer === 'function') {
		await wallet.connectPeer(plan.peerUri);
	}
	// openChannel takes the 66-char pubkey. The host:port is only for connectPeer.
	return wallet.openChannel({
		peerPubkey: plan.peerPubkey,
		capacitySat: plan.capacitySat,
		isPublic: false,
		...(plan.assetId ? { assetId: plan.assetId, assetLocalAmount: plan.assetLocalAmount } : {})
	});
}
