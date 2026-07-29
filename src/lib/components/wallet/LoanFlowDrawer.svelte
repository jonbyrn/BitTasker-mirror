<script lang="ts">
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { ethers } from 'ethers';
	import { walletStore } from '$lib/stores/wallet.store';
	import {
		getLoanFlowQuote,
		executeLoanFlow,
		type LoanFlowQuote,
		type LoanFlowState,
		type LoanFlowServiceConfig
	} from '$lib/services/loan-flow.service';
	import Drawer from '$lib/components/Drawer.svelte';

	let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();

	type UIState = 'input' | 'quoting' | 'confirm' | 'executing' | 'success' | 'error';
	let uiState = $state<UIState>('input');
	let rbtcInput = $state('');
	let quote = $state<LoanFlowQuote | null>(null);
	let flowState = $state<LoanFlowState | null>(null);
	let errorMsg = $state('');
	let txHashes = $state<{ docMint?: string; dexSwap?: string; bridge?: string }>({});

	let rbtcBalance = $derived(get(walletStore).rsk.formattedBalance ?? '0.00');
	let canSubmit = $derived(rbtcInput.trim() !== '' && parseFloat(rbtcInput) > 0);

	const STEPS = [
		{
			label: 'MoC Mint (rBTC → DOC)',
			phases: ['MINTING_DOC', 'WAITING_DOC_MINT', 'APPROVING_DOC']
		},
		{ label: 'DEX Swap (DOC → USDT0)', phases: ['SWAPPING_DOC_TO_USDT0', 'WAITING_SWAP'] },
		{
			label: 'LayerZero Bridge → Arbitrum',
			phases: ['APPROVING_USDT0', 'BRIDGING_TO_ARBITRUM', 'WAITING_BRIDGE', 'BRIDGING_TIMED_OUT']
		},
		{ label: 'Complete', phases: ['COMPLETE'] }
	];

	function getActiveStep(): number {
		if (!flowState) return -1;
		for (let i = STEPS.length - 1; i >= 0; i--) {
			if (STEPS[i].phases.includes(flowState.phase)) return i;
		}
		return -1;
	}

	function stepStatus(idx: number): 'complete' | 'active' | 'pending' | 'failed' {
		if (!flowState) return 'pending';
		if (flowState.phase === 'COMPLETE') return 'complete';
		if (flowState.phase === 'FAILED') {
			const active = getActiveStep();
			if (active === -1) {
				// Phase doesn't map to a known step — mark all as failed
				return idx === 0 ? 'failed' : 'pending';
			}
			if (idx < active) return 'complete';
			if (idx === active) return 'failed';
			return 'pending';
		}
		const active = getActiveStep();
		if (active === -1) return 'pending';
		if (idx < active) return 'complete';
		if (idx === active) return 'active';
		return 'pending';
	}

	function fmt(raw: string): string {
		return parseFloat(ethers.formatUnits(raw, 6)).toFixed(2);
	}

	function svcConfig(): LoanFlowServiceConfig | null {
		const s = get(walletStore);
		if (!s.rsk.wallet || !s.rsk.provider) return null;
		if (!s.arb.address) {
			errorMsg = 'Arbitrum address not available. Please wait for wallet to sync.';
			uiState = 'error';
			return null;
		}
		return {
			rskSigner: s.rsk.wallet,
			rskProvider: s.rsk.provider,
			arbRecipientAddress: s.arb.address
		};
	}

	function resetAll() {
		uiState = 'input';
		rbtcInput = '';
		quote = null;
		flowState = null;
		errorMsg = '';
		txHashes = {};
	}

	async function handleGetQuote() {
		const config = svcConfig();
		if (!config) {
			errorMsg = 'Wallet not connected';
			uiState = 'error';
			return;
		}
		uiState = 'quoting';
		const result = await getLoanFlowQuote(config, ethers.parseEther(rbtcInput).toString());
		if (result.error) {
			errorMsg = result.error;
			uiState = 'error';
			return;
		}
		quote = result.data ?? null;
		uiState = 'confirm';
	}

	async function handleConfirm() {
		const config = svcConfig();
		if (!config || !quote) return;
		uiState = 'executing';
		const result = await executeLoanFlow(
			config,
			ethers.parseEther(rbtcInput).toString(),
			1,
			(s) => {
				flowState = s;
			}
		);
		if (result.success && result.data) {
			txHashes = result.data.txHashes;
			uiState = 'success';
		} else {
			errorMsg = result.error ?? 'Loan flow failed';
			uiState = 'error';
		}
	}

	function handleClose() {
		if (uiState !== 'executing') {
			resetAll();
			onClose();
		}
	}

	$effect(() => {
		if (!isOpen && uiState !== 'executing') resetAll();
	});
</script>

<Drawer
	{isOpen}
	onClose={handleClose}
	title={$t('wallet.loan_flow.title', { default: 'Convert rBTC → USDT0' })}
	position="right"
	isScrollable
	isSubmitting={uiState === 'executing'}
