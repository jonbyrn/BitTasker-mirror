<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { FeeEstimate } from '$lib/types/gasless.types';
	import { TOKENS } from '$lib/wallet/gasless.config';
	
	let {
		amount,
		recipient,
		tokenAddress,
		feeEstimate = null,
		onConfirm,
		onCancel,
		isLoading = false,
		error = null
	}: {
		amount: bigint;
		recipient: string;
		tokenAddress: string;
		feeEstimate: FeeEstimate | null;
		onConfirm: () => void;
		onCancel: () => void;
		isLoading?: boolean;
		error?: string | null;
	} = $props();
	
	// Get token info
	const token = $derived(TOKENS.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase()));
	
	// Format amount for display
	const formattedAmount = $derived.by(() => {
		if (!token) return '0';
		const divisor = BigInt(10 ** token.decimals);
		const wholePart = amount / divisor;
		const fractionalPart = amount % divisor;
		return `${wholePart.toString()}.${fractionalPart.toString().padStart(token.decimals, '0').replace(/\.?0+$/, '')}`;
	});
	
	// Calculate total with fee
	const totalWithFee = $derived.by(() => {
		if (!feeEstimate) return amount;
		return amount + BigInt(feeEstimate.feeBuffer);
	});
	
	const formattedTotal = $derived.by(() => {
		if (!token) return '0';
		const divisor = BigInt(10 ** token.decimals);
		const wholePart = totalWithFee / divisor;
		const fractionalPart = totalWithFee % divisor;
		return `${wholePart.toString()}.${fractionalPart.toString().padStart(token.decimals, '0').replace(/\.?0+$/, '')}`;
	});
	
	// Format fee buffer for display (converts raw token units to human-readable)
	const formattedFeeBuffer = $derived.by(() => {
		if (!feeEstimate || !token) return '0';
		const feeBuffer = BigInt(feeEstimate.feeBuffer);
		const divisor = BigInt(10 ** token.decimals);
		const wholePart = feeBuffer / divisor;
		const fractionalPart = feeBuffer % divisor;
		return `${wholePart.toString()}.${fractionalPart.toString().padStart(token.decimals, '0').replace(/\.?0+$/, '')}`;
	});
	
	// Fee tier color
	const feeTierColor = $derived.by(() => {
		if (!feeEstimate) return 'text-base-content/50';
		switch (feeEstimate.feeTier) {
			case 'Low': return 'text-success';
			case 'Medium': return 'text-info';
			case 'High': return 'text-warning';
			case 'Very High': return 'text-error';
			default: return 'text-base-content/50';
		}
	});
	
	// Truncate recipient address
	const truncatedRecipient = $derived(
		recipient.length > 12 ? `${recipient.slice(0, 6)}...${recipient.slice(-4)}` : recipient
	);
</script>

<div class="modal modal-open">
	<div class="modal-box max-w-md">
		<h3 class="text-lg font-bold">{$t('wallet.gasless_confirm.title')}</h3>
		
		<div class="space-y-4 py-4">
			<!-- Recipient -->
			<div class="space-y-1">
				<div class="text-sm font-medium opacity-70">{$t('wallet.gasless_confirm.recipient')}</div>
				<div class="font-semibold">{truncatedRecipient}</div>
			</div>
			
			<!-- Amount -->
			<div class="space-y-1">
				<div class="text-sm font-medium opacity-70">{$t('wallet.gasless_confirm.amount')}</div>
				<div class="text-xl font-bold">
					{formattedAmount} {token?.symbol || ''}
				</div>
			</div>
			
			<!-- Fee -->
			{#if feeEstimate}
				<div class="border-base-300 bg-base-200 rounded-box border p-3">
					<div class="flex items-center justify-between">
						<div class="space-y-1">
							<div class="text-sm font-medium opacity-70">{$t('wallet.gasless_confirm.network_fee')}</div>
							<div class="flex items-center gap-2">
								<span class="font-semibold">
									{formattedFeeBuffer} {token?.symbol || ''}
								</span>
								<span class="badge badge-sm {feeTierColor}">
									{feeEstimate.feeTier}
								</span>
							</div>
						</div>
						<div class="text-right">
							<div class="text-sm opacity-70">~${feeEstimate.feeCostUSD.toFixed(2)}</div>
						</div>
					</div>
				</div>
			{/if}
			
			<!-- Total -->
			<div class="border-t border-base-300 pt-4">
				<div class="flex items-center justify-between">
					<div class="text-sm font-medium opacity-70">{$t('wallet.gasless_confirm.total')}</div>
					<div class="text-lg font-bold">
						{formattedTotal} {token?.symbol || ''}
					</div>
				</div>
			</div>
			
			<!-- Error display -->
			{#if error}
				<div class="alert alert-error py-2">
					<span class="text-sm">{error}</span>
				</div>
			{/if}
		</div>
		
		<div class="modal-action">
			<button class="btn btn-ghost" onclick={onCancel}>
				{$t('common.cancel')}
			</button>
			<button
				class="btn btn-primary"
				onclick={onConfirm}
				disabled={isLoading || !feeEstimate}
			>
				{#if isLoading}
					<span class="loading loading-spinner loading-sm"></span>
				{/if}
				{$t('wallet.gasless_confirm.confirm_send')}
			</button>
		</div>
	</div>
	<button class="modal-backdrop" onclick={onCancel} aria-label={$t('common.close')}></button>
</div>
