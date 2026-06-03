<script lang="ts">
	import { t } from 'svelte-i18n';
	import Drawer from '$lib/components/Drawer.svelte';
	import BorrowStep from './defi/BorrowStep.svelte';

	let {
		isOpen,
		onClose,
		onGetWbtc,
		isSubmitting = false
	}: {
		isOpen: boolean;
		onClose: () => void;
		onGetWbtc?: () => void;
		isSubmitting?: boolean;
	} = $props();
</script>

<Drawer
	{isOpen}
	{onClose}
	title={$t('wallet.defi.tab_borrow')}
	position="right"
	isScrollable={true}
	{isSubmitting}
>
	<BorrowStep {onGetWbtc} />
</Drawer>
