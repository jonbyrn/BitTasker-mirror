<script lang="ts">
	let {
		escrowId,
		revieweePubkey,
		escrowTxHash,
		revieweeRole,
		onSubmit,
		onCancel
	}: {
		escrowId: string;
		revieweePubkey: string;
		escrowTxHash?: string;
		revieweeRole?: 'tasker' | 'taskee' | null;
		onSubmit?: (eventId: string) => void;
		onCancel?: () => void;
	} = $props();
</script>

<div
	data-testid="mock-review-form"
	data-escrow-id={escrowId}
	data-reviewee-pubkey={revieweePubkey}
	data-escrow-tx-hash={escrowTxHash ?? ''}
	data-reviewee-role={revieweeRole ?? ''}
>
	mock form {revieweeRole}
</div>

<button type="button" onclick={() => onSubmit?.('mock-event-id')}>Mock submit review</button>
<button type="button" onclick={() => onCancel?.()}>Mock cancel review</button>
