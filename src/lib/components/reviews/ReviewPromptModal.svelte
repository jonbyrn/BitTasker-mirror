<script lang="ts">
	import type { ReviewComposerCategoryGroup } from './reviewTypes';
	import VerifiedReviewForm from './VerifiedReviewForm.svelte';

	let {
		isOpen,
		currentUserPubkey,
		revieweePubkey,
		revieweeLabel,
		subjectLabel,
		subjectType,
		settlementType,
		contractOutcome,
		revieweeRole,
		categoryGroups = [],
		initialRating = 0,
		onClose,
		onSubmit
	} = $props<{
		isOpen: boolean;
		currentUserPubkey: string;
		revieweePubkey: string;
		revieweeLabel?: string | null;
		subjectLabel?: string | null;
		subjectType: 'task' | 'service_booking';
		settlementType: string;
		contractOutcome: string;
		revieweeRole: 'tasker' | 'taskee' | 'client' | 'provider' | 'freelancer';
		categoryGroups?: ReviewComposerCategoryGroup[];
		initialRating?: number;
		onClose: () => void;
		onSubmit?: (payload: unknown) => void | Promise<void>;
	}>();
</script>

{#if isOpen}
	<div class="modal modal-open">
		<div class="modal-box max-h-[90vh] max-w-4xl overflow-y-auto">
			{#key `${currentUserPubkey}:${revieweePubkey}:${subjectType}:${settlementType}:${contractOutcome}:${subjectLabel ?? ''}`}
				<VerifiedReviewForm
					{currentUserPubkey}
					{revieweePubkey}
					{revieweeLabel}
					{subjectLabel}
					{subjectType}
					{settlementType}
					{contractOutcome}
					{revieweeRole}
					{categoryGroups}
					{initialRating}
					{onSubmit}
					onCancel={onClose}
				/>
			{/key}
		</div>
	</div>
{/if}
