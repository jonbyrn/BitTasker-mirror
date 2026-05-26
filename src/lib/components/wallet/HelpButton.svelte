<script lang="ts">
	import IconHelpCircle from '~icons/mdi/help-circle';

	interface Props {
		/** i18n key for aria-label, or plain string */
		ariaLabel?: string;
	}

	let { ariaLabel = 'Learn more' }: Props = $props();

	function openHelpModal(e: MouseEvent) {
		e.stopPropagation();
		(document.querySelector('[data-help-modal]') as HTMLButtonElement)?.click();
	}
</script>

<button
	type="button"
	class="shrink-0 cursor-pointer p-0.5 text-white opacity-80 hover:bg-transparent hover:text-white hover:opacity-100 sm:ml-1 sm:p-1"
	onclick={openHelpModal}
	aria-label={ariaLabel}
>
	<IconHelpCircle class="h-6 w-6" />
</button>
