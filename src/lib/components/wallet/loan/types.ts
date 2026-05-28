export interface FeeItem {
	label: string;
	amount: string;
	loading?: boolean;
}

export interface ExecStep {
	id: string;
	label: string;
	status: 'pending' | 'active' | 'complete' | 'failed';
}

export interface DocWalletEntry {
	walletId: string;
	walletName: string;
	walletType: 'builtin' | 'metamask' | 'walletconnect' | 'trezor' | 'ledger';
	docBalance: number;
	balanceAvailable: boolean;
	address?: string;
}
