<script lang="ts">
	let {
		isOpen = false,
		revieweePubkey = '',
		revieweeLabel = '',
		subjectLabel = '',
		onSubmit = () => Promise.resolve(),
		onClose = () => {}
	} = $props<{
		isOpen?: boolean;
		revieweePubkey?: string;
		revieweeLabel?: string | null;
		subjectLabel?: string | null;
		onSubmit?: (payload: {
			overallRating: number;
			content: { en: string; es: string };
			categoryScores?: { id: string; value: number; label: string }[];
			attachments?: {
				url: string;
				type: 'image' | 'video';
				alt?: string;
				name?: string;
				size?: number;
			}[];
		}) => Promise<void> | void;
		onClose?: () => void;
	}>();

	const submitReview = () =>
		onSubmit({
			overallRating: 5,
			content: {
				en: 'English review draft',
				es: ''
			},
			attachments: [
				{
					url: 'https://cdn.example.test/review-attachment.jpg',
					type: 'image',
					alt: 'Review attachment',
					name: 'review-attachment.jpg',
					size: 1024
				}
			]
		});

	const submitBilingualReview = () =>
		onSubmit({
			overallRating: 4,
			content: {
				en: 'Already translated review',
				es: 'Reseña ya traducida'
			},
			attachments: []
		});
</script>

{#if isOpen}
	<div
		data-testid="review-prompt-modal"
		data-reviewee-pubkey={revieweePubkey}
		data-reviewee-label={revieweeLabel ?? ''}
		data-subject-label={subjectLabel ?? ''}
	>
		<button type="button" onclick={submitReview}>submit-review</button>
		<button type="button" onclick={submitBilingualReview}>submit-bilingual-review</button>
		<button type="button" onclick={onClose}>close</button>
	</div>
{/if}
