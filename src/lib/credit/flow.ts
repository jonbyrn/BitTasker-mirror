import { generateSecretKey, getPublicKey, type Event } from 'nostr-tools/pure';
import {
	cancellationSplit,
	completionSplit,
	legAmount,
	type PayoutSplit
} from '$lib/escrow/payoutSplit';
import { CREDIT_USDT_ASSET, MockRgbAdapter, mockInvoice } from '$lib/rgb';
import { applyAdvance, createAdvanceOnNetwork, displayStatus, escrowIsFunded } from './advance';
import {
	acceptBody,
	offerBody,
	readVerifiedCreditEvent,
	receiptsFromCreditEvents,
	requestBody,
	reviewsFromVerifiedEvents,
	settledBody,
	signCreditEvent,
	signPlainReview
} from './events';
import { centsToUnits } from './money';
import { CREDIT_POLICY, quoteAdvance } from './policy';
import { scoreReputation, type ReviewInput } from './reputation';
import type { AdvanceRecord, EscrowSnapshot, ReputationSummary } from './types';

export interface DeskParty {
	role: 'worker' | 'lender' | 'hirer';
	pubkey: string;
	secret: Uint8Array;
}

export interface CreditDesk {
	adapter: MockRgbAdapter;
	parties: Record<'worker' | 'lender' | 'hirer', DeskParty>;
	escrow: EscrowSnapshot;
	history: Event[];
	events: Event[];
	advance: AdvanceRecord | null;
	split: PayoutSplit | null;
	lenderLossCents: number;
	notice: string | null;
	useNewcomer: boolean;
}

const ESCROW_CENTS = 10_000;
const COMPLETED_JOBS = 20;
const REVIEW_COUNT = 4;

function party(role: DeskParty['role'], secret = generateSecretKey()): DeskParty {
	return { role, secret, pubkey: getPublicKey(secret) };
}

function receipt(
	author: DeskParty,
	contractId: string,
	role: 'tasker' | 'taskee',
	counterparty: string,
	createdAt: number
): Event {
	return signCreditEvent(
		{
			type: 'job_receipt',
			network: 'mock',
			contractId,
			role,
			counterparty
		},
		author.secret,
		createdAt
	);
}

function buildHistory(worker: DeskParty, hirer: DeskParty, now: number): Event[] {
	const events: Event[] = [];
	for (let index = 0; index < COMPLETED_JOBS; index += 1) {
		const contractId = `contract-${index + 1}`;
		events.push(receipt(worker, contractId, 'taskee', hirer.pubkey, now - 10_000 + index));
		events.push(receipt(hirer, contractId, 'tasker', worker.pubkey, now - 9_000 + index));
	}
	for (let index = 0; index < REVIEW_COUNT; index += 1) {
		events.push(
			signPlainReview({
				reviewer: hirer,
				revieweePubkey: worker.pubkey,
				rating: 5,
				contractId: `contract-${index + 1}`,
				createdAt: now - 100 + index
			})
		);
	}
	return events;
}

export function reputationFor(desk: CreditDesk): ReputationSummary {
	if (desk.useNewcomer) {
		return scoreReputation({
			subjectPubkey: desk.parties.worker.pubkey,
			receipts: [],
			reviews: []
		});
	}
	const receipts = receiptsFromCreditEvents(desk.history);
	const reviews: ReviewInput[] = reviewsFromVerifiedEvents(desk.history);
	return scoreReputation({
		subjectPubkey: desk.parties.worker.pubkey,
		receipts,
		reviews
	});
}

export function currentQuote(desk: CreditDesk) {
	return quoteAdvance(CREDIT_POLICY, reputationFor(desk), desk.escrow.amountCents, 'mock');
}

