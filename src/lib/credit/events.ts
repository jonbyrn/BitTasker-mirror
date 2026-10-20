import { finalizeEvent, verifyEvent, type Event, type EventTemplate } from 'nostr-tools/pure';
import KINDS from '$lib/utils/constants/kinds';
import type { JobReceiptInput, ReviewInput } from './reputation';
import type { AdvanceRecord, CreditNetwork } from './types';

export type CreditEventType =
	| 'advance_request'
	| 'advance_offer'
	| 'advance_accept'
	| 'advance_settled'
	| 'job_receipt';

const KIND_BY_TYPE: Record<CreditEventType, number> = {
	advance_request: KINDS.CREDIT_ADVANCE_REQUEST,
	advance_offer: KINDS.CREDIT_ADVANCE_OFFER,
	advance_accept: KINDS.CREDIT_ADVANCE_ACCEPT,
	advance_settled: KINDS.CREDIT_ADVANCE_SETTLED,
	job_receipt: KINDS.CREDIT_JOB_RECEIPT
};

const TYPE_BY_KIND = new Map<number, CreditEventType>(
	Object.entries(KIND_BY_TYPE).map(([type, kind]) => [kind, type as CreditEventType])
);

export interface CreditEventBody {
	type: CreditEventType;
	network: CreditNetwork;
	advanceId?: string;
	jobId?: string;
	escrowId?: string;
	contractId?: string;
	role?: 'tasker' | 'taskee' | 'worker' | 'lender' | 'hirer';
	counterparty?: string;
	advanceCents?: number;
	feeCents?: number;
	escrowCents?: number;
	outcome?: 'repaid' | 'defaulted';
	fundingTxid?: string;
	confirmations?: number;
}

const HEX_64 = /^[0-9a-f]{64}$/i;
const HEX_128 = /^[0-9a-f]{128}$/i;
const MAX_CONTENT = 8_000;

export function creditKind(type: CreditEventType): number {
	return KIND_BY_TYPE[type];
}

function tag(name: string, value: string | undefined): string[] | null {
	if (!value) return null;
	return [name, value];
}

export function creditEventTemplate(body: CreditEventBody, createdAt: number): EventTemplate {
	if (!Number.isSafeInteger(createdAt) || createdAt <= 0) {
		throw new Error('Event time is not valid');
	}
	const content = JSON.stringify(body);
	if (content.length > MAX_CONTENT) throw new Error('Credit event is too large');
	const tags = [
		tag('m', body.type),
		tag('n', body.network),
		tag('d', body.advanceId ?? body.contractId),
		tag('t', body.jobId),
		tag('e', body.escrowId ?? body.contractId),
		tag('p', body.counterparty)
	].filter((row): row is string[] => row !== null);
	return {
		kind: creditKind(body.type),
		created_at: createdAt,
		tags,
		content
	};
}

export function signCreditEvent(
	body: CreditEventBody,
	secret: Uint8Array,
	createdAt: number
): Event {
	return finalizeEvent(creditEventTemplate(body, createdAt), secret);
}

export function parseCreditBody(event: Event): CreditEventBody | null {
	if (!event.content.startsWith('{') || event.content.length > MAX_CONTENT) return null;
	try {
		const body = JSON.parse(event.content) as CreditEventBody;
		if (TYPE_BY_KIND.get(event.kind) !== body.type) return null;
		if (body.network !== 'mock' && body.network !== 'regtest' && body.network !== 'signet') {
			return null;
		}
		return body;
	} catch {
		return null;
	}
}

/**
 * True only when the id and schnorr signature match the event.
 * A fresh object is verified on purpose. nostr-tools caches `Symbol(verified)`
 * on the signed object, and that symbol is enumerable, so a copy can keep a
 * stale "verified" flag after the signature changes.
 */
export function creditEventVerified(event: Event): boolean {
	if (!HEX_64.test(event.pubkey) || !HEX_64.test(event.id) || !HEX_128.test(event.sig)) {
		return false;
	}
	const plain: Event = {
		id: event.id,
		pubkey: event.pubkey,
		sig: event.sig,
		kind: event.kind,
		created_at: event.created_at,
		tags: event.tags,
		content: event.content
	};
	try {
		return verifyEvent(plain);
	} catch {
		return false;
	}
}

