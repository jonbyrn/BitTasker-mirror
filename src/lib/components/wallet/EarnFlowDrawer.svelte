<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import EarnLendStep from './defi/EarnLendStep.svelte';
	import EarnLPStep from './defi/EarnLPStep.svelte';
	import * as Sentry from '@sentry/sveltekit';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		isSubmitting?: boolean; // passed through to future step processing state
		/** Single tab mode flag for direct/preview flows (e.g. 'lending' only, hides sub-tabs). Supports connected wallet + preview polish. */
		single?: 'lending' | 'lp' | null;
	}

	let { isOpen, onClose, isSubmitting = false, single = null }: Props = $props();

	let internalTab = $state<'lending' | 'lp'>('lending');
	let earnSubTab = $derived<'lending' | 'lp'>(single ?? internalTab);

	onMount(() => {
		Sentry.addBreadcrumb({
			category: 'defi.earn',
			message: 'EarnFlowDrawer mounted',
			data: { initialTab: earnSubTab, singleFlag: single }
		});
	});
</script>

<Drawer
	{isOpen}
	{onClose}
	title={$t('wallet.defi.tab_earn')}
	position="right"
	isScrollable={true}
	{isSubmitting}
>
	<div class="flex flex-col gap-4">
		<!-- Sub-selector — matching BuySellForm / wallet tabs pattern (touch targets, icons, overflow, tighter mb). Hidden in single flag mode for direct/preview connected flows. -->
		{#if !single}
			<div
				role="tablist"
				class="tabs tabs-boxed border-base-300 mb-1 shrink-0 overflow-hidden rounded-lg border sm:mb-2"
			>
				<button
					role="tab"
					id="tab-lend"
					aria-controls="panel-lend"
					class="tab min-h-[44px] flex-1"
					class:bg-primary={earnSubTab === 'lending'}
					class:text-primary-content={earnSubTab === 'lending'}
					class:tab-active={earnSubTab === 'lending'}
					aria-selected={earnSubTab === 'lending'}
					onclick={() => {
						Sentry.addBreadcrumb({ category: 'defi.earn', message: 'tab switch to lending' });
						internalTab = 'lending';
					}}
				>
					<svg
						class="mr-1 h-4 w-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9"
						/>
					</svg>
					{$t('wallet.defi.earn_lending')}
				</button>
				<button
					role="tab"
					id="tab-lp"
					aria-controls="panel-lp"
					class="tab min-h-[44px] flex-1"
					class:bg-primary={earnSubTab === 'lp'}
					class:text-primary-content={earnSubTab === 'lp'}
					class:tab-active={earnSubTab === 'lp'}
					aria-selected={earnSubTab === 'lp'}
					onclick={() => {
						Sentry.addBreadcrumb({ category: 'defi.earn', message: 'tab switch to lp' });
						internalTab = 'lp';
					}}
				>
					<svg
						class="mr-1 h-4 w-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2"
						/>
					</svg>
					{$t('wallet.defi.earn_lp')}
				</button>
			</div>
		{/if}
		{#if earnSubTab === 'lending'}
			<div role="tabpanel" id="panel-lend" aria-labelledby="tab-lend">
				<EarnLendStep />
			</div>
		{:else}
			<div role="tabpanel" id="panel-lp" aria-labelledby="tab-lp">
				<EarnLPStep />
			</div>
		{/if}
	</div>
</Drawer>