export function createMockDesk(now = Math.floor(Date.now() / 1000)): CreditDesk {
	const worker = party('worker');
	const lender = party('lender');
	const hirer = party('hirer');
	const escrowId = 'escrow-sandbox-1';
	const adapter = new MockRgbAdapter();
	adapter.mintExact(
		`escrow:${escrowId}`,
		centsToUnits(ESCROW_CENTS),
		CREDIT_USDT_ASSET,
		'escrow-coin'
	);
	const desk: CreditDesk = {
		adapter,
		parties: { worker, lender, hirer },
		escrow: {
			escrowId,
			jobId: 'job-sandbox-1',
			asset: 'usdt_rgb',
			amountCents: ESCROW_CENTS,
			hirerPubkey: hirer.pubkey,
			workerPubkey: worker.pubkey,
			confirmations: 0
		},
		history: buildHistory(worker, hirer, now),
		events: [],
		advance: null,
		split: null,
		lenderLossCents: 0,
		notice: null,
		useNewcomer: false
	};
	return desk;
}

function requireAdvance(desk: CreditDesk): AdvanceRecord {
	if (!desk.advance) throw new Error('There is no advance yet');
	return desk.advance;
}

function remember(desk: CreditDesk, event: Event): void {
	if (!readVerifiedCreditEvent(event)) throw new Error('Credit event signature was rejected');
	desk.events = [...desk.events, event];
}

export function deskConfirmEscrow(desk: CreditDesk, now: number): CreditDesk {
	if (desk.escrow.confirmations >= 1) return desk;
	desk.escrow = {
		...desk.escrow,
		confirmations: 1,
		fundingTxid: '11'.repeat(32)
	};
	desk.notice = null;
	void now;
	return desk;
}

export function deskSetNewcomer(desk: CreditDesk, useNewcomer: boolean): CreditDesk {
	desk.useNewcomer = useNewcomer;
	return desk;
}

export function deskRequest(desk: CreditDesk, now: number): CreditDesk {
	if (!escrowIsFunded(desk.escrow)) {
		throw new Error('Escrow is not funded until the funding transaction has a confirmation');
	}
	if (desk.advance && desk.advance.status !== 'cancelled') {
		throw new Error('An advance is already open for this escrow');
	}
	const advance = createAdvanceOnNetwork({
		id: `adv-${desk.parties.worker.pubkey.slice(0, 12)}`,
		escrow: desk.escrow,
		reputation: reputationFor(desk),
		policy: CREDIT_POLICY,
		network: 'mock',
		now
	});
	desk.advance = advance;
	desk.split = null;
	desk.lenderLossCents = 0;
	remember(desk, signCreditEvent(requestBody(advance), desk.parties.worker.secret, now));
	desk.notice = null;
	return desk;
}

export function deskOffer(desk: CreditDesk, now: number): CreditDesk {
	const current = requireAdvance(desk);
	const advance = applyAdvance(
		current,
		{
			type: 'offer',
			lenderPubkey: desk.parties.lender.pubkey,
			advanceCents: current.advanceAmountCents,
			feeCents: current.feeAmountCents
		},
		now
	);
	desk.advance = advance;
	remember(desk, signCreditEvent(offerBody(advance), desk.parties.lender.secret, now));
	return desk;
}

export function deskAccept(desk: CreditDesk, now: number): CreditDesk {
	const advance = applyAdvance(requireAdvance(desk), { type: 'accept' }, now);
	desk.advance = advance;
	remember(desk, signCreditEvent(acceptBody(advance), desk.parties.worker.secret, now));
	return desk;
}

export async function deskFund(desk: CreditDesk, now: number): Promise<CreditDesk> {
	const current = requireAdvance(desk);
	const units = centsToUnits(current.advanceAmountCents);
	const existing = (await desk.adapter.listAllocations(CREDIT_USDT_ASSET)).find(
		(coin) => coin.owner === desk.parties.lender.pubkey && coin.units === units
	);
	const coin =
		existing ??
		desk.adapter.mintExact(desk.parties.lender.pubkey, units, CREDIT_USDT_ASSET, 'lender-advance');
	const draft = await desk.adapter.buildFullAllocationTransfer({
		assetId: CREDIT_USDT_ASSET,
		allocationId: coin.id,
		units,
		invoice: mockInvoice(desk.parties.worker.pubkey, units)
	});
	const sent = await desk.adapter.broadcast(draft);
	desk.advance = applyAdvance(current, { type: 'note-funding', txid: sent.txid }, now);
	desk.notice =
		'The advance transfer is broadcast and is not funded yet. It stays waiting until it has a confirmation. The test ledger used one whole coin of the exact advance.';
	return desk;
}

