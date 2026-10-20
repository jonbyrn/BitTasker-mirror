<script lang="ts">
	import { t } from 'svelte-i18n';
	import { publishNostrEvent } from '$lib/utils/nostr';
	import KINDS from '$lib/utils/constants/kinds';
	import { appStore } from '$lib/stores/app.store';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { contractTaskId } from '$lib/utils/contract/contract-tabs';
	import { resolveSharedRelays } from '$lib/utils/relayUrls';
	import {
		loadReviewSourceEvents,
		reviewGateFor,
		reviewedContractIds
	} from '$lib/utils/reviews/settled-escrow';
	import type { IContractForReview } from '$lib/utils/reviews/contract-interface';
	import IconStar from '~icons/mdi/star';
	import IconStarOutline from '~icons/mdi/star-outline';

	let {
		escrowId,
		revieweePubkey,
		escrowTxHash = undefined,
		contract: _contract = null,
		revieweeRole = null,
		onSubmit = (_eventId: string) => {},
		onCancel = () => {}
	}: {
		escrowId: string;
		revieweePubkey: string;
		escrowTxHash?: string;
		contract?: IContractForReview | null;
		revieweeRole?: 'tasker' | 'taskee' | null;
		onSubmit?: (eventId: string) => void;
		onCancel?: () => void;
	} = $props();
	let rating = $state(0);
	let comment = $state('');
	let isSubmitting = $state(false);
	let errorMessage = $state('');

	const canSubmit = $derived(rating >= 1 && rating <= 5 && !isSubmitting);

	async function taskSlug(taskEventId: string): Promise<string | null> {
		const relays = resolveSharedRelays();
		if (!taskEventId || relays.length === 0 || typeof WebSocket === 'undefined') return null;
		const { queryRelayEvents } = await import('$lib/nostr/relayQuery');
		const events = await queryRelayEvents(relays, { ids: [taskEventId], limit: 1 });
		return events[0]?.tags.find((tag) => tag[0] === 'd')?.[1] ?? null;
	}

	async function handleSubmit(): Promise<void> {
		if (!canSubmit) return;
		isSubmitting = true;
		errorMessage = '';
		try {
			const reviewer = await getNpub();
			if (!reviewer) {
				throw new Error('Sign in before leaving a review.');
			}
			const source = await loadReviewSourceEvents(reviewer);
			if (reviewedContractIds(source.reviews).has(escrowId)) {
				throw new Error('You already reviewed this escrow.');
			}
			const gate = reviewGateFor(source.statuses, escrowId, reviewer, revieweePubkey);
			if (!gate.ok) throw new Error(gate.reason);
			const subjects = [...gate.subjects];
			const taskEventId = contractTaskId(escrowId);
			if (taskEventId) {
				const slug = await taskSlug(taskEventId);
				if (slug && !subjects.includes(slug)) subjects.push(slug);
			}
			const content = JSON.stringify({
				type: 'review',
				escrowId,
				rating: { overallRating: rating },
				comment: comment.trim() || undefined,
				revieweeRole: revieweeRole ?? undefined,
				escrowTxHash: escrowTxHash ?? undefined,
				timestamp: Date.now()
			});
			const tags = [
				['p', revieweePubkey],
				['e', escrowId],
				...subjects.map((subject) => ['t', subject])
			];
			const result = await publishNostrEvent(KINDS.REVIEW, content, revieweePubkey, tags);
			appStore.showSuccessToast($t('reviews.form.submitted', { default: 'Review submitted' }));
			onSubmit(result.event.id);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : $t('reviews.form.submit_failed');
			appStore.showErrorToast(errorMessage);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<form
	class="flex flex-col gap-4"
	data-testid="verified-review-form"
	onsubmit={(e) => {
		e.preventDefault();
		void handleSubmit();
	}}
>
	<!-- Star rating -->
	<div
		class="flex items-center gap-1"
		role="radiogroup"
		aria-label={$t('reviews.form.rating_label', { default: 'Rating' })}
	>
		{#each [1, 2, 3, 4, 5] as star (star)}
			<button
				type="button"
				class="btn btn-ghost btn-sm btn-square"
				aria-label={$t('reviews.form.star', { default: 'Star' }) + ` ${star}`}
				aria-pressed={rating >= star}
				onclick={() => (rating = star)}
				data-testid={`star-${star}`}
			>
				{#if rating >= star}
					<IconStar class="text-warning h-7 w-7" />
				{:else}
					<IconStarOutline class="text-base-content/40 h-7 w-7" />
				{/if}
			</button>
		{/each}
	</div>

	<label class="form-control">
		<span class="label-text mb-1">
			{$t('reviews.form.comment_label', { default: 'Share your experience (optional)' })}
		</span>
		<textarea
			class="textarea textarea-bordered w-full"
			rows="4"
			bind:value={comment}
			data-testid="review-comment"
		></textarea>
	</label>

	{#if errorMessage}
		<div class="alert alert-error text-sm" role="alert" data-testid="review-error">
			{errorMessage}
		</div>
	{/if}

	<div class="flex gap-3">
		<button
			type="button"
			class="btn btn-ghost flex-1"
			onclick={onCancel}
			disabled={isSubmitting}
			data-testid="review-cancel"
		>
			{$t('common.cancel', { default: 'Cancel' })}
		</button>
		<button
			type="submit"
			class="btn btn-primary flex-1"
			disabled={!canSubmit}
			data-testid="review-submit"
		>
			{#if isSubmitting}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			{$t('reviews.form.submit', { default: 'Submit review' })}
		</button>
	</div>
</form>
