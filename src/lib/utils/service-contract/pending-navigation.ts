export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface PendingServiceContractNavigation {
	transactionHash: string;
	createdAtMs: number;
}

export interface ContractCreationNavigationEvent {
	escrowId?: string;
	transactionHash?: string;
	transactionHashes?: string[];
}

export interface PendingServiceContractNavigationRouteState {
	activeTabId: string;
	contractsContext: string;
	highlightEscrowId: string | null;
}

export const PENDING_SERVICE_CONTRACT_NAVIGATION_KEY =
	'bittasker.pending-service-contract-navigation';
export const DEFAULT_PENDING_SERVICE_CONTRACT_MAX_AGE_MS = 15 * 60 * 1000;

function normalizeTransactionHash(transactionHash: unknown): string | null {
	if (typeof transactionHash !== 'string') {
		return null;
	}

	const trimmed = transactionHash.trim();
	return trimmed ? trimmed.toLowerCase() : null;
}

function isFinitePositiveNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function createPendingServiceContractNavigation(
	transactionHash: string,
	nowMs = Date.now()
): PendingServiceContractNavigation {
	const normalizedTransactionHash = normalizeTransactionHash(transactionHash);
	if (!normalizedTransactionHash) {
		throw new Error('Pending service contract navigation requires a transaction hash.');
	}
	if (!isFinitePositiveNumber(nowMs)) {
		throw new Error('Pending service contract navigation requires a valid timestamp.');
	}

	return {
		transactionHash: normalizedTransactionHash,
		createdAtMs: nowMs
	};
}

export function writePendingServiceContractNavigation(
	storage: StorageLike | null | undefined,
	transactionHash: string,
	nowMs = Date.now()
): PendingServiceContractNavigation | null {
	if (!storage) {
		return null;
	}

	const pendingNavigation = createPendingServiceContractNavigation(transactionHash, nowMs);
	storage.setItem(
		PENDING_SERVICE_CONTRACT_NAVIGATION_KEY,
		JSON.stringify(pendingNavigation)
	);
	return pendingNavigation;
}

export function clearPendingServiceContractNavigation(
	storage: StorageLike | null | undefined
): void {
	storage?.removeItem(PENDING_SERVICE_CONTRACT_NAVIGATION_KEY);
}

export function readPendingServiceContractNavigation(
	storage: StorageLike | null | undefined,
	nowMs = Date.now(),
	maxAgeMs = DEFAULT_PENDING_SERVICE_CONTRACT_MAX_AGE_MS
): PendingServiceContractNavigation | null {
	if (!storage) {
		return null;
	}

	const serialized = storage.getItem(PENDING_SERVICE_CONTRACT_NAVIGATION_KEY);
	if (!serialized) {
		return null;
	}

	try {
		const parsed = JSON.parse(serialized) as Partial<PendingServiceContractNavigation>;
		const normalizedTransactionHash = normalizeTransactionHash(parsed.transactionHash);
		if (!normalizedTransactionHash || !isFinitePositiveNumber(parsed.createdAtMs)) {
			clearPendingServiceContractNavigation(storage);
			return null;
		}
		if (!isFinitePositiveNumber(nowMs) || nowMs - parsed.createdAtMs > maxAgeMs) {
			clearPendingServiceContractNavigation(storage);
			return null;
		}

		return {
			transactionHash: normalizedTransactionHash,
			createdAtMs: parsed.createdAtMs
		};
	} catch {
		clearPendingServiceContractNavigation(storage);
		return null;
	}
}

export function matchesPendingServiceContractNavigation(
	pendingNavigation: PendingServiceContractNavigation | null | undefined,
	transactionHash: string | null | undefined,
	transactionHashes: string[] = []
): boolean {
	if (!pendingNavigation) {
		return false;
	}

	const candidateHashes = [transactionHash, ...transactionHashes]
		.map((value) => normalizeTransactionHash(value))
		.filter((value): value is string => Boolean(value));

	return candidateHashes.includes(pendingNavigation.transactionHash);
}

export function consumePendingServiceContractNavigation(
	storage: StorageLike | null | undefined,
	event: ContractCreationNavigationEvent,
	nowMs = Date.now(),
	maxAgeMs = DEFAULT_PENDING_SERVICE_CONTRACT_MAX_AGE_MS
): string | null {
	const pendingNavigation = readPendingServiceContractNavigation(storage, nowMs, maxAgeMs);
	if (!pendingNavigation || !event.escrowId) {
		return null;
	}
	if (
		!matchesPendingServiceContractNavigation(
			pendingNavigation,
			event.transactionHash,
			event.transactionHashes ?? []
		)
	) {
		return null;
	}

	clearPendingServiceContractNavigation(storage);
	return event.escrowId;
}

export function consumePendingServiceContractNavigationForContractsPage(
	storage: StorageLike | null | undefined,
	event: ContractCreationNavigationEvent,
	routeState: PendingServiceContractNavigationRouteState,
	nowMs = Date.now(),
	maxAgeMs = DEFAULT_PENDING_SERVICE_CONTRACT_MAX_AGE_MS
): string | null {
	if (
		routeState.activeTabId !== 'contracts' ||
		routeState.contractsContext !== 'services' ||
		routeState.highlightEscrowId
	) {
		return null;
	}

	return consumePendingServiceContractNavigation(storage, event, nowMs, maxAgeMs);
}
