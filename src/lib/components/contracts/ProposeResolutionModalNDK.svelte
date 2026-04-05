<script lang="ts">
	import { t } from 'svelte-i18n';
	import { ethers } from 'ethers';
	import { appStore } from '$lib/stores/app.store';
	import { formatConvertedAmount } from '$lib/utils/helpers/currencyFormatter';
	import type { PaymentContractRune } from '$lib/runes/contractRune.svelte';
	import { ContractStatus } from '$lib/utils/contract/types';
	import { GAS_REIMBURSEMENT_PER_OP } from '$lib/utils/contract/v2/types';
	import { createDebug } from '$lib/utils/debug';

	const d = createDebug('contracts:proposeResolutionModalNDK');

	const TWO_GASLESS_OPS = 2n * GAS_REIMBURSEMENT_PER_OP;

	const {
		contractRune,
		isOpen = false,
		onClose = () => {},
		onPropose = async () => {},
		btcPrice = 0,
		chainBusy = false
	} = $props<{
		contractRune: PaymentContractRune;
		isOpen: boolean;
		onClose: () => void;
		onPropose: (taskeeAmountWei: bigint) => Promise<void>;
		btcPrice?: number;
		chainBusy?: boolean;
	}>();

	/** 0–100 = % of the **split pool** allocated to the **taskee** (tasker gets the remainder). */
	let positionPercent = $state(50);
	let isSubmitting = $state(false);

	const chainAmountWei = $derived.by(() => {
		const raw = contractRune.blockchainData?.amount;
		if (!raw) return null;
		try {
			return ethers.parseEther(raw);
		} catch {
			return null;
		}
	});

	/**
	 * Pot assumed after two gasless settlement ops (propose + accept). Same units as on-chain `amount`.
	 */
	const splitPoolWei = $derived.by(() => {
		const c = chainAmountWei;
		if (c === null) return null;
		const p = c - TWO_GASLESS_OPS;
		return p > 0n ? p : null;
	});

	const chainState = $derived(contractRune.blockchainData?.state ?? -1);

	const taskeeShareWei = $derived.by(() => {
		const pool = splitPoolWei;
		if (pool === null) return 0n;
		return (pool * BigInt(positionPercent)) / 100n;
	});

	const taskerShareWei = $derived.by(() => {
		const pool = splitPoolWei;
		if (pool === null) return 0n;
		return pool - taskeeShareWei;
	});

	$effect(() => {
		if (isOpen) {
			positionPercent = 50;
		}
	});

	function displayPercentOfPool(shareWei: bigint, total: bigint): string {
		if (total === 0n) return '0%';
		const basisPoints = (shareWei * 10000n) / total;
		const pct = Number(basisPoints) / 100;
		if (!Number.isFinite(pct)) return '—';
		const rounded = Math.round(pct * 10) / 10;
		if (rounded % 1 === 0) return `${Math.round(rounded)}%`;
		return `${rounded.toFixed(1)}%`;
	}

	function displayUsdApproxLine(shareWei: bigint): string {
		const cur = contractRune.contract.currency;
		const eth = ethers.formatEther(shareWei);
		if (btcPrice > 0) {
			const usd = formatConvertedAmount(eth, cur, { btcPrice, toCurrency: 'USD' });
			return `~${usd}`;
		}
		const n = Number(eth);
		if (!Number.isFinite(n)) return '';
		return `~${n.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${cur}`;
	}

	const splitPoolDisplayLabel = $derived.by(() => {
		const pool = splitPoolWei;
		if (pool === null) return '';
		const eth = ethers.formatEther(pool);
		const currency = contractRune.contract.currency;
		if (btcPrice > 0) {
			const usd = formatConvertedAmount(eth, currency, { btcPrice, toCurrency: 'USD' });
			return `${usd}`;
		}
		return `${eth} ${currency}`;
	});

	async function handleSubmit() {
		if (isSubmitting || chainBusy || splitPoolWei === null) return;
		const taskeeAmountWei = taskeeShareWei;
		if (chainState === ContractStatus.InDispute && taskeeAmountWei <= 0n) {
			appStore.showErrorToast(
				$t('dashboard.contracts.actions.propose_resolution_taskee_positive_required')
			);
			return;
		}
		try {
			isSubmitting = true;
			d.log('propose resolution submit', { taskeeAmountWei: taskeeAmountWei.toString() });
			await onPropose(taskeeAmountWei);
			onClose();
		} catch (e) {
			d.error('onPropose failed', e);
		} finally {
			isSubmitting = false;
		}
	}

	function handleClose() {
		if (isSubmitting) return;
		onClose();
	}
</script>

