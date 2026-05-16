import { reviewsAttestationClient } from '$lib/api/services/reviewsAttestation.service';
import type { ReviewChallengeRequest } from '$lib/types/review';
import type { NostrEventLike } from '@bittasker/reviews-contracts';
import KINDS from '$lib/utils/constants/kinds';
import { normalizeNostrPubkey } from '$lib/utils/nostr-pubkey';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { getSignedEvent } from '$lib/utils/nostr';
import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';
import { getWallet } from '$lib/stores/wallet.store';

export interface AttestationFlowResult {
	attestationEventId: string;
	reviewEventId: string;
}

export async function buildSignedReviewEvent(
	content: Record<string, unknown>,
	tags: string[][] = []
): Promise<NostrEventLike> {
	const signed = await getSignedEvent({
		kind: KINDS.REVIEW,
		created_at: Math.floor(Date.now() / 1000),
		tags,
		content: JSON.stringify(content)
	});

	return {
		id: signed.id,
		pubkey: signed.pubkey,
		created_at: signed.created_at,
		kind: signed.kind,
		tags: signed.tags,
		content: signed.content,
		sig: signed.sig ?? ''
	};
}

export async function submitAttestedReview(params: {
	reviewDraftHash: string;
	signedReviewEvent: NostrEventLike;
	subjectType: 'task' | 'service_booking';
	subjectId: string;
	settlementType: 'escrow' | 'service_quote_contract' | 'instant_buy_contract';
	settlementId: string;
	chain: 'rsk' | 'bsc';
	asset: 'rbtc' | 'usdt';
	contractAddress: string;
	revieweeNpub: string;
	revieweeWallet: string;
	reviewerWallet: string;
}): Promise<AttestationFlowResult> {
	const { npub } = await getNostrKeyPair();
	if (!npub) throw new Error('Not authenticated');

	const reviewerNpub = normalizeNostrPubkey(npub) ?? npub;

	const wallet = getWallet('rsk');
	if (!wallet) throw new Error('RSK wallet not initialized');
	const walletAddress = wallet.address;

	const resolvedRevieweeWallet = params.revieweeWallet?.trim();
	if (!resolvedRevieweeWallet) {
		throw new Error('missing_reviewee_wallet');
	}

	// Reviewer wallet must match the on-chain party (tasker or taskee); prefer explicit param over connected wallet.
	const resolvedReviewerWallet = params.reviewerWallet?.trim() || walletAddress;
	if (!resolvedReviewerWallet) {
		throw new Error('missing_reviewer_wallet');
	}

	const challengeRequest: ReviewChallengeRequest = {
		schemaVersion: 1 as const,
		reviewDraftHash: params.reviewDraftHash,
		subjectType: params.subjectType,
		subjectId: params.subjectId,
		settlementType: params.settlementType,
		settlementId: params.settlementId,
		chain: params.chain,
		asset: params.asset,
		contractAddress: params.contractAddress,
		reviewerNpub,
		revieweeNpub: params.revieweeNpub,
		reviewerWallet: resolvedReviewerWallet,
		revieweeWallet: resolvedRevieweeWallet
	};

	const challenge = await reviewsAttestationClient.requestChallenge(challengeRequest);

	const [nostrSignature, walletSignature] = await Promise.all([
		signWithNostr(challenge.challengeMessage),
		wallet.signMessage(challenge.challengeMessage)
	]);

	const response = await reviewsAttestationClient.submitAttestation({
		reviewDraftHash: params.reviewDraftHash,
		signedReviewEvent: params.signedReviewEvent,
		challengeToken: challenge.challengeToken,
		nostrChallengeSignature: nostrSignature,
		walletChallengeSignature: walletSignature,
		subjectType: params.subjectType,
		subjectId: params.subjectId,
		settlementType: params.settlementType,
		settlementId: params.settlementId,
		chain: params.chain,
		asset: params.asset,
		contractAddress: params.contractAddress,
		reviewerNpub,
		revieweeNpub: params.revieweeNpub,
		reviewerWallet: resolvedReviewerWallet,
		revieweeWallet: resolvedRevieweeWallet
	});

	return {
		attestationEventId: response.attestationEventId,
		reviewEventId: params.signedReviewEvent.id
	};
}

async function signWithNostr(message: string): Promise<string> {
	const { nsec } = await getNostrKeyPair();
	if (!nsec) throw new Error('No private key available for signing');

	const messageHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
	const sig = schnorr.sign(new Uint8Array(messageHash), nsec);
	return bytesToHex(sig);
}
