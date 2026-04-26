/**
 * Service Acceptance Ledger
 *
 * @deprecated This module provides local persistence for service acceptance state.
 * It was designed for the v1 escrow implementation and handles edge cases like:
 * - Browser closes during transaction
 * - Network failures during acceptance publish
 * - Retry/reverification of uncertain acceptances
 *
 * For NEW service contracts using v2/NDK, use PaymentContractRune instead:
 * - Pending state: rune.isPending
 * - Status tracking: rune.statusEventsByNewest (from NDK Kind 31006 subscription)
 * - Transaction confirmation: rune.resolvePaymentIdFromTxHash()
 *
 * This module will be removed once all services are migrated to v2.
 * See docs/service-escrow-version-abstraction.md for migration details.
 */

import { browser } from '$app/environment';
import { Preferences } from '@capacitor/preferences';
import type {
	ServiceAcceptanceSnapshot,
	ServiceAcceptanceUnknownReasonCode
} from '$lib/types/service-quote';

export type ServiceAcceptanceLedgerState =
	| 'accepting'
	| 'accepted'
	| 'accept_failed'
	| 'accept_unknown';

export interface ServiceAcceptanceLedgerAttempt {
	attemptNumber: number;
	state: ServiceAcceptanceLedgerState;
	reasonCode?: ServiceAcceptanceUnknownReasonCode;
	transactionHash?: string;
	timestamp: number;
}

export interface ServiceAcceptanceLedgerEntry {
	proposalId: string;
	state: ServiceAcceptanceLedgerState;
	attemptCount: number;
	lastUpdatedAt: number;
	attempts: ServiceAcceptanceLedgerAttempt[];
}

export interface ServiceAcceptanceReplayEntry {
	escrowId: string;
	proposalId: string;
	proposalEventId: string;
	quoteRequestId: string;
	serviceId: string;
	serviceAddress: string;
	counterpartyPubkey: string;
	transactionHash: string;
	createdAtMs: number;
	lastUpdatedAtMs: number;
	attemptCount: number;
	acceptanceSnapshot?: ServiceAcceptanceSnapshot;
}

export interface ServiceAcceptanceConfirmedMonitorEntry {
	escrowId: string;
	proposalId: string;
	proposalEventId: string;
	quoteRequestId: string;
	serviceId: string;
	serviceAddress: string;
	counterpartyPubkey: string;
	transactionHash: string;
	publishedStatus: 'accepted' | 'accept_unknown' | 'contract_sync_pending';
	createdAtMs: number;
	lastUpdatedAtMs: number;
	lastVerifiedAtMs: number;
	attemptCount: number;
	acceptanceSnapshot: ServiceAcceptanceSnapshot;
}

const ledger = new Map<string, ServiceAcceptanceLedgerEntry>();
const replayLedger = new Map<string, ServiceAcceptanceReplayEntry>();
const confirmedMonitorLedger = new Map<string, ServiceAcceptanceConfirmedMonitorEntry>();
const SERVICE_ACCEPTANCE_REPLAY_STORAGE_KEY = 'bittasker.service-acceptance-replay';
const SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_STORAGE_KEY =
	'bittasker.service-acceptance-confirmed-monitor';
const DEFAULT_REPLAY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const SERVICE_ACCEPTANCE_REPLAY_RETRY_INTERVAL_MS = 30_000;
export const SERVICE_ACCEPTANCE_REPLAY_MAX_ATTEMPTS = 20;
export const SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_REVERIFY_INTERVAL_MS = 30_000;

function normalizeNonEmptyString(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

function normalizeReplayTimestamp(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		return null;
	}

	return Math.floor(value);
}

function normalizeReplayAttemptCount(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
		return null;
	}

	return Math.floor(value);
}

