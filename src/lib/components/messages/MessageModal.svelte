<script lang="ts">
	import { t } from 'svelte-i18n';
	import MessagingLock from './MessagingLock.svelte';

	const props = $props<{
		isOpen: boolean;
		recipientName?: string;
		recipientPubkey: string;
		onClose: () => void;
	}>();

	// Message form state
	let messageText = $state('');
	let isSubmitting = $state(false);
	let messagingLocked = $state(true);
	let error = $state('');
	let success = $state(false);

	// Reset form when modal opens/closes
	$effect(() => {
		if (!props.isOpen) {
			messageText = '';
			isSubmitting = false;
			error = '';
			success = false;
		}
	});

	// Send message to recipient
	async function sendMessage() {
		if (messagingLocked || !messageText.trim() || !props.recipientPubkey) {
			error = $t('common.profile.message_required');
			return;
		}

		isSubmitting = true;
		error = '';

		try {
			// Import the message sending function
			const { sendDirectMessage } = await import('$lib/nostr/direct-messages');

			// Send the message
			await sendDirectMessage(messageText.trim(), props.recipientPubkey);

			success = true;
			messageText = '';
			// Close modal after a short delay to show success message
			setTimeout(() => {
				props.onClose();
			}, 1500);
		} catch (err) {
			console.error('Error sending message:', err);
			error = err instanceof Error ? err.message : $t('common.profile.message_send_error');
		} finally {
			isSubmitting = false;
		}
	}

	function handleClose() {
		if (!isSubmitting) {
			props.onClose();
		}
	}
</script>

{#if props.isOpen}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<!-- Modal Header -->
			<div class="mb-6">
				<div class="mb-2 flex items-center gap-3">
					<div class="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
						<svg class="text-primary h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
							/>
						</svg>
					</div>
					<div>
						<h4 class="text-sm font-semibold">{$t('common.profile.send_message')}</h4>
						<p class="text-base-content/60 text-xs">
							To: {props.recipientName}
						</p>
					</div>
				</div>
			</div>

			<!-- Message Form -->
			<form
				onsubmit={(e) => {
					e.preventDefault();
					sendMessage();
				}}
				class="space-y-4"
			>
				<MessagingLock pubkey={props.recipientPubkey} bind:locked={messagingLocked} />

				<div>
					<label for="message-text" class="text-base-content mb-2 block text-sm font-medium">
						{$t('common.profile.send_message')}
					</label>
					<textarea
						id="message-text"
						class="textarea textarea-bordered w-full"
						placeholder={$t('common.profile.message_placeholder') || 'Type your message here...'}
						bind:value={messageText}
						rows="4"
						disabled={isSubmitting || messagingLocked}
					></textarea>
				</div>

				<!-- Success Message -->
				{#if success}
					<div class="alert alert-success alert-outline py-2">
						<svg class="h-4 w-4 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						<span class="text-sm">{$t('common.profile.message_sent_successfully')}</span>
					</div>
				{/if}

				<!-- Error Message -->
				{#if error}
					<div class="alert alert-error alert-outline py-2">
						<svg class="h-4 w-4 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
						<span class="text-sm">{error}</span>
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="flex gap-2">
					<button type="button" class="btn btn-ghost flex-1" onclick={handleClose}>
						{$t('common.cancel')}
					</button>
					<button
						type="submit"
						class="btn btn-primary"
						disabled={messagingLocked || !messageText.trim() || isSubmitting || success}
					>
						{#if isSubmitting}
							<span class="loading loading-spinner loading-sm mr-2"></span>
							{$t('common.processing')}
						{:else if success}
							<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M5 13l4 4L19 7"
								/>
							</svg>
							{$t('common.profile.message_sent_successfully')}
						{:else}
							<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
								/>
							</svg>
							{$t('common.profile.send_message')}
						{/if}
					</button>
				</div>
			</form>
		</div>
		<button class="modal-backdrop" onclick={handleClose}>X</button>
	</div>
{/if}
