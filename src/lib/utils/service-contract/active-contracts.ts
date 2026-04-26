import type { ContractWithEvents } from '$lib/types/contract';
import type { Service } from '$lib/types/service.d';
import { ContractStatus } from '$lib/utils/contract/types';
import { buildServiceAddress } from '$lib/stores/service-quote-ui.store';

const TERMINAL_SERVICE_CONTRACT_STATUSES = new Set<ContractStatus>([
	ContractStatus.DisputeResolved,
	ContractStatus.DisputeUnresolved,
	ContractStatus.FundsReleased,
	ContractStatus.Cancelled,
	ContractStatus.Refunded,
	ContractStatus.FundsClaimed,
	ContractStatus.NoShow
]);

function getContractEscrowId(contract: ContractWithEvents): string {
	return contract.escrowData?.id ?? contract.contractEvent.content.escrowId;
}

function getLatestContractActivityTimestamp(contract: ContractWithEvents): number {
	const latestStatusTimestamp = contract.statusEvents.reduce(
		(latest, event) => Math.max(latest, event.created_at ?? 0),
		0
	);
	return Math.max(contract.contractEvent.created_at ?? 0, latestStatusTimestamp);
}

function getServiceContractKeys(service: Service): Set<string> {
	const keys = new Set<string>();
	try {
		const serviceAddress = buildServiceAddress(service);
		if (serviceAddress) {
			keys.add(serviceAddress);
		}
	} catch {
		// Fall back to the other stable service identifiers when the listing is missing its d-tag.
	}
	if (service.uniqueId) {
		keys.add(service.uniqueId);
	}
	if (service.id) {
		keys.add(service.id);
	}
	return keys;
}

/** Returns true when the contract belongs to the service domain and is not terminal yet. */
export function isActiveServiceContract(contract: ContractWithEvents): boolean {
	if ((contract.contractEvent.content.contextType ?? 'task') !== 'service') {
		return false;
	}

	return !TERMINAL_SERVICE_CONTRACT_STATUSES.has(contract.status);
}

/** Filters contracts down to active entries that still match the provided service identity. */
export function getActiveServiceContractsForService(
	contracts: ContractWithEvents[],
	service: Service
): ContractWithEvents[] {
	const serviceKeys = getServiceContractKeys(service);

	return contracts.filter((contract) => {
		if (!isActiveServiceContract(contract)) {
			return false;
		}

		const content = contract.contractEvent.content;
		return [content.serviceAddress, content.contextId, content.serviceId].some(
			(value) => typeof value === 'string' && serviceKeys.has(value)
		);
	});
}

/**
 * Orders active service contracts by latest activity, then creation time, then lexical escrow id.
 */
export function compareActiveServiceContracts(
	left: ContractWithEvents,
	right: ContractWithEvents
): number {
	const activityDelta =
		getLatestContractActivityTimestamp(right) - getLatestContractActivityTimestamp(left);
	if (activityDelta !== 0) {
		return activityDelta;
	}

	const creationDelta = (right.contractEvent.created_at ?? 0) - (left.contractEvent.created_at ?? 0);
	if (creationDelta !== 0) {
		return creationDelta;
	}

	return getContractEscrowId(left).localeCompare(getContractEscrowId(right));
}

/** Selects the canonical active-contract destination used by service-management shortcuts. */
export function selectPrimaryActiveServiceContract(
	contracts: ContractWithEvents[],
	service: Service
): ContractWithEvents | null {
	const matchingContracts = getActiveServiceContractsForService(contracts, service).sort(
		compareActiveServiceContracts
	);
	return matchingContracts[0] ?? null;
}