function sanitizeReplayEntry(raw: unknown): ServiceAcceptanceReplayEntry | null {
	if (!raw || typeof raw !== 'object') {
		return null;
	}

	const candidate = raw as Record<string, unknown>;
	const escrowId = normalizeNonEmptyString(candidate.escrowId);
	const proposalId = normalizeNonEmptyString(candidate.proposalId);
	const proposalEventId = normalizeNonEmptyString(candidate.proposalEventId);
	const quoteRequestId = normalizeNonEmptyString(candidate.quoteRequestId);
	const serviceId = normalizeNonEmptyString(candidate.serviceId);
	const serviceAddress = normalizeNonEmptyString(candidate.serviceAddress);
	const counterpartyPubkey = normalizeNonEmptyString(candidate.counterpartyPubkey);
	const transactionHash = normalizeNonEmptyString(candidate.transactionHash)?.toLowerCase() ?? null;
	const createdAtMs = normalizeReplayTimestamp(candidate.createdAtMs);
	const lastUpdatedAtMs = normalizeReplayTimestamp(candidate.lastUpdatedAtMs);
	const attemptCount = normalizeReplayAttemptCount(candidate.attemptCount);
	const acceptanceSnapshot = sanitizeAcceptanceSnapshot(candidate.acceptanceSnapshot);

	if (
		!escrowId ||
		!proposalId ||
		!proposalEventId ||
		!quoteRequestId ||
		!serviceId ||
		!serviceAddress ||
		!counterpartyPubkey ||
		!transactionHash ||
		createdAtMs === null ||
		lastUpdatedAtMs === null ||
		attemptCount === null
	) {
		return null;
	}

	return {
		escrowId,
		proposalId,
		proposalEventId,
		quoteRequestId,
		serviceId,
		serviceAddress,
		counterpartyPubkey,
		transactionHash,
		createdAtMs,
		lastUpdatedAtMs,
		attemptCount,
		acceptanceSnapshot
	};
}

function sanitizeConfirmedMonitorEntry(
	raw: unknown
): ServiceAcceptanceConfirmedMonitorEntry | null {
	if (!raw || typeof raw !== 'object') {
		return null;
	}

	const candidate = raw as Record<string, unknown>;
	const escrowId = normalizeNonEmptyString(candidate.escrowId);
	const proposalId = normalizeNonEmptyString(candidate.proposalId);
	const proposalEventId = normalizeNonEmptyString(candidate.proposalEventId);
	const quoteRequestId = normalizeNonEmptyString(candidate.quoteRequestId);
	const serviceId = normalizeNonEmptyString(candidate.serviceId);
	const serviceAddress = normalizeNonEmptyString(candidate.serviceAddress);
	const counterpartyPubkey = normalizeNonEmptyString(candidate.counterpartyPubkey);
	const transactionHash = normalizeNonEmptyString(candidate.transactionHash)?.toLowerCase() ?? null;
	const publishedStatus =
		candidate.publishedStatus === 'accept_unknown'
			? 'accept_unknown'
			: candidate.publishedStatus === 'contract_sync_pending'
				? 'contract_sync_pending'
				: candidate.publishedStatus === 'accepted'
					? 'accepted'
					: null;
	const createdAtMs = normalizeReplayTimestamp(candidate.createdAtMs);
	const lastUpdatedAtMs = normalizeReplayTimestamp(candidate.lastUpdatedAtMs);
	const lastVerifiedAtMs = normalizeReplayTimestamp(candidate.lastVerifiedAtMs);
	const attemptCount = normalizeReplayAttemptCount(candidate.attemptCount);
	const acceptanceSnapshot = sanitizeAcceptanceSnapshot(candidate.acceptanceSnapshot);

	if (
		!escrowId ||
		!proposalId ||
		!proposalEventId ||
		!quoteRequestId ||
		!serviceId ||
		!serviceAddress ||
		!counterpartyPubkey ||
		!transactionHash ||
		!publishedStatus ||
		createdAtMs === null ||
		lastUpdatedAtMs === null ||
		lastVerifiedAtMs === null ||
		attemptCount === null ||
		!acceptanceSnapshot
	) {
		return null;
	}

	return {
		escrowId,
		proposalId,
		proposalEventId,
		quoteRequestId,
		serviceId,
		serviceAddress,
		counterpartyPubkey,
		transactionHash,
		publishedStatus,
		createdAtMs,
		lastUpdatedAtMs,
		lastVerifiedAtMs,
		attemptCount,
		acceptanceSnapshot
	};
}