{#if isOpen}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-semibold">
					{$t('dashboard.contracts.actions.resolution_form_title')}
				</h3>
				<button
					type="button"
					class="btn btn-circle btn-ghost btn-sm"
					onclick={handleClose}
					disabled={isSubmitting}
					aria-label={$t('common.close')}
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						></path>
					</svg>
				</button>
			</div>

			{#if chainAmountWei === null}
				<div class="alert alert-outline alert-warning mb-4">
					<span>{$t('dashboard.contracts.actions.propose_resolution_load_error')}</span>
				</div>
			{:else if splitPoolWei === null}
				<div class="alert alert-outline alert-warning mb-4">
					<span>{$t('dashboard.contracts.actions.propose_resolution_split_pool_too_small')}</span>
				</div>
			{:else}
				<p class="text-base-content/90 mb-2 text-sm font-medium">
					<strong>{$t('dashboard.contracts.actions.propose_resolution_split_pool_label')}:</strong>
					{splitPoolDisplayLabel}
				</p>

				<p class="text-base-content/70 mb-4 text-sm">
					{$t('dashboard.contracts.actions.propose_resolution_split_hint')}
				</p>

				<div class="mb-4 flex flex-row gap-3 sm:flex-row sm:items-stretch sm:justify-between">
					<div
						class="flex flex-1 flex-col gap-1 rounded-lg p-4 text-center {contractRune.isTasker
							? 'border-primary bg-primary/10 border-2'
							: 'bg-base-200'}"
					>
						<span class="text-base-content/80 text-xs font-medium">
							{contractRune.isTasker
								? $t('dashboard.contracts.actions.propose_resolution_label_you')
								: $t('dashboard.contracts.actions.propose_resolution_label_tasker')}
						</span>
						<span class="text-2xl font-bold tracking-tight">
							{displayPercentOfPool(taskerShareWei, splitPoolWei)}
						</span>
						<span class="text-base-content/60 text-sm">
							{displayUsdApproxLine(taskerShareWei)}
						</span>
					</div>
					<div
						class="flex flex-1 flex-col gap-1 rounded-lg p-4 text-center {!contractRune.isTasker
							? 'border-primary bg-primary/10 border-2'
							: 'bg-base-200'}"
					>
						<span class="text-base-content/80 text-xs font-medium">
							{contractRune.isTasker
								? $t('dashboard.contracts.actions.propose_resolution_label_taskee')
								: $t('dashboard.contracts.actions.propose_resolution_label_you')}
						</span>
						<span class="text-2xl font-bold tracking-tight">
							{displayPercentOfPool(taskeeShareWei, splitPoolWei)}
						</span>
						<span class="text-base-content/60 text-sm">
							{displayUsdApproxLine(taskeeShareWei)}
						</span>
					</div>
				</div>

				<div class="form-control w-full">
					<label class="label" for="propose-split-range">
						<span class="label-text sr-only"
							>{$t('dashboard.contracts.actions.propose_resolution_slider_taskee_percent')}</span
						>
					</label>
					<input
						id="propose-split-range"
						type="range"
						class="range range-primary range-md w-full [--range-fill:0]"
						min="0"
						max="100"
						step="1"
						bind:value={positionPercent}
						disabled={isSubmitting}
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow={positionPercent}
						aria-label={$t('dashboard.contracts.actions.propose_resolution_slider_taskee_percent')}
					/>
					<div class="mt-2 flex justify-between px-1 text-xs font-medium opacity-80">
						<span>
							{#if contractRune.isTasker}
								{$t('dashboard.contracts.actions.propose_resolution_label_you')}
							{:else}
								{$t('dashboard.contracts.actions.propose_resolution_label_tasker')}
							{/if}
						</span>
						<span>
							{#if contractRune.isTasker}
								{$t('dashboard.contracts.actions.propose_resolution_label_taskee')}
							{:else}
								{$t('dashboard.contracts.actions.propose_resolution_label_you')}
							{/if}
						</span>
					</div>
				</div>
			{/if}

			<div class="modal-action">
				<button type="button" class="btn btn-ghost" onclick={handleClose} disabled={isSubmitting}>
					{$t('dashboard.contracts.actions.cancel')}
				</button>
				<button
					type="button"
					class="btn btn-primary"
					disabled={isSubmitting || chainBusy || splitPoolWei === null}
					onclick={handleSubmit}
				>
					{#if isSubmitting || chainBusy}
						<span class="loading loading-spinner loading-sm"></span>
					{/if}
					{$t('dashboard.contracts.actions.propose')}
				</button>
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop"
			onclick={handleClose}
			aria-label={$t('common.close')}
		></button>
	</div>
{/if}
