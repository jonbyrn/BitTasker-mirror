<script lang="ts">
	import { t } from 'svelte-i18n';

	interface Props {
		memo: string;
		expanded?: boolean;
		disabled?: boolean;
		labelText?: string; // Custom label text (e.g., "From Invoice" instead of "Optional")
		onMemoChange: (value: string) => void;
		onToggle?: (expanded: boolean) => void;
	}

	let {
		memo,
		expanded = false,
		disabled = false,
		labelText,
		onMemoChange,
		onToggle
	}: Props = $props();

	function handleToggle() {
		if (disabled) return; // Don't toggle if disabled
		if (onToggle) {
			onToggle(!expanded);
		}
	}

	function handleInput(e: Event) {
		const target = e.currentTarget as HTMLTextAreaElement;
		onMemoChange(target.value);
	}
</script>

<div
	class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
	class:collapse-open={expanded}
>
	<button
		type="button"
		class="collapse-title min-h-0 px-4 py-1 text-left font-medium {disabled
			? 'pointer-events-none cursor-not-allowed opacity-50'
			: ''}"
		onclick={handleToggle}
		{disabled}
		aria-disabled={disabled}
	>
		{$t('wallet.description')}
		{#if labelText}({$t(labelText)}){:else}({$t('wallet.optional')}){/if}
	</button>
	<div class="collapse-content px-2">
		<div class="form-control px-2 pt-2">
			<textarea
				class="textarea textarea-bordered text-base-content w-full"
				class:textarea-error={memo.length > 200 && !disabled}
				placeholder={$t('wallet.payment_for_placeholder')}
				value={memo}
				oninput={handleInput}
				{disabled}
				readonly={disabled}
				rows="3"
				maxlength="200"
			></textarea>
			{#if !disabled}
				<div class="label text-xs">
					<span class="label-text-alt {memo.length > 200 ? 'text-error' : 'text-base-content/70'}">
						{memo.length}/200 {$t('wallet.receive.description_characters')}
					</span>
				</div>
			{/if}
		</div>
	</div>
</div>