function sanitizeAcceptanceSnapshot(value: unknown): ServiceAcceptanceSnapshot | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}

	const candidate = value as Record<string, unknown>;
	if (
		typeof candidate.clientRskAddress !== 'string' ||
		typeof candidate.clientFeeTier !== 'number' ||
		typeof candidate.freelancerRskAddress !== 'string' ||
		typeof candidate.freelancerFeeTier !== 'number' ||
		typeof candidate.chainId !== 'number' ||
		typeof candidate.contractAddress !== 'string' ||
		typeof candidate.conversionFormulaVersion !== 'string' ||
		typeof candidate.conversionSnapshotId !== 'string' ||
		typeof candidate.btcUsdRateMicros !== 'number' ||
		typeof candidate.sourceTimestamp !== 'number' ||
		typeof candidate.sats !== 'string' ||
		typeof candidate.weiAmount !== 'string' ||
		typeof candidate.requiredConfirmations !== 'number' ||
		typeof candidate.finalityPolicyVersion !== 'string' ||
		typeof candidate.confirmationsAtVerification !== 'number' ||
		typeof candidate.verificationRpc !== 'string'
	) {
		return undefined;
	}

	return candidate as unknown as ServiceAcceptanceSnapshot;
}

async function readReplayState(
	nowMs = Date.now(),
	maxAgeMs = DEFAULT_REPLAY_MAX_AGE_MS
): Promise<Record<string, ServiceAcceptanceReplayEntry>> {
	if (!browser || !Number.isFinite(nowMs)) {
		return {};
	}

	try {
		const { value: raw } = await Preferences.get({ key: SERVICE_ACCEPTANCE_REPLAY_STORAGE_KEY });
		if (!raw) {
			return {};
		}

		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const nextState: Record<string, ServiceAcceptanceReplayEntry> = {};
		let mutated = false;

		for (const [escrowId, value] of Object.entries(parsed)) {
			const entry = sanitizeReplayEntry(value);
			if (!entry || entry.escrowId !== escrowId) {
				mutated = true;
				continue;
			}

			if (nowMs - entry.lastUpdatedAtMs > maxAgeMs) {
				mutated = true;
				continue;
			}

			nextState[escrowId] = entry;
		}

		if (mutated) {
			await persistReplayState(nextState);
		}

		return nextState;
	} catch {
		try {
			await Preferences.remove({ key: SERVICE_ACCEPTANCE_REPLAY_STORAGE_KEY });
		} catch {
			// Ignore storage cleanup failures; callers fall back to in-memory state.
		}
		return {};
	}
}

async function persistReplayState(
	state: Record<string, ServiceAcceptanceReplayEntry>
): Promise<void> {
	if (!browser) {
		return;
	}

	try {
		if (Object.keys(state).length === 0) {
			await Preferences.remove({ key: SERVICE_ACCEPTANCE_REPLAY_STORAGE_KEY });
			return;
		}

		await Preferences.set({
			key: SERVICE_ACCEPTANCE_REPLAY_STORAGE_KEY,
			value: JSON.stringify(state)
		});
	} catch {
		// Ignore storage persistence failures; in-memory replay remains active for this session.
	}
}

async function readConfirmedMonitorState(
	nowMs = Date.now(),
	maxAgeMs = DEFAULT_REPLAY_MAX_AGE_MS
): Promise<Record<string, ServiceAcceptanceConfirmedMonitorEntry>> {
	if (!browser || !Number.isFinite(nowMs)) {
		return {};
	}

	try {
		const { value: raw } = await Preferences.get({
			key: SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_STORAGE_KEY
		});
		if (!raw) {
			return {};
		}

		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const nextState: Record<string, ServiceAcceptanceConfirmedMonitorEntry> = {};
		let mutated = false;

		for (const [escrowId, value] of Object.entries(parsed)) {
			const entry = sanitizeConfirmedMonitorEntry(value);
			if (!entry || entry.escrowId !== escrowId) {
				mutated = true;
				continue;
			}

			if (nowMs - entry.lastUpdatedAtMs > maxAgeMs) {
				mutated = true;
				continue;
			}

			nextState[escrowId] = entry;
		}

		if (mutated) {
			await persistConfirmedMonitorState(nextState);
		}

		return nextState;
	} catch {
		try {
			await Preferences.remove({ key: SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_STORAGE_KEY });
		} catch {
			// Ignore storage cleanup failures; callers fall back to in-memory state.
		}
		return {};
	}
}

