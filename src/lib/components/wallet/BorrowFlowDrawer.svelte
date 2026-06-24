<script lang="ts">
	import LoanWizardDrawer from './defi/loan-wizard/LoanWizardDrawer.svelte';

	let {
		isOpen,
		onClose,
		onGetWbtc,
		onBuyWbtc,
		isSubmitting = false
	}: {
		isOpen: boolean;
		onClose: () => void;
		onGetWbtc?: () => void;
		onBuyWbtc?: () => void;
		isSubmitting?: boolean;
	} = $props();
</script>

<LoanWizardDrawer {isOpen} {onClose} {onGetWbtc} {onBuyWbtc} {isSubmitting} />
