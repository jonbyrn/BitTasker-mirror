<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { ExecStep } from './types';

	let {
		executionSteps,
		progressPercent,
		formattedElapsed,
		isBridgeDelayed
	}: {
		executionSteps: ExecStep[];
		progressPercent: number;
		formattedElapsed: string;
		isBridgeDelayed: boolean;
	} = $props();
</script>

<div aria-live="polite" aria-atomic="true">
	<!-- Step progress -->
	<div class="space-y-4">
		{#each executionSteps as execStep (execStep.id)}
			<div class="flex items-start gap-3">
				<div class="mt-0.5">
					{#if execStep.status === 'complete'}
						<div class="bg-success rounded-full p-1">
							<svg
								class="text-success-content h-4 w-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="3"
									d="M5 13l4 4L19 7"
								/>
							</svg>
						</div>
					{:else if execStep.status === 'active'}
						<span class="loading loading-spinner loading-sm text-primary"></span>
					{:else}
						<div class="bg-base-300 h-6 w-6 rounded-full"></div>
					{/if}
				</div>
				<div class="flex-1">
					<div
						class="text-sm font-medium {execStep.status === 'pending'
							? 'text-base-content/70'
							: 'text-base-content'}"
					>
						{execStep.label}
					</div>
					{#if execStep.status === 'active' && execStep.id === 'bridge' && isBridgeDelayed}
						<div class="text-warning mt-1 text-xs">
							{$t('wallet.loan.executing_bridge_delayed')}
						</div>
					{/if}
				</div>
				<div class="text-base-content/50 text-xs">
					{#if execStep.status === 'active'}
						{formattedElapsed}
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

<!-- Progress bar -->
<div class="space-y-1">
	<progress class="progress progress-primary w-full" value={progressPercent} max="100"></progress>
	<div class="text-base-content/50 text-right text-xs">{progressPercent}%</div>
</div>

<!-- Info: safe to navigate away -->
<div class="alert alert-soft text-xs">
	<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="2"
			d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
		/>
	</svg>
	<span>{$t('wallet.loan.info_background')}</span>
</div>
