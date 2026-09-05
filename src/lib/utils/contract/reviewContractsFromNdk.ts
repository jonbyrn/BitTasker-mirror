import { ndk } from '$lib/nostr/ndk';
import { NDKPaymentContract } from '$lib/nostr/events/contract';
import type { IContractForReview } from '$lib/utils/reviews/contract-interface';
import { isReviewableStatus } from '$lib/utils/reviews/status-mapper';

function adapt(contract: NDKPaymentContract): IContractForReview {
	const clientPubkey = contract.taskeePubkey ?? '';
	const freelancerPubkey = contract.taskerPubkey ?? '';
	return {
		contractId: contract.id,
		paymentId: contract.paymentId,
		clientPubkey,
		freelancerPubkey,
		status: contract.status,
		isReviewable: () => isReviewableStatus(contract.status),
		getReviewableParty: (pubkey) =>
			pubkey === clientPubkey ? 'client' : pubkey === freelancerPubkey ? 'freelancer' : null
	};
}

export async function fetchIContractForReviewByEscrowId(
	escrowId: string
): Promise<IContractForReview | null> {
	const events = await ndk.fetchEvents(
		{ kinds: [30006], '#r': [escrowId], limit: 1 },
		{ closeOnEose: true }
	);
	const event = [...events][0];
	if (!event) return null;
	const contract = await NDKPaymentContract.from(event);
	return contract ? adapt(contract) : null;
}