async function persistConfirmedMonitorState(
	state: Record<string, ServiceAcceptanceConfirmedMonitorEntry>
): Promise<void> {
	if (!browser) {
		return;
	}

	try {
		if (Object.keys(state).length === 0) {
			await Preferences.remove({ key: SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_STORAGE_KEY });
			return;
		}

		await Preferences.set({
			key: SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_STORAGE_KEY,
			value: JSON.stringify(state)
		});
	} catch {
		// Ignore storage persistence failures; in-memory monitor state remains active for this session.
	}
}

async function hydrateReplayLedger(): Promise<void> {
	const persisted = await readReplayState();
	replayLedger.clear();
	for (const entry of Object.values(persisted)) {
		replayLedger.set(entry.escrowId, entry);
	}
}

async function hydrateConfirmedMonitorLedger(): Promise<void> {
	const persisted = await readConfirmedMonitorState();
	confirmedMonitorLedger.clear();
	for (const entry of Object.values(persisted)) {
		confirmedMonitorLedger.set(entry.escrowId, entry);
	}
}

export function getAcceptanceLedgerEntry(proposalId: string): ServiceAcceptanceLedgerEntry | null {
	return ledger.get(proposalId) ?? null;
}

export function upsertAcceptanceLedgerEntry(
	proposalId: string,
	state: ServiceAcceptanceLedgerState,
	options: {
		reasonCode?: ServiceAcceptanceUnknownReasonCode;
		transactionHash?: string;
		timestamp?: number;
	} = {}
): ServiceAcceptanceLedgerEntry {
	const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
	const current = ledger.get(proposalId);
	const attemptNumber = (current?.attemptCount ?? 0) + 1;
	const entry: ServiceAcceptanceLedgerEntry = {
		proposalId,
		state,
		attemptCount: attemptNumber,
		lastUpdatedAt: timestamp,
		attempts: [
			...(current?.attempts ?? []),
			{
				attemptNumber,
				state,
				reasonCode: options.reasonCode,
				transactionHash: options.transactionHash,
				timestamp
			}
		]
	};
	ledger.set(proposalId, entry);
	return entry;
}

export async function clearAcceptanceLedger(): Promise<void> {
	ledger.clear();
	replayLedger.clear();
	confirmedMonitorLedger.clear();
	await persistReplayState({});
	await persistConfirmedMonitorState({});
}

export async function getAcceptanceReplayEntry(
	escrowId: string
): Promise<ServiceAcceptanceReplayEntry | null> {
	const normalizedEscrowId = normalizeNonEmptyString(escrowId);
	if (!normalizedEscrowId) {
		return null;
	}

	const cached = replayLedger.get(normalizedEscrowId);
	if (cached) {
		return cached;
	}

	await hydrateReplayLedger();
	return replayLedger.get(normalizedEscrowId) ?? null;
}

