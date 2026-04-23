import { browser, dev } from '$app/environment';
import { ethers } from 'ethers';
import type { ContractWithEvents } from '$lib/types/contract';
import type {
	ServiceAcceptanceSnapshot,
	ServiceProposalEvent,
	ServiceProposalStatusEvent,
	ServiceQuoteTimelineEntry
} from '$lib/types/service-quote';
import {
	createServiceAcceptanceSnapshot,
	getConfiguredRskChainId,
	getConfiguredRskContractAddress,
	getConfiguredVerificationRpcLabel
} from '$lib/utils/service-contract/acceptance-snapshot';
import {
	recoverServiceQuoteAcceptanceContract,
	type RecoverServiceQuoteAcceptanceInput,
	type RecoverServiceQuoteAcceptanceResult
} from '$lib/utils/service-contract/recover-quote-acceptance';

export type QuoteAcceptanceReconciliationResult =
	| {
			status: 'no_change';
	  }
	| {
			status: 'accept_failed';
			transactionHash: string;
			error?: string;
	  }
	| {
			status: 'accepted';
			escrowId: string;
			transactionHash: string;
			acceptanceSnapshot: ServiceAcceptanceSnapshot;
			matchedContract: ContractWithEvents;
	  }
	| {
			status: 'contract_sync_pending';
			escrowId?: string;
			transactionHash: string;
	  };

interface QuoteAcceptanceRecoveryCandidate {
	proposal: ServiceProposalEvent;
	statusEvent?: ServiceProposalStatusEvent;
	transactionHash?: string;
	escrowId?: string;
	allowsContractOnlyRecovery?: boolean;
}

export interface ReconcileQuoteAcceptanceInput {
	timeline: ServiceQuoteTimelineEntry;
	loadedContracts?: ContractWithEvents[];
	queryContracts?: () => Promise<ContractWithEvents[]>;
	recoverContract?: (
		input: RecoverServiceQuoteAcceptanceInput
	) => Promise<RecoverServiceQuoteAcceptanceResult>;
}

function logQuoteAcceptanceReconciliation(event: string, details: Record<string, unknown>): void {
	if (!browser || !dev) {
		return;
	}

	console.info('[serviceQuoteReconcile]', event, details);
}

function normalizeTransactionHash(transactionHash: string | null | undefined): string | null {
	if (typeof transactionHash !== 'string') {
		return null;
	}

	const normalized = transactionHash.trim().toLowerCase();
	return normalized.length > 0 ? normalized : null;
}

function getLatestProposalStatusEvents(
	timeline: ServiceQuoteTimelineEntry
): ServiceProposalStatusEvent[] {
	const proposalId = timeline.latestProposal?.content.proposalId;
	if (!proposalId) {
		return [];
	}

	return [...(timeline.statusEventsByProposalId[proposalId] ?? [])].sort((left, right) => {
		if (left.created_at !== right.created_at) {
			return left.created_at - right.created_at;
		}

		return left.id.localeCompare(right.id);
	});
}

