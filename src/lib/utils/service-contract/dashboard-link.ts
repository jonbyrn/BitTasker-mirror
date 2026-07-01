export function buildContractsDashboardLink({
	baseUrl,
	contextType,
	escrowId
}: {
	baseUrl: string;
	contextType?: string | null;
	escrowId?: string | null;
}): string {
	const params = new URLSearchParams({
		tab: 'contracts'
	});

	if (contextType === 'service') {
		params.set('context', 'services');
	}

	const normalizedEscrowId = escrowId?.trim();
	if (normalizedEscrowId) {
		params.set('highlight', normalizedEscrowId);
	}

	return `${baseUrl.replace(/\/$/, '')}/hiring/contracts?${params.toString()}`;
}
