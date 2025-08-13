<!--
	Fee Selection Component
	Handles fee rate selection for Bitcoin transactions
-->
<script lang="ts">
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
			<span class="label-text text-sm sm:text-base">Transaction Speed</span>
			<span class="label-text-alt text-xs">Higher speed = Higher fees</span>
		</div>
		<div class="grid w-full grid-cols-3 gap-2">
			<button
				class="btn btn-sm sm:btn-md {feeRate === 'slow' ? 'btn-primary' : 'btn-outline'}"
				onclick={() => handleFeeRateChange('slow')}
			>
				<span class="flex items-center gap-1">
					<span class="text-xs sm:text-sm">🐌</span>
					<span class="text-xs">Slow</span>
				</span>
			</button>
			<button
				class="btn btn-sm sm:btn-md {feeRate === 'medium' ? 'btn-primary' : 'btn-outline'}"
				onclick={() => handleFeeRateChange('medium')}
			>
				<span class="flex items-center gap-1">
					<span class="text-xs sm:text-sm">🚀</span>
					<span class="text-xs">Medium</span>
				</span>
			</button>
			<button
				class="btn btn-sm sm:btn-md {feeRate === 'fast' ? 'btn-primary' : 'btn-outline'}"
				onclick={() => handleFeeRateChange('fast')}
			>
				<span class="flex items-center gap-1">
					<span class="text-xs sm:text-sm">⚡</span>
					<span class="text-xs">Fast</span>
				</span>
			</button>
		</div>
	</div>
{/if}