export async function upsertAcceptanceReplayEntry(
	input: Omit<ServiceAcceptanceReplayEntry, 'createdAtMs' | 'lastUpdatedAtMs' | 'attemptCount'> & {
		createdAtMs?: number;
		lastUpdatedAtMs?: number;
		attemptCount?: number;
	}
): Promise<ServiceAcceptanceReplayEntry> {
	const escrowId = normalizeNonEmptyString(input.escrowId);
	const proposalId = normalizeNonEmptyString(input.proposalId);
	const proposalEventId = normalizeNonEmptyString(input.proposalEventId);
	const quoteRequestId = normalizeNonEmptyString(input.quoteRequestId);
	const serviceId = normalizeNonEmptyString(input.serviceId);
	const serviceAddress = normalizeNonEmptyString(input.serviceAddress);
	const counterpartyPubkey = normalizeNonEmptyString(input.counterpartyPubkey);
	const transactionHash = normalizeNonEmptyString(input.transactionHash)?.toLowerCase();
	const nowMs = Math.floor(Date.now());

	if (
		!escrowId ||
		!proposalId ||
		!proposalEventId ||
		!quoteRequestId ||
		!serviceId ||
		!serviceAddress ||
		!counterpartyPubkey ||
		!transactionHash
	) {
		throw new Error('Acceptance replay entries require complete service contract identifiers.');
	}

	const current = await getAcceptanceReplayEntry(escrowId);
	const entry: ServiceAcceptanceReplayEntry = {
		escrowId,
		proposalId,
		proposalEventId,
		quoteRequestId,
		serviceId,
		serviceAddress,
		counterpartyPubkey,
		transactionHash,
		createdAtMs: current?.createdAtMs ?? input.createdAtMs ?? nowMs,
		lastUpdatedAtMs: input.lastUpdatedAtMs ?? nowMs,
		attemptCount: input.attemptCount ?? (current?.attemptCount ?? 0) + 1,
		acceptanceSnapshot: input.acceptanceSnapshot ?? current?.acceptanceSnapshot
	};

	replayLedger.set(escrowId, entry);
	const nextState = await readReplayState();
	nextState[escrowId] = entry;
	await persistReplayState(nextState);
	return entry;
}

export async function clearAcceptanceReplayEntry(escrowId: string): Promise<void> {
	const normalizedEscrowId = normalizeNonEmptyString(escrowId);
	if (!normalizedEscrowId) {
		return;
	}

	replayLedger.delete(normalizedEscrowId);
	const nextState = await readReplayState();
	delete nextState[normalizedEscrowId];
	await persistReplayState(nextState);
}

export async function listAcceptanceReplayEntries(
	nowMs = Date.now(),
	maxAgeMs = DEFAULT_REPLAY_MAX_AGE_MS
): Promise<ServiceAcceptanceReplayEntry[]> {
	const state = await readReplayState(nowMs, maxAgeMs);
	return Object.values(state).sort(
		(left, right) =>
			left.lastUpdatedAtMs - right.lastUpdatedAtMs || left.escrowId.localeCompare(right.escrowId)
	);
}

export async function getAcceptanceReplayEntriesDueForRetry(
	nowMs = Date.now(),
	options: {
		retryIntervalMs?: number;
		maxAttempts?: number;
		maxAgeMs?: number;
	} = {}
): Promise<ServiceAcceptanceReplayEntry[]> {
	const retryIntervalMs = options.retryIntervalMs ?? SERVICE_ACCEPTANCE_REPLAY_RETRY_INTERVAL_MS;
	const maxAttempts = options.maxAttempts ?? SERVICE_ACCEPTANCE_REPLAY_MAX_ATTEMPTS;
	const maxAgeMs = options.maxAgeMs ?? DEFAULT_REPLAY_MAX_AGE_MS;

	const entries = await listAcceptanceReplayEntries(nowMs, maxAgeMs);
	return entries.filter((entry) => {
		if (entry.attemptCount >= maxAttempts) {
			return false;
		}

		return nowMs - entry.lastUpdatedAtMs >= retryIntervalMs;
	});
}

export async function getAcceptanceConfirmedMonitorEntry(
	escrowId: string
): Promise<ServiceAcceptanceConfirmedMonitorEntry | null> {
	const normalizedEscrowId = normalizeNonEmptyString(escrowId);
	if (!normalizedEscrowId) {
		return null;
	}

	const cached = confirmedMonitorLedger.get(normalizedEscrowId);
	if (cached) {
		return cached;
	}

	await hydrateConfirmedMonitorLedger();
	return confirmedMonitorLedger.get(normalizedEscrowId) ?? null;
}

