<script lang="ts">
	import { t } from 'svelte-i18n';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';

	interface Props {
		memo: string;
		expanded?: boolean;
		onMemoChange: (value: string) => void;
		onToggle?: (expanded: boolean) => void;
	}

	let { memo, expanded = false, onMemoChange, onToggle }: Props = $props();

	function handleToggle() {
		triggerHaptic(ImpactStyle.Light);
		if (onToggle) {
			onToggle(!expanded);
		}
	}

	function handleInput(e: Event) {
		const target = e.currentTarget as HTMLTextAreaElement;
		onMemoChange(target.value);
	}
</script>

<div class="collapse collapse-arrow border-2 border-primary rounded-lg bg-base-100" class:collapse-open={expanded}>
	<button
		type="button"
		class="collapse-title min-h-0 py-1 px-4 font-medium text-left"
		onclick={handleToggle}
	>
		{$t('wallet.description')} ({$t('wallet.optional')})
	</button>
	<div class="collapse-content">
		<div class="form-control pt-2 pb-2 px-2">
			<textarea
				class="textarea textarea-bordered w-full"
				class:textarea-error={memo.length > 200}
				placeholder={$t('wallet.payment_for_placeholder')}
				value={memo}
				oninput={handleInput}
				rows="3"
				maxlength="200"
			></textarea>
			<div class="label text-xs">
				<span class="label-text-alt {memo.length > 200 ? 'text-error' : 'text-base-content/70'}">
					{memo.length}/200 {$t('wallet.receive.description_characters')}
				</span>
			</div>
		</div>
	</div>
</div>