function getQuoteAcceptanceRecoveryCandidate(
	timeline: ServiceQuoteTimelineEntry
): QuoteAcceptanceRecoveryCandidate | null {
	const proposal = timeline.latestProposal;
	if (!proposal) {
		return null;
	}

	const statusEvent = [...getLatestProposalStatusEvents(timeline)]
		.reverse()
		.find(
			(event) =>
				(event.content.status === 'accept_unknown' ||
					event.content.status === 'contract_sync_pending' ||
					event.content.status === 'accepting' ||
					event.content.status === 'accepted') &&
				(typeof event.content.transactionHash === 'string' ||
					typeof event.content.escrowId === 'string')
		);

	const transactionHash =
		normalizeTransactionHash(statusEvent?.content.transactionHash) ??
		normalizeTransactionHash(timeline.resolvedTerminalEvent?.content.transactionHash);
	const escrowId =
		statusEvent?.content.escrowId ??
		timeline.resolvedTerminalEvent?.content.escrowId ??
		timeline.linkedEscrowId;

	if (!transactionHash && !escrowId && timeline.resolvedStatus === 'accepting') {
		logQuoteAcceptanceReconciliation('candidate-selected-contract-only', {
			quoteRequestId: timeline.request.content.quoteRequestId,
			proposalId: proposal.content.proposalId,
			resolvedStatus: timeline.resolvedStatus
		});
		return {
			proposal,
			statusEvent,
			allowsContractOnlyRecovery: true
		};
	}

	if (
		!transactionHash &&
		!escrowId &&
		timeline.resolvedStatus !== 'accept_unknown' &&
		timeline.resolvedStatus !== 'contract_sync_pending'
	) {
		logQuoteAcceptanceReconciliation('candidate-missing-recovery-signal', {
			quoteRequestId: timeline.request.content.quoteRequestId,
			proposalId: proposal.content.proposalId,
			resolvedStatus: timeline.resolvedStatus
		});
		return null;
	}

	logQuoteAcceptanceReconciliation('candidate-selected', {
		quoteRequestId: timeline.request.content.quoteRequestId,
		proposalId: proposal.content.proposalId,
		resolvedStatus: timeline.resolvedStatus,
		statusEventStatus: statusEvent?.content.status ?? null,
		transactionHash: transactionHash ?? null,
		escrowId: escrowId ?? null
	});
	return {
		proposal,
		statusEvent,
		transactionHash: transactionHash ?? undefined,
		escrowId: escrowId?.trim() || undefined,
		allowsContractOnlyRecovery: false
	};
}

type QuoteContractMatchStrategy =
	| 'proposalId'
	| 'serviceAddressAndQuoteRequestId'
	| 'quoteRequestId';

function matchesQuoteContract(
	contract: ContractWithEvents,
	timeline: ServiceQuoteTimelineEntry,
	candidate: QuoteAcceptanceRecoveryCandidate
): boolean {
	const content = contract.contractEvent.content;
	if (content.contextType !== 'service' || content.purchaseMode !== 'quote') {
		return false;
	}

	const normalizedCandidateHash = normalizeTransactionHash(candidate.transactionHash);
	const normalizedContractHash = normalizeTransactionHash(content.transactionHash);

	return (
		(content.serviceAddress != null &&
			content.serviceAddress === timeline.request.content.serviceAddress &&
			content.quoteRequestId != null &&
			content.quoteRequestId === timeline.request.content.quoteRequestId) ||
		(content.proposalId != null && content.proposalId === candidate.proposal.content.proposalId) ||
		(content.quoteRequestId != null &&
			content.quoteRequestId === timeline.request.content.quoteRequestId) ||
		(candidate.escrowId != null && content.escrowId === candidate.escrowId) ||
		(normalizedCandidateHash != null &&
			normalizedContractHash != null &&
			normalizedCandidateHash === normalizedContractHash)
	);
}

function dedupeContractsByEventId(contracts: ContractWithEvents[]): ContractWithEvents[] {
	const seen = new Set<string>();
	const deduped: ContractWithEvents[] = [];

	for (const contract of contracts) {
		if (seen.has(contract.contractEvent.id)) {
			continue;
		}

		seen.add(contract.contractEvent.id);
		deduped.push(contract);
	}

	return deduped;
}

function chooseUniqueContractMatch(
	contracts: ContractWithEvents[],
	candidate: QuoteAcceptanceRecoveryCandidate,
	strategy: QuoteContractMatchStrategy
): ContractWithEvents | null {
	const filtered = contracts.filter((contract) => {
		const content = contract.contractEvent.content;
		switch (strategy) {
			case 'proposalId':
				return content.proposalId === candidate.proposal.content.proposalId;
			case 'serviceAddressAndQuoteRequestId':
				return (
					content.serviceAddress === candidate.proposal.content.serviceAddress &&
					content.quoteRequestId === candidate.proposal.content.quoteRequestId
				);
			case 'quoteRequestId':
				return content.quoteRequestId === candidate.proposal.content.quoteRequestId;
		}
	});

	return filtered.length === 1 ? filtered[0] : null;
}

function findDeterministicContractOnlyMatch(
	contracts: ContractWithEvents[],
	candidate: QuoteAcceptanceRecoveryCandidate
): ContractWithEvents | null {
	const serviceQuoteContracts = dedupeContractsByEventId(
		contracts.filter((contract) => {
			const content = contract.contractEvent.content;
			return content.contextType === 'service' && content.purchaseMode === 'quote';
		})
	);

	return (
		chooseUniqueContractMatch(serviceQuoteContracts, candidate, 'proposalId') ??
		chooseUniqueContractMatch(
			serviceQuoteContracts,
			candidate,
			'serviceAddressAndQuoteRequestId'
		) ??
		chooseUniqueContractMatch(serviceQuoteContracts, candidate, 'quoteRequestId')
	);
}