export function readVerifiedCreditEvent(event: Event): CreditEventBody | null {
	if (!creditEventVerified(event)) return null;
	return parseCreditBody(event);
}

export function requestBody(record: AdvanceRecord): CreditEventBody {
	return {
		type: 'advance_request',
		network: record.network,
		advanceId: record.id,
		jobId: record.jobId,
		escrowId: record.escrowId,
		role: 'worker',
		counterparty: record.hirerPubkey,
		advanceCents: record.advanceAmountCents,
		feeCents: record.feeAmountCents,
		escrowCents: record.escrowAmountCents
	};
}

export function offerBody(record: AdvanceRecord): CreditEventBody {
	return {
		type: 'advance_offer',
		network: record.network,
		advanceId: record.id,
		jobId: record.jobId,
		escrowId: record.escrowId,
		role: 'lender',
		counterparty: record.workerPubkey,
		advanceCents: record.advanceAmountCents,
		feeCents: record.feeAmountCents,
		escrowCents: record.escrowAmountCents
	};
}

export function acceptBody(record: AdvanceRecord): CreditEventBody {
	return {
		type: 'advance_accept',
		network: record.network,
		advanceId: record.id,
		jobId: record.jobId,
		escrowId: record.escrowId,
		role: 'worker',
		counterparty: record.lenderPubkey,
		advanceCents: record.advanceAmountCents,
		feeCents: record.feeAmountCents,
		fundingTxid: record.fundingTxid,
		confirmations: record.fundingConfirmations
	};
}

export function receiptsFromCreditEvents(events: Event[]): JobReceiptInput[] {
	const receipts: JobReceiptInput[] = [];
	for (const event of events) {
		const body = readVerifiedCreditEvent(event);
		if (!body || body.type !== 'job_receipt' || !body.contractId) continue;
		if (body.role !== 'tasker' && body.role !== 'taskee') continue;
		receipts.push({
			contractId: body.contractId,
			pubkey: event.pubkey,
			counterparty: body.counterparty ?? '',
			role: body.role,
			signatureValid: true
		});
	}
	return receipts;
}

export function signPlainReview(input: {
	reviewer: { secret: Uint8Array; pubkey: string };
	revieweePubkey: string;
	rating: number;
	contractId: string;
	createdAt: number;
}): Event {
	return finalizeEvent(
		{
			kind: KINDS.REVIEW,
			created_at: input.createdAt,
			tags: [
				['p', input.revieweePubkey],
				['e', input.contractId]
			],
			content: JSON.stringify({
				type: 'review',
				escrowId: input.contractId,
				rating: { overallRating: input.rating }
			})
		},
		input.reviewer.secret
	);
}

export function reviewsFromVerifiedEvents(events: Event[]): ReviewInput[] {
	const reviews: ReviewInput[] = [];
	for (const event of events) {
		if (event.kind !== KINDS.REVIEW || !creditEventVerified(event)) continue;
		let body: { type?: string; escrowId?: string; rating?: { overallRating?: unknown } };
		try {
			body = JSON.parse(event.content) as typeof body;
		} catch {
			continue;
		}
		if (body.type !== 'review' || typeof body.rating?.overallRating !== 'number') continue;
		const reviewee = event.tags.find((tagRow) => tagRow[0] === 'p')?.[1];
		if (!reviewee) continue;
		reviews.push({
			id: event.id,
			revieweePubkey: reviewee,
			reviewerPubkey: event.pubkey,
			rating: body.rating.overallRating,
			signatureValid: true
		});
	}
	return reviews;
}

export function settledBody(record: AdvanceRecord): CreditEventBody {
	return {
		type: 'advance_settled',
		network: record.network,
		advanceId: record.id,
		jobId: record.jobId,
		escrowId: record.escrowId,
		role: record.status === 'defaulted' ? 'hirer' : 'worker',
		outcome: record.status === 'defaulted' ? 'defaulted' : 'repaid',
		advanceCents: record.advanceAmountCents,
		feeCents: record.feeAmountCents,
		escrowCents: record.escrowAmountCents,
		fundingTxid: record.fundingTxid,
		confirmations: record.fundingConfirmations
	};
}
