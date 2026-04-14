/** Rootstock Blockscout URL for a transaction hash. */
export function rskExplorerTxUrl(txHash: string): string {
	const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	if (rskNetwork === 'mainnet') {
		return `https://rootstock.blockscout.com/tx/${txHash}`;
	}
	return `https://rootstock-testnet.blockscout.com/tx/${txHash}`;
}
