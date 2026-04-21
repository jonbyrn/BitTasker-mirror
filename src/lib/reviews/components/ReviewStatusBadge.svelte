<script lang="ts">
	import type { ReviewContractOutcome } from '$lib/reviews';
	import { getReviewOutcomeLabel } from '$lib/components/reviews/reviewDisplay';
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';

	let { outcome = null, state = 'available' } = $props<{
		outcome?: ReviewContractOutcome | null;
		state?: 'pending' | 'available' | 'submitted' | 'not_reviewable' | 'invalid';
	}>();

	const label = $derived.by(() => {
		const translate = get(t);
		if (state === 'pending') return translate('reviews.status.pending_settlement');
		if (state === 'submitted') return translate('reviews.status.submitted');
		if (state === 'not_reviewable') return translate('reviews.status.not_reviewable');
		if (state === 'invalid') return translate('reviews.status.invalid');
		return getReviewOutcomeLabel(outcome, translate);
	});

	const badgeClass = $derived.by(() => {
		if (state === 'submitted') return 'badge-success';
		if (state === 'pending') return 'badge-info';
		if (state === 'invalid') return 'badge-error';
		if (state === 'not_reviewable') return 'badge-neutral';
		if (outcome === 'refunded') return 'badge-warning';
		return 'badge-success';
	});
</script>

<div class={`badge badge-sm ${badgeClass}`}>{label}</div>
