<script lang="ts">
	import type { Attachment } from '$lib/types/task';

	const {
		isOpen = false,
		onClose = () => {},
		onComplete = async (_attachments: Attachment[]) => {}
	} = $props<{
		isOpen?: boolean;
		onClose?: () => void;
		onComplete?: (attachments: Attachment[]) => Promise<void>;
	}>();
</script>

{#if isOpen}
	<div data-testid="mock-task-completion-modal">
		<button type="button" data-testid="mock-task-completion-confirm" onclick={() => onComplete([])}>
			Complete Contract
		</button>
		<button type="button" onclick={onClose}>Close Contract Modal</button>
	</div>
{/if}
