import type { NDKPaymentContract } from '$lib/nostr/events/contract';

let published = $state<NDKPaymentContract[]>([]);

/** Keep a contract we just published so the open list updates before the relay echoes it. */
export function rememberPublishedContract(contract: NDKPaymentContract): void {
	const id = contract.id;
	if (!id) return;
	if (published.some((item) => item.id === id)) return;
	published = [...published, contract];
}

export function localPublishedContracts(): NDKPaymentContract[] {
	return published;
}

export function resetLocalPublishedContracts(): void {
	published = [];
}