export async function deskConfirmFunding(desk: CreditDesk, now: number): Promise<CreditDesk> {
	const current = requireAdvance(desk);
	if (!current.fundingTxid) throw new Error('Nothing has been broadcast');
	desk.adapter.debugConfirm(current.fundingTxid, 1);
	const confirmations = await desk.adapter.confirmations(current.fundingTxid);
	desk.advance = applyAdvance(
		current,
		{ type: 'confirm-funding', txid: current.fundingTxid, confirmations },
		now
	);
	desk.notice = null;
	return desk;
}

export async function deskComplete(desk: CreditDesk, now: number): Promise<CreditDesk> {
	const current = requireAdvance(desk);
	if (!current.lenderPubkey) throw new Error('There is no lender on this advance');
	const split = completionSplit({
		escrowCents: current.escrowAmountCents,
		advanceCents: current.advanceAmountCents,
		feeCents: current.feeAmountCents,
		lenderPubkey: current.lenderPubkey,
		workerPubkey: current.workerPubkey
	});
	const settled = await desk.adapter.settle({
		assetId: CREDIT_USDT_ASSET,
		escrowUnits: centsToUnits(current.escrowAmountCents),
		legs: split.legs.map((leg) => ({
			owner: leg.pubkey,
			units: centsToUnits(leg.amountCents)
		}))
	});
	if (!settled.ok) throw new Error(settled.detail);
	desk.split = split;
	desk.advance = applyAdvance(current, { type: 'repay', split }, now);
	remember(desk, signCreditEvent(settledBody(desk.advance), desk.parties.hirer.secret, now));
	desk.lenderLossCents = 0;
	desk.notice = null;
	return desk;
}

export async function deskCancelJob(desk: CreditDesk, now: number): Promise<CreditDesk> {
	const current = requireAdvance(desk);
	const split = cancellationSplit({
		escrowCents: current.escrowAmountCents,
		hirerPubkey: current.hirerPubkey
	});
	const settled = await desk.adapter.settle({
		assetId: CREDIT_USDT_ASSET,
		escrowUnits: centsToUnits(current.escrowAmountCents),
		legs: split.legs.map((leg) => ({
			owner: leg.pubkey,
			units: centsToUnits(leg.amountCents)
		}))
	});
	if (!settled.ok) throw new Error(settled.detail);
	desk.split = split;
	desk.advance = applyAdvance(current, { type: 'default', split }, now);
	desk.lenderLossCents = current.advanceAmountCents;
	remember(desk, signCreditEvent(settledBody(desk.advance), desk.parties.hirer.secret, now));
	desk.notice =
		'The job was cancelled. The hirer is refunded the full escrow. The lender is not repaid.';
	return desk;
}

export function deskCancelOpen(desk: CreditDesk, now: number): CreditDesk {
	desk.advance = applyAdvance(requireAdvance(desk), { type: 'cancel' }, now);
	desk.notice = null;
	return desk;
}

export function deskStatus(desk: CreditDesk): string {
	if (!desk.advance) return escrowIsFunded(desk.escrow) ? 'escrow-funded' : 'escrow-unconfirmed';
	return displayStatus(desk.advance);
}

export async function heldCents(desk: CreditDesk, owner: string): Promise<number> {
	const coins = await desk.adapter.listAllocations(CREDIT_USDT_ASSET);
	const units = coins
		.filter((coin) => coin.owner === owner)
		.reduce((sum, coin) => sum + coin.units, 0);
	return units / 10_000;
}

export function releaseLines(split: PayoutSplit | null): {
	lender: number;
	worker: number;
	hirer: number;
	sum: number;
} {
	if (!split) return { lender: 0, worker: 0, hirer: 0, sum: 0 };
	return {
		lender: legAmount(split, 'lender'),
		worker: legAmount(split, 'worker'),
		hirer: legAmount(split, 'hirer'),
		sum: split.legs.reduce((total, leg) => total + leg.amountCents, 0)
	};
}
