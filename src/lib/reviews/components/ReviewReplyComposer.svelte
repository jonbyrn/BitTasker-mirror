<script lang="ts">
	import ReviewComposer from './ReviewComposer.svelte';
	import type {
		ReviewDraftPayload,
		ReviewReplyPayload,
		ReviewRole,
		ReviewSettlementType,
		ReviewSubjectType
	} from '$lib/reviews';

	let {
		draftKey = 'review-reply',
		reviewerPubkey = '',
		revieweePubkey = '',
		subjectType = 'task',
		settlementType = 'escrow',
		reviewerRole = 'provider',
		revieweeRole = 'client',
		contractOutcome = 'completed',
		parentReviewEventId = '',
		onSubmit = async () => {},
		onCancel = () => {}
	} = $props<{
		draftKey?: string;
		reviewerPubkey?: string;
		revieweePubkey?: string;
		subjectType?: ReviewSubjectType;
		settlementType?: ReviewSettlementType;
		reviewerRole?: ReviewRole;
		revieweeRole?: ReviewRole;
		contractOutcome?:
			| 'completed'
			| 'disputed_resolved_payout'
			| 'disputed_resolved_refund'
			| 'refunded';
		parentReviewEventId?: string;
		onSubmit?: (reply: ReviewReplyPayload) => Promise<void> | void;
		onCancel?: () => void;
	}>();

	async function handleSubmit(draft: ReviewDraftPayload) {
		await onSubmit({
			schemaVersion: 1,
			parentReviewEventId,
			revieweePubkey,
			createdAt: draft.createdAt,
			content: draft.content,
			attachments: draft.attachments
		});
	}
</script>

<ReviewComposer
	mode="reply"
	{draftKey}
	{reviewerPubkey}
	{revieweePubkey}
	{subjectType}
	{settlementType}
	{reviewerRole}
	{revieweeRole}
	{contractOutcome}
	showRating={false}
	onSubmit={handleSubmit}
	{onCancel}
/>
