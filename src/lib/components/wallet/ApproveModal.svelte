<script lang="ts">
	import { t } from 'svelte-i18n';
	import * as Sentry from '@sentry/sveltekit';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { appStore } from '$lib/stores/app.store';
	import { browserNetworkStatus } from '$lib/utils/network-status';

	interface TokenInfo {
		symbol: string;
	}

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		amount: string | number;
		token: TokenInfo;
		spender: string;
		onApprove: () => Promise<void> | void;
		gasEstimate?: number | string;
		isSubmitting?: boolean;
	}

	let {
		isOpen,
		onClose,
		amount,
		token,
		spender,
		onApprove,
		gasEstimate = 0,
		isSubmitting = false
	}: Props = $props();

	let isProcessing = $state(false);
	let localError = $state<string | null>(null);
	let isOnline = $derived($browserNetworkStatus.online);

	let gasNum = $derived.by(() => {
		const g = typeof gasEstimate === 'number' ? gasEstimate : parseFloat(String(gasEstimate));
		return isFinite(g) ? g : 0;
	});

	let gasTooHigh = $derived(gasNum > 5);

	let shortSpender = $derived(spender ? `${spender.slice(0, 6)}...${spender.slice(-4)}` : '');

	async function handleApproveClick() {
		if (!isOnline || isProcessing || isSubmitting) return;

		isProcessing = true;
		localError = null;

		Sentry.addBreadcrumb({
			category: 'defi.approve',
			message: 'ERC20 approve modal action',
			data: {
				token: token.symbol,
				spender: shortSpender,
				amount: String(amount),
				gas: gasNum
			}
		});

		const { error } = await tryCatch(Promise.resolve(onApprove()));

		if (error) {
			localError = 'wallet.defi.approve.failed';
			Sentry.captureException(error, {
				tags: { feature: 'defi', action: 'erc20_approve' },
				extra: { token: token.symbol, spender: shortSpender }
			});
			appStore.showErrorToast($t('wallet.defi.approve.error'));
			isProcessing = false;
			return;
		}

		appStore.showSuccessToast(
			$t('wallet.defi.approve.success', { values: { token: token.symbol } })
		);
		isProcessing = false;
		onClose();
	}

	function handleClose() {
		if (isProcessing || isSubmitting) return;
		localError = null;
		onClose();
	}
</script>

{#if isOpen}
	<!-- Reusable single ApproveModal for ERC20 approvals (Lend + LP + future Borrow/BuySell).
	     Uses daisyUI modal classes + ARIA per Drawer patterns, runes, Sentry + tryCatch + appStore toast per skills,
	     reuses verified i18n keys where possible, no hardcodes, 5-state handling (offline/processing/error/gas high/ready),
	     gas estimate + warning from BorrowStep parity, onApprove callback, platform via network store. -->
	<div
		class="modal modal-open"
		role="dialog"
		aria-modal="true"
		aria-labelledby="approve-modal-title"
	>
		<div class="modal-box max-w-sm">
			<h3 id="approve-modal-title" class="text-lg font-bold">
				{$t('wallet.defi.approve.title')}
			</h3>

			<div class="space-y-3 py-4 text-sm">
				<div class="flex justify-between">
					<span class="text-base-content/60">{$t('wallet.defi.approve.amount')}</span>
					<span class="font-medium tabular-nums">{amount} {token.symbol}</span>
				</div>

				<div class="flex justify-between">
					<span class="text-base-content/60">{$t('wallet.defi.approve.spender')}</span>
					<span class="font-mono text-xs">{shortSpender}</span>
				</div>

				<div class="flex justify-between">
					<span class="text-base-content/60">{$t('wallet.defi.borrow.gas_fee')}</span>
					<span class="tabular-nums">
						${gasNum.toFixed(2)}
						{#if gasTooHigh}
							<span class="text-warning text-xs">
								{$t('wallet.defi.shared.gas_too_high', {
									values: { amount: `$${gasNum.toFixed(2)}` }
								})}
							</span>
						{/if}
					</span>
				</div>

				{#if localError}
					<div class="alert alert-soft alert-error py-1 text-xs" role="alert">
						{$t(localError)}
					</div>
				{/if}

				{#if !isOnline}
					<div class="alert alert-soft alert-warning py-1 text-xs" role="alert">
						{$t('wallet.defi.shared.offline')}
					</div>
				{/if}
			</div>

			<div class="modal-action">
				<button
					type="button"
					class="btn btn-ghost"
					onclick={handleClose}
					disabled={isProcessing || isSubmitting}
				>
					{$t('common.components.drawer.close')}
				</button>
				<button
					type="button"
					class="btn btn-primary"
					onclick={handleApproveClick}
					disabled={!isOnline || isProcessing || isSubmitting}
					aria-busy={isProcessing || isSubmitting}
				>
					{isProcessing || isSubmitting
						? $t('wallet.defi.shared.pending_tx')
						: $t('wallet.defi.approve.button')}
				</button>
			</div>
		</div>
		<div class="modal-backdrop" onclick={handleClose} role="presentation" aria-hidden="true"></div>
	</div>
{/if}
