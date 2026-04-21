<script lang="ts">
	let {
		parentReviewId = '',
		revieweePubkey = '',
		revieweeLabel = '',
		parentReview = null,
		onSubmit = () => Promise.resolve(),
		onCancel = () => {}
	} = $props<{
		parentReviewId?: string;
		revieweePubkey?: string;
		revieweeLabel?: string | null;
		parentReview?: {
			id: string;
			reviewerPubkey?: string;
			subjectType: string;
			settlementType: string;
			contractOutcome: string;
			overallRating: number;
			content: { en: string; es: string };
		} | null;
		onSubmit?: (payload: {
			parentReviewId: string;
			content: { en: string; es: string };
			attachments: {
				url: string;
				type: 'image' | 'video';
				alt?: string;
				name?: string;
				size?: number;
			}[];
		}) => Promise<void> | void;
		onCancel?: () => void;
	}>();

	const submitReply = () =>
		onSubmit({
			parentReviewId,
			content: {
				en: '',
				es: 'Respuesta de seguimiento'
			},
			attachments: [
				{
					url: 'https://cdn.example.test/reply-attachment.jpg',
					type: 'image',
					alt: 'Reply attachment',
					name: 'reply-attachment.jpg',
					size: 2048
				}
			]
		});
</script>

<div
	data-testid="review-reply-composer"
	data-parent-review-id={parentReviewId}
	data-reviewee-pubkey={revieweePubkey}
	data-reviewee-label={revieweeLabel ?? ''}
	data-parent-review-subject-type={parentReview?.subjectType ?? ''}
	data-parent-review-settlement-type={parentReview?.settlementType ?? ''}
	data-parent-review-outcome={parentReview?.contractOutcome ?? ''}
	data-parent-review-rating={parentReview?.overallRating?.toFixed(1) ?? ''}
	data-parent-review-excerpt={parentReview?.content.en ?? ''}
>
	<button type="button" onclick={submitReply}>submit-reply</button>
	<button type="button" onclick={onCancel}>close</button>
</div>
