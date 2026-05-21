declare module 'coinselect' {
	export function accumulative(
		utxos: Array<{ txId: string; vout: number; value: number }>,
		target: number,
		feeRate: number
	): {
		inputs?: Array<{ txId: string; vout: number; value: number }>;
		outputs?: Array<{ address?: string; value: number }>;
		fee: number;
	};
}
