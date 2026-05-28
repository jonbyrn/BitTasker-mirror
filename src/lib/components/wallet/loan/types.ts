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
