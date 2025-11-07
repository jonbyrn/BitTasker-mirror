<script lang="ts">
	import { sendRequestCancellation } from '$lib/utils/nostr-scheduling';
	import { requestQueueStore } from '$lib/stores/request-queue.store';
	import { t } from 'svelte-i18n';

	const props = $props<{
		requestId: string;
		bidId: string;
		taskId: string;
		taskerPubkey: string;
		taskeePubkey: string;
		onCancelled?: () => void;
		onCancel?: () => void;
	}>();

	let isCancelling = $state(false);
	let showConfirm = $state(false);
	let reason = $state('');

	async function handleCancel() {
		if (!showConfirm) {
			showConfirm = true;
			return;
		}

		isCancelling = true;
		try {
			await sendRequestCancellation({
				requestId: props.requestId,
				bidId: props.bidId,
				taskId: props.taskId,
				taskerPubkey: props.taskerPubkey,
				taskeePubkey: props.taskeePubkey,
				reason: reason.trim() || undefined
			});

			// Update status
			requestQueueStore.updateRequestStatus(props.requestId, 'cancelled');

			if (props.onCancelled) {
				props.onCancelled();
			}
		} catch (error) {
			console.error('Failed to cancel request:', error);
		} finally {
			isCancelling = false;
			showConfirm = false;
		}
	}
</script>

<div class="space-y-3">
	{#if showConfirm}
		<div class="alert alert-warning alert-outline">
			<span>{$t('scheduling.cancel_confirm')}</span>
		</div>

		<div class="form-control">
			<label class="label">
				<span class="label-text">{$t('scheduling.cancel_reason')}</span>
				<span class="label-text-alt">{$t('common.optional')}</span>
			</label>
			<textarea
				class="textarea textarea-bordered"
				placeholder={$t('scheduling.cancel_reason_placeholder')}
				bind:value={reason}
				maxlength="500"
			></textarea>
		</div>
	{/if}

	<div class="flex gap-2">
		{#if showConfirm}
			<button class="btn btn-error btn-sm" onclick={handleCancel} disabled={isCancelling}>
				{#if isCancelling}
					<span class="loading loading-spinner loading-sm"></span>
				{:else}
					{$t('scheduling.confirm_cancel')}
				{/if}
			</button>
			<button class="btn btn-ghost btn-sm" onclick={() => (showConfirm = false)} disabled={isCancelling}>
				{$t('common.buttons.back')}
			</button>
		{:else}
			<button class="btn btn-error btn-sm" onclick={handleCancel}>
				{$t('scheduling.cancel_request')}
			</button>
			{#if props.onCancel}
				<button class="btn btn-ghost btn-sm" onclick={props.onCancel}>
					{$t('common.buttons.close')}
				</button>
			{/if}
		{/if}
	</div>
</div>