async function findMatchingQuoteContract(
	timeline: ServiceQuoteTimelineEntry,
	candidate: QuoteAcceptanceRecoveryCandidate,
	loadedContracts: ContractWithEvents[],
	queryContracts?: () => Promise<ContractWithEvents[]>
): Promise<ContractWithEvents | null> {
	if (candidate.allowsContractOnlyRecovery) {
		const queriedContracts = queryContracts ? await queryContracts() : [];
		const contractOnlyMatch = findDeterministicContractOnlyMatch(
			dedupeContractsByEventId([...loadedContracts, ...queriedContracts]),
			candidate
		);
		logQuoteAcceptanceReconciliation('contract-only-query-result', {
			quoteRequestId: timeline.request.content.quoteRequestId,
			proposalId: candidate.proposal.content.proposalId,
			loadedContracts: loadedContracts.length,
			queriedContracts: queriedContracts.length,
			matchedEscrowId: contractOnlyMatch?.contractEvent.content.escrowId ?? null,
			matchedTransactionHash: contractOnlyMatch?.contractEvent.content.transactionHash ?? null
		});
		return contractOnlyMatch;
	}

	const fromLoaded = loadedContracts.find((contract) =>
		matchesQuoteContract(contract, timeline, candidate)
	);
	if (fromLoaded) {
		logQuoteAcceptanceReconciliation('contract-match-loaded', {
			quoteRequestId: timeline.request.content.quoteRequestId,
			proposalId: candidate.proposal.content.proposalId,
			escrowId: fromLoaded.contractEvent.content.escrowId,
			transactionHash: fromLoaded.contractEvent.content.transactionHash ?? null
		});
		return fromLoaded;
	}

	if (!queryContracts) {
		logQuoteAcceptanceReconciliation('contract-match-unavailable', {
			quoteRequestId: timeline.request.content.quoteRequestId,
			proposalId: candidate.proposal.content.proposalId,
			loadedContracts: loadedContracts.length
		});
		return null;
	}

	const queriedContracts = await queryContracts();
	const matchedContract =
		queriedContracts.find((contract) => matchesQuoteContract(contract, timeline, candidate)) ??
		null;
	logQuoteAcceptanceReconciliation('contract-query-result', {
		quoteRequestId: timeline.request.content.quoteRequestId,
		proposalId: candidate.proposal.content.proposalId,
		queriedContracts: queriedContracts.length,
		matchedEscrowId: matchedContract?.contractEvent.content.escrowId ?? null
	});
	return matchedContract;
}

function deriveBtcUsdRateMicros(amountUsdt: string, amountRbtc: string): number | null {
	const usdValue = Number(amountUsdt);
	const rbtcValue = Number(amountRbtc);
	if (
		!Number.isFinite(usdValue) ||
		usdValue <= 0 ||
		!Number.isFinite(rbtcValue) ||
		rbtcValue <= 0
	) {
		return null;
	}

	const micros = Math.round((usdValue / rbtcValue) * 1_000_000);
	return Number.isInteger(micros) && micros > 0 ? micros : null;
}

