<script lang="ts">
	import { t } from 'svelte-i18n';
	import Drawer from '$lib/components/Drawer.svelte';
	import BorrowStep from './defi/BorrowStep.svelte';

	let {
		isOpen,
		onClose,
		onGetWbtc
	}: { isOpen: boolean; onClose: () => void; onGetWbtc?: () => void } = $props();
</script>

<Drawer
	{isOpen}
	{onClose}
	title={$t('wallet.defi.tab_borrow')}
	position="right"
	isScrollable={true}
>
	<div class="p-3">
		<BorrowStep {onGetWbtc} />
	</div>
</Drawer>
