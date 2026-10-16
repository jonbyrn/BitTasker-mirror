import { payEscrowLightning } from '$lib/stores/wallet/signet-lsp';
import { ESCROW_LNUSDT, lnUsdtOpen } from '../escrow-rail';
import type { EscrowProof } from './types';

/** LN USDT pays the LSP asset only. The faucet IFA stays on the on-chain rail. */
export async function payLnUsdt(
	channels: unknown,
	invoice: string,
	amount: number
): Promise<EscrowProof> {
	if (!lnUsdtOpen(channels)) throw new Error('LSP channel is not open');
	if (!Number.isSafeInteger(amount) || amount <= 0) {
		throw new Error('USDT amount must be a positive whole number');
	}
	const mappingId = await payEscrowLightning(invoice, ESCROW_LNUSDT, amount);
	if (!mappingId) throw new Error('LN USDT payment did not return a mapping id');
	return { kind: 'lsp_mapping', value: mappingId };
}