export function buildRecoveredQuoteAcceptanceSnapshot(
	proposal: ServiceProposalEvent,
	contract: ContractWithEvents,
	transactionHash: string
): ServiceAcceptanceSnapshot | null {
	const contractAmount = contract.contractEvent.content.amount;
	const btcUsdRateMicros = deriveBtcUsdRateMicros(proposal.content.amountUsdt, contractAmount);
	if (!btcUsdRateMicros) {
		logQuoteAcceptanceReconciliation('snapshot-build-failed', {
			proposalId: proposal.content.proposalId,
			quoteRequestId: proposal.content.quoteRequestId,
			reason: 'invalid_btc_usd_rate',
			amountUsdt: proposal.content.amountUsdt,
			amountRbtc: contractAmount
		});
		return null;
	}

	const clientRskAddress =
		contract.contractEvent.content.clientRskAddress ?? contract.escrowData.client;
	if (!clientRskAddress) {
		logQuoteAcceptanceReconciliation('snapshot-build-failed', {
			proposalId: proposal.content.proposalId,
			quoteRequestId: proposal.content.quoteRequestId,
			reason: 'missing_client_rsk_address',
			escrowId: contract.contractEvent.content.escrowId
		});
		return null;
	}

	try {
		const snapshot = createServiceAcceptanceSnapshot({
			clientRskAddress,
			clientFeeTier: 1,
			freelancerRskAddress: proposal.content.freelancerRskAddress,
			freelancerFeeTier: proposal.content.freelancerFeeTier,
			chainId: getConfiguredRskChainId(),
			contractAddress:
				contract.contractEvent.content.contractAddress ?? getConfiguredRskContractAddress(),
			purchaseMode: 'quote',
			proposalId: proposal.content.proposalId,
			btcUsdRateMicros,
			weiAmount: ethers.parseEther(contractAmount).toString(),
			sourceTimestamp: contract.contractEvent.created_at ?? proposal.content.timestamp,
			confirmationsAtVerification: 3,
			verificationRpc: getConfiguredVerificationRpcLabel()
		});
		logQuoteAcceptanceReconciliation('snapshot-built', {
			proposalId: proposal.content.proposalId,
			quoteRequestId: proposal.content.quoteRequestId,
			escrowId: contract.contractEvent.content.escrowId,
			transactionHash
		});
		return snapshot;
	} catch {
		logQuoteAcceptanceReconciliation('snapshot-build-failed', {
			proposalId: proposal.content.proposalId,
			quoteRequestId: proposal.content.quoteRequestId,
			reason: 'snapshot_constructor_error',
			escrowId: contract.contractEvent.content.escrowId
		});
		return null;
	}
}

function buildRecoverInput(
	timeline: ServiceQuoteTimelineEntry,
	candidate: QuoteAcceptanceRecoveryCandidate,
	matchedContract: ContractWithEvents | null
): RecoverServiceQuoteAcceptanceInput | null {
	if (!candidate.transactionHash) {
		return null;
	}

	return {
		transactionHash: candidate.transactionHash,
		freelancerPubkey: candidate.proposal.pubkey,
		clientRskAddress:
			matchedContract?.contractEvent.content.clientRskAddress ??
			matchedContract?.escrowData.client ??
			undefined,
		amountRbtc: matchedContract?.contractEvent.content.amount,
		estimatedStartTime: candidate.proposal.content.estimatedStartTime,
		estimatedCompletionTime: candidate.proposal.content.estimatedEndTime,
		serviceId: timeline.request.content.serviceId,
		serviceAddress: timeline.request.content.serviceAddress,
		serviceTitle: timeline.request.content.inquiry.title,
		serviceDescription: timeline.request.content.inquiry.description,
		contextVersionRef: candidate.proposal.content.pricingSnapshot.serviceVersionRef,
		quoteRequestId: timeline.request.content.quoteRequestId,
		proposalId: candidate.proposal.content.proposalId,
		proposalEventId: candidate.proposal.id,
		selectedTierId:
			candidate.proposal.content.pricingSnapshot.tierId ?? timeline.request.content.tierId,
		pricingSnapshot: candidate.proposal.content.pricingSnapshot,
		agreementSnapshot: undefined,
		escrowId: candidate.escrowId
	};
}

