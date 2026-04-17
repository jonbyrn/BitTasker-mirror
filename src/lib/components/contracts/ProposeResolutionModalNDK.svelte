<script lang="ts">
	import { t } from 'svelte-i18n';
	import { ethers } from 'ethers';
	import { appStore } from '$lib/stores/app.store';
	import { formatConvertedAmount } from '$lib/utils/helpers/currencyFormatter';
	import type { PaymentContractRune } from '$lib/runes/contractRune.svelte';
	import { ContractStatus } from '$lib/utils/contract/types';
	import { GAS_REIMBURSEMENT_PER_OP } from '$lib/utils/contract/v2/types';
	import { createDebug } from '$lib/utils/debug';
	import ResolutionProposalSplitDisplay from './ResolutionProposalSplitDisplay.svelte';

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
	const minValue = $derived(chainState === ContractStatus.InDisputeWorkInProgress ? 0 : 1);

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

	const pending = $derived(contractRune.pendingResolutionProposal);

	$effect(() => {
		if (isOpen) {
			positionPercent = 50;
		}
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
				{#if pending}
					<div class="bg-base-200/80 border-base-300 mb-4 rounded-xl border p-3">
						<p class="text-base-content/80 mb-2 text-xs font-semibold tracking-wide uppercase">
							{$t('dashboard.contracts.actions.resolution_latest_compare_title')}
						</p>
						<ResolutionProposalSplitDisplay
							taskerShareWei={pending.taskerWei}
							taskeeShareWei={pending.taskeeWei}
							currency={contractRune.contract.currency}
							{btcPrice}
							isTasker={contractRune.isTasker}
							variant="compact"
							proposerIsTasker={pending.proposerIsTasker}
						/>
					</div>
				{/if}

				<p class="text-base-content/90 mb-2 text-sm font-medium">
					<strong>{$t('dashboard.contracts.actions.propose_resolution_split_pool_label')}:</strong>
					{splitPoolDisplayLabel}
				</p>

				<p class="text-base-content/70 mb-4 text-sm">
					{$t('dashboard.contracts.actions.propose_resolution_split_hint')}
				</p>

				<ResolutionProposalSplitDisplay
					{taskerShareWei}
					{taskeeShareWei}
					currency={contractRune.contract.currency}
					{btcPrice}
					isTasker={contractRune.isTasker}
				/>

				<div class="form-control mt-4 w-full">
					<label class="label" for="propose-split-range">
						<span class="label-text sr-only"
							>{$t('dashboard.contracts.actions.propose_resolution_slider_taskee_percent')}</span
						>
					</label>
					<input
						id="propose-split-range"
						type="range"
						class="range range-primary range-md w-full [--range-fill:0]"
						min={minValue}
						max="100"
						step="1"
						bind:value={positionPercent}
						disabled={isSubmitting}
						aria-valuemin={minValue}
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
