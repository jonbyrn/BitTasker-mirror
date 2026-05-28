/**
 * DOC Minting Service — App-Level Wrapper
 *
 * Thin app-level wrapper around wallet-core's MoCMintingService.
 * Adds Sentry breadcrumbs, network checks, browser guards, and i18n error
 * messages. Integrates with wallet.store to refresh balances after minting.
 *
 * @see RBTC-Collateralized USDT0 on Arbitrum Plan §6
 * @see wallet-core/src/loans/MoCMintingService.ts
 */

import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { browser } from '$app/environment';
import { loanMonitoringService } from '$lib/services/loan-monitoring.service';

const debug = createDebug('doc-minting');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters for minting DOC tokens. */
export interface DocMintParams {
	rbtcAmount: string;
	expectedDocAmount: string;
	sourceWallet: string;
}

/** Result of a successful DOC mint. */
export interface DocMintResult {
	txHash: string;
	docMinted: string;
	blockNumber?: number;
}

/** Result of DOC mint fee estimation. */
export interface DocMintEstimate {
	docAmount: string;
	fee: string;
	estimatedGas: string;
	coverageRatio: number;
}

// ---------------------------------------------------------------------------
// I18n error message keys
// ---------------------------------------------------------------------------

const I18N_KEYS = {
	OFFLINE: 'wallet.loan.error_offline',
	MINT_FAILED: 'wallet.loan.error_mint_failed',
	MOC_RATIO: 'wallet.loan.error_moc_ratio',
	MOC_CAPACITY: 'wallet.loan.error_moc_capacity',
	NETWORK_ERROR: 'wallet.loan.error_network'
} as const;

/** Lazy reference to the wallet-core MoCMintingService (loaded dynamically). */
let _mocService: unknown = null;

/**
 * Set the MoCMintingService instance from wallet-core.
 * Called during app initialization when wallet-core is available.
 */
export function setMoCMintingService(service: unknown): void {
	_mocService = service;
	debug.log('MoCMintingService registered');
}

/**
 * Get the MoCMintingService instance, throwing if not available.
 */
function getMoCService(): {
	mintDoc: (params: DocMintParams) => Promise<DocMintResult>;
	estimateDocMint: (rbtcAmount: string) => Promise<DocMintEstimate>;
	getGlobalCoverageRatio: () => Promise<number>;
} {
	if (!_mocService) {
		throw new Error(
			'MoCMintingService not yet available from wallet-core. Ensure wallet is initialized.'
		);
	}
	return _mocService as ReturnType<typeof getMoCService>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const docMintingService = {
	/**
	 * Check if the network is available and browser context is active.
	 */
	checkPreconditions(): void {
		if (browser && !navigator.onLine) {
			throw new Error(I18N_KEYS.OFFLINE);
		}
	},

	/**
	 * Mint DOC using RBTC as collateral via Money on Chain.
	 *
	 * Wraps wallet-core's MoCMintingService.mintDoc() with:
	 * - Sentry breadcrumbs
	 * - Network check
	 * - Browser guard
	 * - tryCatch error handling
	 *
	 * @param params - Mint parameters (rbtcAmount, expectedDocAmount, sourceWallet)
	 * @returns The mint result with transaction hash and DOC amount minted
	 */
	async mintDoc(params: DocMintParams): Promise<DocMintResult> {
		this.checkPreconditions();

		const service = getMoCService();

		loanMonitoringService.phaseChange('IDLE', 'MINTING_DOC', {
			rbtcAmount: params.rbtcAmount,
			sourceWallet: params.sourceWallet
		});

		const startTime = Date.now();

		const { data, error } = await tryCatch(service.mintDoc(params));

		const duration = Date.now() - startTime;

		if (error) {
			debug.error('DOC mint failed: %s', error.message);
			loanMonitoringService.flowError(
				'MINTING_DOC',
				error instanceof Error ? error : new Error(String(error))
			);
			loanMonitoringService.stepDuration('MINTING_DOC', duration, false);
			throw error;
		}

		debug.log('DOC mint successful: tx %s, docAmount %s', data.txHash, data.docMinted);
		loanMonitoringService.stepDuration('MINTING_DOC', duration, true, {
			txHash: data.txHash
		});

		return data;
	},

	/**
	 * Estimate the amount of DOC that can be minted for a given RBTC amount.
	 * Also returns the fee and estimated gas.
	 */
	async estimateDocMint(rbtcAmount: string): Promise<DocMintEstimate> {
		this.checkPreconditions();

		const service = getMoCService();
		const { data, error } = await tryCatch(service.estimateDocMint(rbtcAmount));

		if (error) {
			debug.error('DOC mint estimation failed: %s', error.message);
			throw error;
		}

		return data;
	},

	/**
	 * Get the current global coverage ratio from MoC.
	 * Must be > 4 for unrestricted minting.
	 */
	async getCoverageRatio(): Promise<number> {
		this.checkPreconditions();

		const service = getMoCService();
		const { data, error } = await tryCatch(service.getGlobalCoverageRatio());

		if (error) {
			debug.error('Failed to get MoC coverage ratio: %s', error.message);
			throw error;
		}

		return data;
	},

	/**
	 * Check whether DOC minting is currently allowed based on coverage ratio.
	 * @returns true if coverage ratio >= 4 (unrestricted) or > 2 (restricted)
	 */
	async isMintingAllowed(): Promise<{ allowed: boolean; reason?: string }> {
		try {
			const ratio = await this.getCoverageRatio();
			if (ratio >= 4) {
				return { allowed: true };
			}
			if (ratio >= 2) {
				return {
					allowed: true,
					reason: 'Restricted minting — coverage ratio is below 4 but above 2'
				};
			}
			return {
				allowed: false,
				reason: 'DOC minting blocked — coverage ratio is below 2'
			};
		} catch (error) {
			return {
				allowed: false,
				reason: error instanceof Error ? error.message : 'Unable to verify MoC coverage ratio'
			};
		}
	}
};
