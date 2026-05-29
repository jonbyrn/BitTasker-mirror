<script lang="ts">
	import { t } from 'svelte-i18n';
	import Drawer from '$lib/components/Drawer.svelte';
	import BorrowStep from './defi/BorrowStep.svelte';
	import EarnLendStep from './defi/EarnLendStep.svelte';
	import EarnLPStep from './defi/EarnLPStep.svelte';

	let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();

	let activeTab = $state<'borrow' | 'earn'>('borrow');
	let earnSubTab = $state<'lending' | 'lp'>('lending');
</script>

<Drawer {isOpen} {onClose} title={$t('wallet.defi.title')} position="right" isScrollable={true}>
	<div class="p-4">
		<!-- Tab bar -->
		<div class="tabs tabs-boxed mb-4" role="tablist">
			<button
				role="tab"
				class="tab flex-1"
				class:tab-active={activeTab === 'borrow'}
				aria-selected={activeTab === 'borrow'}
				onclick={() => (activeTab = 'borrow')}
			>
				{$t('wallet.defi.tab_borrow')}
			</button>
			<button
				role="tab"
				class="tab flex-1"
				class:tab-active={activeTab === 'earn'}
				aria-selected={activeTab === 'earn'}
				onclick={() => (activeTab = 'earn')}
			>
				{$t('wallet.defi.tab_earn')}
			</button>
		</div>

		{#if activeTab === 'borrow'}
			<BorrowStep />
		{:else}
			<!-- Sub-selector for Earn -->
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
		{/if}
	</div>
</Drawer>
