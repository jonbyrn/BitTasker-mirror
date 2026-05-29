<script lang="ts">
	import { t } from 'svelte-i18n';
	import Drawer from '$lib/components/Drawer.svelte';
	import EarnLendStep from './defi/EarnLendStep.svelte';
	import EarnLPStep from './defi/EarnLPStep.svelte';

	let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();

	let earnSubTab = $state<'lending' | 'lp'>('lending');
</script>

<Drawer {isOpen} {onClose} title={$t('wallet.defi.tab_earn')} position="right" isScrollable={true}>
	<div class="p-4">
		<!-- Sub-selector -->
		<div class="join mb-4 w-full">
			<button
				class="join-item btn btn-sm flex-1"
				class:btn-active={earnSubTab === 'lending'}
				aria-pressed={earnSubTab === 'lending'}
				onclick={() => (earnSubTab = 'lending')}
			>
				{$t('wallet.defi.earn_lending')}
			</button>
			<button
				class="join-item btn btn-sm flex-1"
				class:btn-active={earnSubTab === 'lp'}
				aria-pressed={earnSubTab === 'lp'}
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