>
	<div class="flex flex-col gap-4">
		{#if uiState === 'input'}
			<div class="form-control">
				<label class="label" for="rbtc-amount"
					><span class="label-text"
						>{$t('wallet.loan_flow.amount_label', { default: 'rBTC Amount' })}</span
					></label
				>
				<input
					id="rbtc-amount"
					type="number"
					step="0.0001"
					min="0"
					placeholder="0.001"
					class="input input-bordered w-full"
					bind:value={rbtcInput}
				/>
				<label class="label" for="rbtc-amount"
					><span class="label-text-alt"
						>{$t('wallet.loan_flow.balance', { default: 'Balance' })}: {rbtcBalance} rBTC</span
					></label
				>
			</div>
			<button class="btn btn-primary w-full" disabled={!canSubmit} onclick={handleGetQuote}
				>{$t('wallet.loan_flow.get_quote', { default: 'Get Quote' })}</button
			>
		{:else if uiState === 'quoting'}
			<div class="flex flex-col items-center gap-4 py-12">
				<span class="loading loading-spinner loading-lg text-primary"></span>
				<p class="text-base-content/60">
					{$t('wallet.loan_flow.fetching', { default: 'Fetching best route...' })}
				</p>
			</div>
		{:else if uiState === 'confirm' && quote}
			<div class="bg-base-200 rounded-box space-y-2 p-4">
				<div class="flex justify-between text-sm">
					<span class="text-base-content/60"
						>{$t('wallet.loan_flow.you_send', { default: 'You send' })}</span
					>
					<span class="font-bold">{rbtcInput} rBTC</span>
				</div>
				<div class="divider my-1"></div>
				<div class="flex justify-between text-sm">
					<span class="text-base-content/60"
						>{$t('wallet.loan_flow.you_receive', { default: 'You receive (est.)' })}</span
					>
					<span class="text-success font-bold">{fmt(quote.estimatedUsdt0OnArbitrum)} USDT0</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-base-content/60"
						>{$t('wallet.loan_flow.bridge_fee', { default: 'Bridge fee (est.)' })}</span
					>
					<span>{fmt(quote.estimatedBridgeFee)} USDT0</span>
				</div>
			</div>
			<p class="text-sm font-semibold">
				{$t('wallet.loan_flow.flow_steps', { default: 'Flow Steps' })}
			</p>
			<ul class="steps steps-vertical">
				{#each STEPS as s (s.label)}
					<li class="step step-primary">{s.label}</li>
				{/each}
			</ul>
			<div class="mt-2 flex gap-2">
				<button
					class="btn btn-outline flex-1"
					onclick={() => {
						uiState = 'input';
						quote = null;
					}}>{$t('common.back', { default: 'Back' })}</button
				>
				<button class="btn btn-primary flex-1" onclick={handleConfirm}
					>{$t('common.confirm', { default: 'Confirm' })}</button
				>
			</div>
		{:else if uiState === 'executing'}
			<ul class="steps steps-vertical">
				{#each STEPS as step, i (i)}
					{@const status = stepStatus(i)}
					<li
						class="step"
						class:step-primary={status === 'complete' || status === 'active'}
						class:step-error={status === 'failed'}
					>
						<div class="flex items-center gap-2">
							{#if status === 'complete'}<span class="text-success font-bold">&#10003;</span>
							{:else if status === 'active'}<span
									class="loading loading-spinner loading-xs text-primary"
								></span>
							{:else if status === 'failed'}<span class="text-error font-bold">&#10007;</span>{/if}
							<span>{step.label}</span>
						</div>
					</li>
				{/each}
			</ul>
		{:else if uiState === 'success'}
			<div class="flex flex-col items-center gap-4 py-8">
				<div class="bg-success/10 flex h-16 w-16 items-center justify-center rounded-full">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-success h-8 w-8"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/></svg
					>
				</div>
				<h3 class="text-lg font-bold">
					{$t('wallet.loan_flow.success_title', { default: 'Conversion Complete' })}
				</h3>
				{#if quote}
					<p class="text-base-content/80 text-center">
						{$t('wallet.loan_flow.success_received', {
							default: 'Received ~{amount} USDT0 on Arbitrum',
							values: { amount: fmt(quote.estimatedUsdt0OnArbitrum) }
						})}
					</p>
				{/if}
				{#if txHashes.docMint || txHashes.dexSwap || txHashes.bridge}
					<div class="bg-base-200 rounded-box w-full space-y-1 p-3 font-mono text-xs break-all">
						{#if txHashes.docMint}<div>
								<span class="text-base-content/60">MoC Mint:</span>
								{txHashes.docMint}
							</div>{/if}
						{#if txHashes.dexSwap}<div>
								<span class="text-base-content/60">DEX Swap:</span>
								{txHashes.dexSwap}
							</div>{/if}
						{#if txHashes.bridge}<div>
								<span class="text-base-content/60">Bridge:</span>
								{txHashes.bridge}
							</div>{/if}
					</div>
				{/if}
				<button class="btn btn-primary w-full" onclick={handleClose}
					>{$t('common.done', { default: 'Done' })}</button
				>
			</div>
		{:else if uiState === 'error'}
			<div class="flex flex-col items-center gap-4 py-8">
				<div class="bg-error/10 flex h-16 w-16 items-center justify-center rounded-full">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-error h-8 w-8"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/></svg
					>
				</div>
				<h3 class="text-lg font-bold">
					{$t('wallet.loan_flow.error_title', { default: 'Something went wrong' })}
				</h3>
				<p class="text-base-content/60 text-center text-sm">{errorMsg}</p>
				<div class="flex w-full gap-2">
					<button class="btn btn-outline flex-1" onclick={handleClose}
						>{$t('common.close', { default: 'Close' })}</button
					>
					<button
						class="btn btn-primary flex-1"
						onclick={() => {
							uiState = 'input';
							quote = null;
							flowState = null;
							errorMsg = '';
							txHashes = {};
						}}>{$t('common.retry', { default: 'Retry' })}</button
					>
				</div>
			</div>
		{/if}
	</div>
</Drawer>
