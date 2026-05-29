<script lang="ts">
	import { t } from 'svelte-i18n';
	import Drawer from '$lib/components/Drawer.svelte';
	import BorrowStep from './defi/BorrowStep.svelte';

	let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();
</script>

<Drawer
	{isOpen}
	{onClose}
	title={$t('wallet.defi.tab_borrow')}
	position="right"
	isScrollable={true}
>
	<div class="p-4">
		<BorrowStep />
	</div>
</Drawer>
