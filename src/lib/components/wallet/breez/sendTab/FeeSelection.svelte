<!--
	Fee Selection Component
	Handles fee rate selection for Bitcoin transactions
-->
<script lang="ts">
	import { t } from 'svelte-i18n';
	
	// Props
	let {
		feeRate = $bindable('medium'),
		selectedAsset = 'BTC',
		onFeeRateChange = () => {}
	} = $props();

	function handleFeeRateChange(newRate: 'slow' | 'medium' | 'fast') {
		feeRate = newRate;
		onFeeRateChange();
	}
</script>

{#if selectedAsset === 'BTC'}
	<div class="form-control">
		<div class="label">
			<span class="label-text text-sm sm:text-base">{$t('common.components.wallet.fee_selection.transaction_speed')}</span>
			<span class="label-text-alt text-xs">{$t('common.components.wallet.fee_selection.speed_description')}</span>
		</div>
		<div class="grid w-full grid-cols-3 gap-2">
			<button
				class="btn btn-sm sm:btn-md {feeRate === 'slow' ? 'btn-primary' : 'btn-outline'}"
				onclick={() => handleFeeRateChange('slow')}
			>
				<span class="flex items-center gap-1">
					<span class="text-xs sm:text-sm">🐌</span>
					<span class="text-xs">{$t('common.components.wallet.fee_selection.slow')}</span>
				</span>
			</button>
			<button
				class="btn btn-sm sm:btn-md {feeRate === 'medium' ? 'btn-primary' : 'btn-outline'}"
				onclick={() => handleFeeRateChange('medium')}
			>
				<span class="flex items-center gap-1">
					<span class="text-xs sm:text-sm">🚀</span>
					<span class="text-xs">{$t('common.components.wallet.fee_selection.medium')}</span>
				</span>
			</button>
			<button
				class="btn btn-sm sm:btn-md {feeRate === 'fast' ? 'btn-primary' : 'btn-outline'}"
				onclick={() => handleFeeRateChange('fast')}
			>
				<span class="flex items-center gap-1">
					<span class="text-xs sm:text-sm">⚡</span>
					<span class="text-xs">{$t('common.components.wallet.fee_selection.fast')}</span>
				</span>
			</button>
		</div>
	</div>
{/if}