export async function reconcileQuoteAcceptanceTimeline(
	input: ReconcileQuoteAcceptanceInput
): Promise<QuoteAcceptanceReconciliationResult> {
	const candidate = getQuoteAcceptanceRecoveryCandidate(input.timeline);
	if (!candidate) {
		return { status: 'no_change' };
	}
	logQuoteAcceptanceReconciliation('reconcile-start', {
		quoteRequestId: input.timeline.request.content.quoteRequestId,
		proposalId: candidate.proposal.content.proposalId,
		resolvedStatus: input.timeline.resolvedStatus,
		transactionHash: candidate.transactionHash ?? null,
		escrowId: candidate.escrowId ?? null,
		loadedContracts: input.loadedContracts?.length ?? 0
	});

	const loadedContracts = input.loadedContracts ?? [];
	const recoverContract = input.recoverContract ?? recoverServiceQuoteAcceptanceContract;

	let matchedContract = await findMatchingQuoteContract(
		input.timeline,
		candidate,
		loadedContracts,
		input.queryContracts
	);

	if (matchedContract) {
		const recoveredHash =
			candidate.transactionHash ??
			normalizeTransactionHash(matchedContract.contractEvent.content.transactionHash) ??
			undefined;
		if (recoveredHash) {
			const acceptanceSnapshot = buildRecoveredQuoteAcceptanceSnapshot(
				candidate.proposal,
				matchedContract,
				recoveredHash
			);
			if (acceptanceSnapshot) {
				logQuoteAcceptanceReconciliation('reconcile-accepted-from-contract-match', {
					quoteRequestId: input.timeline.request.content.quoteRequestId,
					proposalId: candidate.proposal.content.proposalId,
					escrowId: matchedContract.contractEvent.content.escrowId,
					transactionHash: recoveredHash
				});
				return {
					status: 'accepted',
					escrowId: matchedContract.contractEvent.content.escrowId,
					transactionHash: recoveredHash,
					acceptanceSnapshot,
					matchedContract
				};
			}
		}
	}

	const recoverInput = buildRecoverInput(input.timeline, candidate, matchedContract);
	if (!recoverInput) {
		logQuoteAcceptanceReconciliation('reconcile-no-recover-input', {
			quoteRequestId: input.timeline.request.content.quoteRequestId,
			proposalId: candidate.proposal.content.proposalId
		});
		return { status: 'no_change' };
	}

	const recoveryResult = await recoverContract(recoverInput);
	logQuoteAcceptanceReconciliation('reconcile-recovery-result', {
		quoteRequestId: input.timeline.request.content.quoteRequestId,
		proposalId: candidate.proposal.content.proposalId,
		status: recoveryResult.status,
		transactionHash: recoveryResult.transactionHash,
		escrowId: recoveryResult.escrowId ?? null,
		error: 'error' in recoveryResult ? (recoveryResult.error ?? null) : null
	});
	if (recoveryResult.status === 'failed') {
		return {
			status: 'accept_failed',
			transactionHash: recoveryResult.transactionHash,
			error: recoveryResult.error
		};
	}

	if (recoveryResult.status === 'funding_pending') {
		return {
			status: 'contract_sync_pending',
			transactionHash: recoveryResult.transactionHash,
			escrowId: recoveryResult.escrowId
		};
	}

	if (recoveryResult.escrowId) {
		candidate.escrowId = recoveryResult.escrowId;
	}

	if (recoveryResult.transactionHash) {
		candidate.transactionHash = recoveryResult.transactionHash;
	}

	if (recoveryResult.status === 'contract_ready') {
		matchedContract = await findMatchingQuoteContract(
			input.timeline,
			candidate,
			loadedContracts,
			input.queryContracts
		);
		if (matchedContract && candidate.transactionHash) {
			const acceptanceSnapshot = buildRecoveredQuoteAcceptanceSnapshot(
				candidate.proposal,
				matchedContract,
				candidate.transactionHash
			);
			if (acceptanceSnapshot) {
				logQuoteAcceptanceReconciliation('reconcile-accepted-after-recovery', {
					quoteRequestId: input.timeline.request.content.quoteRequestId,
					proposalId: candidate.proposal.content.proposalId,
					escrowId: matchedContract.contractEvent.content.escrowId,
					transactionHash: candidate.transactionHash
				});
				return {
					status: 'accepted',
					escrowId: matchedContract.contractEvent.content.escrowId,
					transactionHash: candidate.transactionHash,
					acceptanceSnapshot,
					matchedContract
				};
			}
		}
	}

	if (candidate.transactionHash) {
		logQuoteAcceptanceReconciliation('reconcile-remains-syncing', {
			quoteRequestId: input.timeline.request.content.quoteRequestId,
			proposalId: candidate.proposal.content.proposalId,
			transactionHash: candidate.transactionHash,
			escrowId: candidate.escrowId ?? null
		});
		return {
			status: 'contract_sync_pending',
			escrowId: candidate.escrowId,
			transactionHash: candidate.transactionHash
		};
	}

	return { status: 'no_change' };
}
