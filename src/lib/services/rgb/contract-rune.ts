/**
 * ContractRune — E2E escrow contract lifecycle state machine.
 */

import { state } from '$lib/stores/wallet/wallet-state';
import { prepareRgbOnchainSend } from '$lib/stores/wallet/prepare-rgb-send';
import { getConfiguredRgbUsdtAssetId, selectEscrowAsset } from '$lib/types/rgb-contract';

export type ContractStatus =
	| 'idle'
	| 'draft'
	| 'funding'
	| 'funded'
	| 'work_in_progress'
	| 'work_submitted'
	| 'approved'
	| 'released'
	| 'settled'
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
	workMessage: string | null;
	proofUrl: string | null;
	payoutInvoice: string | null;
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
	private _workMessage: string | null = null;
	private _proofUrl: string | null = null;
	private _payoutInvoice: string | null = null;
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
			workMessage: this._workMessage,
			proofUrl: this._proofUrl,
			payoutInvoice: this._payoutInvoice,
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
			'approved',
			'released',
			'settled',
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
		const expectedAssetId = selectEscrowAsset(nia ?? [], [
			mintedAssetId,
			this._assetId,
			getConfiguredRgbUsdtAssetId(),
			import.meta.env.VITE_RGB_ESCROW_ASSET_ID as string | undefined
		]);

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

	submitWork(message: string, proofUrl?: string): ContractRuneSnapshot {
		if (this._status !== 'funded' && this._status !== 'work_in_progress') {
			throw new Error(`Cannot submit work from ${this._status} state`);
		}
		const deliverable = message.trim();
		const proof = proofUrl?.trim() ?? '';
		if (!deliverable && !proof) throw new Error('Deliverable proof is required');
		this._workMessage = deliverable || null;
		this._proofUrl = proof || null;
		this._status = 'work_submitted';
		this._error = null;
		this._updateTimestamp();
		return this.snapshot;
	}

	approveWork(): ContractRuneSnapshot {
		if (this._status !== 'work_submitted') {
			throw new Error(`Cannot approve work from ${this._status} state`);
		}
		this._status = 'approved';
		this._error = null;
		this._updateTimestamp();
		return this.snapshot;
	}

	async createPayoutInvoice(): Promise<string> {
		if (this._status !== 'approved') {
			throw new Error(`Cannot create a payout invoice from ${this._status} state`);
		}
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('UTEXO wallet not initialized');
		const received = await wallet.onchainReceive({
			witness: false,
			minConfirmations: 1,
			durationSeconds: 3600
		});
		const invoice = received.invoice?.trim() ?? '';
		if (!invoice) throw new Error('Taskee payout invoice was empty');
		this._payoutInvoice = invoice;
		this._updateTimestamp();
		return invoice;
	}

	// Model B: fund already sent the asset. Release attests released and does not send.
	async releaseEscrow(invoice?: string): Promise<ContractRuneSnapshot> {
		if (this._status !== 'work_submitted' && this._status !== 'approved') {
			throw new Error(`Cannot release escrow from ${this._status} state`);
		}
		const payout = (invoice ?? this._payoutInvoice)?.trim() ?? '';
		if (payout && !payout.startsWith('rgb:') && !payout.startsWith('rgb1')) {
			throw new Error('Payout destination must be an rgb: invoice.');
		}
		if (payout) this._payoutInvoice = payout;
		this._status = 'released';
		this._error = null;
		this._updateTimestamp();
		console.info('[contract-rune] releaseEscrow', { attested: 'released' });
		return this.snapshot;
	}
}
