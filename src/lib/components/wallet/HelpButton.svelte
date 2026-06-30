<script lang="ts">
	import { t } from 'svelte-i18n';
	import IconHelpCircle from '~icons/mdi/help-circle';
	import { openHelpModal } from '$lib/runes/helpModal.svelte';

	interface Props {
		/** i18n key for aria-label, or plain string */
		ariaLabel?: string;
	}

	let { ariaLabel }: Props = $props();

	function handleClick(e: MouseEvent) {
		e.stopPropagation();
		openHelpModal();
	}
</script>

<button
	type="button"
	class="text-primary-content hover:text-primary-content shrink-0 cursor-pointer p-0.5 opacity-80 hover:bg-transparent hover:opacity-100 sm:ml-1 sm:p-1"
	onclick={handleClick}
	aria-label={ariaLabel ?? $t('wallet.learn_more')}
>
	<IconHelpCircle class="h-6 w-6" />
</button>
