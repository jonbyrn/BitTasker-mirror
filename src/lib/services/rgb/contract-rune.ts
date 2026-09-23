/**
 * ContractRune — E2E escrow contract lifecycle state machine.
 */

import { state } from '$lib/stores/wallet/wallet-state';
import { prepareRgbOnchainSend } from '$lib/stores/wallet/prepare-rgb-send';

export type ContractStatus =
	| 'idle'
	| 'draft'
	| 'funding'
	| 'funded'
	| 'work_in_progress'
	| 'work_submitted'
	| 'released'
	| 'failed'
	| 'disputed'
	| 'cancelled';

export type FundingState =
	| 'awaiting_invoice'
	| 'awaiting_payment'
	| 'confirming'
	| 'confirmed'
	| 'failed';

export interface ContractRuneSnapshot {
	status: ContractStatus;
	fundingState: FundingState | null;
	fundingInvoice: string | null;
	error: string | null;
	assetId: string | null;
	amount: number;
	createdAt: number;
	updatedAt: number;
}

const instances: ContractRune[] = [];

export class ContractRune {
	private _status: ContractStatus = 'idle';
	private _fundingState: FundingState | null = null;
	private _fundingInvoice: string | null = null;
	private _error: string | null = null;
	private _assetId: string | null = null;
	private _amount: number = 0;
	private _createdAt: number = Date.now();
	private _updatedAt: number = Date.now();

	constructor(assetId?: string, amount?: number) {
		this._assetId = assetId ?? null;
		this._amount = amount ?? 0;
		instances.push(this);
	}

	static snapshots(): ContractRuneSnapshot[] {
		return instances.map((rune) => rune.snapshot);
	}

	static clearRegistry(): void {
		instances.length = 0;
	}

	get snapshot(): ContractRuneSnapshot {
		return {
			status: this._status,
			fundingState: this._fundingState,
			fundingInvoice: this._fundingInvoice,
			error: this._error,
			assetId: this._assetId,
			amount: this._amount,
			createdAt: this._createdAt,
			updatedAt: this._updatedAt
		};
	}

	get status(): ContractStatus {
		return this._status;
	}

	get error(): string | null {
		return this._error;
	}

	private _updateTimestamp(): void {
		this._updatedAt = Date.now();
	}

	attest(status: string, reason?: string): void {
		const normalizedStatus = status.toLowerCase() as ContractStatus;
		const validStatuses: ContractStatus[] = [
			'idle',
			'draft',
			'funding',
			'funded',
			'work_in_progress',
			'work_submitted',
			'released',
			'failed',
			'disputed',
			'cancelled'
		];

		if (validStatuses.includes(normalizedStatus)) {
			this._status = normalizedStatus;
		}

		if (
			reason &&
			(normalizedStatus === 'failed' ||
				normalizedStatus === 'disputed' ||
				normalizedStatus === 'cancelled')
		) {
			this._error = reason;
		}

		this._updateTimestamp();
	}

	setFundingInvoice(invoice: string): void {
		this._fundingInvoice = invoice;
		this._fundingState = 'awaiting_payment';
		this._status = 'funding';
		this._updateTimestamp();
	}

	async sendToInvoice(invoice: string): Promise<void> {
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('UTEXO wallet not initialized');

		const normalizedInvoice = invoice.trim();
		if (!normalizedInvoice.startsWith('rgb1') && !normalizedInvoice.startsWith('rgb:')) {
			throw new Error('Funding destination must be an rgb: invoice for RGB-native escrow.');
		}

		const { nia } = await wallet.listAssets();
		const mintedAssetId =
			typeof window !== 'undefined'
				? (window as Window & { __E2E_MINTED_ASSET_ID?: string }).__E2E_MINTED_ASSET_ID
				: undefined;
		const expectedAssetId =
			mintedAssetId ||
			this._assetId ||
			import.meta.env.VITE_RGB_ESCROW_ASSET_ID ||
			nia.find((a: { ticker?: string }) => a.ticker === 'USDT')?.assetId;

		if (!expectedAssetId) {
			throw new Error('Tasker wallet has no escrow RGB asset. Fund the wallet with RGB tokens.');
		}

		const asset = nia.find((a: { assetId?: string }) => a.assetId === expectedAssetId);
		if (!asset) {
			throw new Error(`Escrow asset ${expectedAssetId} not found in wallet.`);
		}

		const spendable = Number(
			(asset as { balance?: { spendable?: number } }).balance?.spendable ?? 0
		);
		const baseUnits = this._amount > 0 && this._amount <= spendable ? this._amount : spendable;
		if (!baseUnits || baseUnits <= 0) {
			throw new Error('No spendable RGB balance to fund escrow');
		}

		console.info('[contract-rune] sendToInvoice', {
			assetId: expectedAssetId,
			amount: baseUnits,
			invoicePrefix: normalizedInvoice.slice(0, 40)
		});
		try {
			await prepareRgbOnchainSend(wallet, expectedAssetId);
			await wallet.onchainSend({
				invoice: normalizedInvoice,
				assetId: expectedAssetId,
				amount: baseUnits,
				feeRate: 2,
				minConfirmations: 1
			});
			console.info('[contract-rune] sendToInvoice completed');
			await wallet.refreshWallet();
		} catch (error) {
			console.error('[E2E-wallet-payment-failure]', {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			});
			throw error;
		}

		this._assetId = expectedAssetId;
		this._amount = baseUnits;
		this._fundingInvoice = normalizedInvoice;
		this._fundingState = 'confirming';
		this._updateTimestamp();
	}

	async payFundingFromWallet(): Promise<ContractRuneSnapshot> {
		if (this._status !== 'funding') {
			throw new Error(`Cannot pay funding invoice from ${this._status} state`);
		}
		const invoice = this._fundingInvoice;
		if (!invoice) throw new Error('Funding invoice is not available');
		this._fundingState = 'awaiting_payment';
		this._error = null;
		await this.sendToInvoice(invoice);
		this._status = 'funded';
		this._fundingState = 'confirmed';
		this._updateTimestamp();
		return this.snapshot;
	}
}
