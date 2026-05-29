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
		<div role="tablist" class="tabs tabs-boxed mb-4">
			<button
				role="tab"
				class="tab flex-1"
				aria-selected={earnSubTab === 'lending'}
				onclick={() => (earnSubTab = 'lending')}
			>
				{$t('wallet.defi.earn_lending')}
			</button>
			<button
				role="tab"
				class="tab flex-1"
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
