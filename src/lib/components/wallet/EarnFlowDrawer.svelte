<script lang="ts">
	import { t } from 'svelte-i18n';
	import Drawer from '$lib/components/Drawer.svelte';
	import EarnLendStep from './defi/EarnLendStep.svelte';
	import EarnLPStep from './defi/EarnLPStep.svelte';

	let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();

	let earnSubTab = $state<'lending' | 'lp'>('lending');
</script>

<Drawer {isOpen} {onClose} title={$t('wallet.defi.tab_earn')} position="right" isScrollable={true}>
	<div class="p-3">
		<!-- Sub-selector — matching wallet/connected tabs pattern -->
		<div role="tablist" class="tabs tabs-boxed border-base-300 mb-4 shrink-0 rounded-lg border">
			<button
				role="tab"
				class="tab flex-1"
				class:bg-primary={earnSubTab === 'lending'}
				class:text-primary-content={earnSubTab === 'lending'}
				class:tab-active={earnSubTab === 'lending'}
				aria-selected={earnSubTab === 'lending'}
				onclick={() => (earnSubTab = 'lending')}
			>
				{$t('wallet.defi.earn_lending')}
			</button>
			<button
				role="tab"
				class="tab flex-1"
				class:bg-primary={earnSubTab === 'lp'}
				class:text-primary-content={earnSubTab === 'lp'}
				class:tab-active={earnSubTab === 'lp'}
				aria-selected={earnSubTab === 'lp'}
				onclick={() => (earnSubTab = 'lp')}
			>
				{$t('wallet.defi.earn_lp')}
			</button>
		</div>
		{#if earnSubTab === 'lending'}
			<EarnLendStep />
		{:else}
			<EarnLPStep />
		{/if}
	</div>
</Drawer>
