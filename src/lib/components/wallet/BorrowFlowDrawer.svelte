<script lang="ts">
	import LoanWizardDrawer from './defi/loan-wizard/LoanWizardDrawer.svelte';

	let {
		isOpen,
		onClose
	}: {
		isOpen: boolean;
		onClose: () => void;
	} = $props();
</script>

<LoanWizardDrawer {isOpen} {onClose} />