export async function upsertAcceptanceConfirmedMonitorEntry(
	input: Omit<
		ServiceAcceptanceConfirmedMonitorEntry,
		'createdAtMs' | 'lastUpdatedAtMs' | 'lastVerifiedAtMs' | 'attemptCount' | 'publishedStatus'
	> & {
		publishedStatus?: ServiceAcceptanceConfirmedMonitorEntry['publishedStatus'];
		createdAtMs?: number;
		lastUpdatedAtMs?: number;
		lastVerifiedAtMs?: number;
		attemptCount?: number;
	}
): Promise<ServiceAcceptanceConfirmedMonitorEntry> {
	const escrowId = normalizeNonEmptyString(input.escrowId);
	const proposalId = normalizeNonEmptyString(input.proposalId);
	const proposalEventId = normalizeNonEmptyString(input.proposalEventId);
	const quoteRequestId = normalizeNonEmptyString(input.quoteRequestId);
	const serviceId = normalizeNonEmptyString(input.serviceId);
	const serviceAddress = normalizeNonEmptyString(input.serviceAddress);
	const counterpartyPubkey = normalizeNonEmptyString(input.counterpartyPubkey);
	const transactionHash = normalizeNonEmptyString(input.transactionHash)?.toLowerCase();
	const acceptanceSnapshot = sanitizeAcceptanceSnapshot(input.acceptanceSnapshot);
	const nowMs = Math.floor(Date.now());

	if (
		!escrowId ||
		!proposalId ||
		!proposalEventId ||
		!quoteRequestId ||
		!serviceId ||
		!serviceAddress ||
		!counterpartyPubkey ||
		!transactionHash ||
		!acceptanceSnapshot
	) {
		throw new Error(
			'Acceptance confirmed monitor entries require complete identifiers and a valid acceptance snapshot.'
		);
	}

	const current = await getAcceptanceConfirmedMonitorEntry(escrowId);
	const entry: ServiceAcceptanceConfirmedMonitorEntry = {
		escrowId,
		proposalId,
		proposalEventId,
		quoteRequestId,
		serviceId,
		serviceAddress,
		counterpartyPubkey,
		transactionHash,
		publishedStatus: input.publishedStatus ?? current?.publishedStatus ?? 'accepted',
		createdAtMs: current?.createdAtMs ?? input.createdAtMs ?? nowMs,
		lastUpdatedAtMs: input.lastUpdatedAtMs ?? nowMs,
		lastVerifiedAtMs: input.lastVerifiedAtMs ?? current?.lastVerifiedAtMs ?? nowMs,
		attemptCount: input.attemptCount ?? (current?.attemptCount ?? 0) + 1,
		acceptanceSnapshot
	};

	confirmedMonitorLedger.set(escrowId, entry);
	const nextState = await readConfirmedMonitorState();
	nextState[escrowId] = entry;
	await persistConfirmedMonitorState(nextState);
	return entry;
}

export async function clearAcceptanceConfirmedMonitorEntry(escrowId: string): Promise<void> {
	const normalizedEscrowId = normalizeNonEmptyString(escrowId);
	if (!normalizedEscrowId) {
		return;
	}

	confirmedMonitorLedger.delete(normalizedEscrowId);
	const nextState = await readConfirmedMonitorState();
	delete nextState[normalizedEscrowId];
	await persistConfirmedMonitorState(nextState);
}

export async function listAcceptanceConfirmedMonitorEntries(
	nowMs = Date.now(),
	maxAgeMs = DEFAULT_REPLAY_MAX_AGE_MS
): Promise<ServiceAcceptanceConfirmedMonitorEntry[]> {
	const state = await readConfirmedMonitorState(nowMs, maxAgeMs);
	return Object.values(state).sort(
		(left, right) =>
			left.lastVerifiedAtMs - right.lastVerifiedAtMs || left.escrowId.localeCompare(right.escrowId)
	);
}

export async function getAcceptanceConfirmedMonitorEntriesDueForReverify(
	nowMs = Date.now(),
	options: {
		reverifyIntervalMs?: number;
		maxAgeMs?: number;
	} = {}
): Promise<ServiceAcceptanceConfirmedMonitorEntry[]> {
	const reverifyIntervalMs =
		options.reverifyIntervalMs ?? SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_REVERIFY_INTERVAL_MS;
	const maxAgeMs = options.maxAgeMs ?? DEFAULT_REPLAY_MAX_AGE_MS;

	const entries = await listAcceptanceConfirmedMonitorEntries(nowMs, maxAgeMs);
	return entries.filter((entry) => nowMs - entry.lastVerifiedAtMs >= reverifyIntervalMs);
}
