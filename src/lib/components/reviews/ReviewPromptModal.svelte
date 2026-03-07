<script lang="ts">
	// @ts-nocheck - Svelte 5 component type inference issues with VerifiedReviewForm
	import { t } from 'svelte-i18n';
	import { getNpub, npubToHex, hexToNpub } from '$lib/utils/nostrKeys';
	import { escrow } from '$lib/utils/escrow';
	import { fetchProfileMetadata } from '$lib/utils/nostr-message';
	import { getRevieweeRole } from '$lib/utils/review-helpers';
	import { ESCROW_STATUSES_REVIEW_COMPLETED } from '$lib/utils/escrow';
	import VerifiedReviewForm from './VerifiedReviewForm.svelte';
	// @ts-expect-error - Svelte 5 component, no default export needed
	import Drawer from '../Drawer.svelte';

	let {
		isOpen,
		escrowId,
		revieweePubkey,
		revieweeName,
		escrowTxHash,
		taskId,
		escrowConfirmed = false,
		onClose,
		onSubmit
	} = $props<{
		isOpen: boolean;
		escrowId?: string;
		revieweePubkey?: string;
		revieweeName?: string;
		escrowTxHash?: string;
		taskId?: string | null;
		/**
		 * When true, skip the blockchain escrow status check.
		 * Pass this when the caller already knows the escrow is confirmed
		 * (e.g. triggered by a FundsReleased Nostr event).
		 */
		escrowConfirmed?: boolean;
		onClose: () => void;
		onSubmit?: (eventId: string) => void;
	}>();

	let targetRevieweePubkey = $state<string | null>(null);
	let targetRevieweeName = $state<string | null>(null);
	let targetTaskId = $state<string | null>(null);
	let revieweeRole = $state<'tasker' | 'taskee' | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	async function loadReviewDetails(isCancelled?: () => boolean) {
		if (!escrowId) return;
		isLoading = true;
		error = null;

		try {
			const currentUserNpub = await getNpub();
			if (isCancelled?.()) return;
			const currentUserPubkey = npubToHex(currentUserNpub ?? '');

			// Resolve reviewee pubkey and taskId from contract when not provided by caller
			if (!targetRevieweePubkey || !targetTaskId) {
				const contracts = await escrow.contractOps.getContracts({ escrowIds: [escrowId] });
				if (isCancelled?.()) return;
				if (contracts.length === 0) {
					error = $t('reviews.prompt.contract_not_found');
					return;
				}
				const content = contracts[0].contractEvent.content;
				if (!targetRevieweePubkey) {
					if (content.clientPubkey === currentUserPubkey) {
						targetRevieweePubkey = content.freelancerPubkey;
					} else if (content.freelancerPubkey === currentUserPubkey) {
						targetRevieweePubkey = content.clientPubkey;
					} else {
						error = $t('reviews.prompt.not_participant');
						return;
					}
				}
				if (!targetTaskId && content.taskId) {
					targetTaskId = content.taskId;
				}
			}

			// Fetch reviewee display name if missing
			if (!targetRevieweeName && targetRevieweePubkey) {
				try {
					const profile = await fetchProfileMetadata(hexToNpub(targetRevieweePubkey));
					if (!isCancelled?.()) targetRevieweeName = profile.name || null;
				} catch {
					/* continue without name */
				}
			}
			if (isCancelled?.()) return;

			// Only check escrow status when the caller hasn't already confirmed it
			if (!escrowConfirmed) {
				const escrowData = await escrow.getEscrow(escrowId);
				if (isCancelled?.()) return;
				if (!escrowData || !ESCROW_STATUSES_REVIEW_COMPLETED.includes(escrowData.status)) {
					onClose();
					return;
				}
			}

			// Determine reviewee role
			if (targetRevieweePubkey && escrowId) {
				revieweeRole = await getRevieweeRole(escrowId, targetRevieweePubkey);
			}
			if (isCancelled?.()) return;

			// taskId is required to submit; must come from props or from loaded contract
			if (!targetTaskId?.trim()) {
				error = $t('reviews.form.errors.task_id_required');
			}
		} catch (err) {
			if (!isCancelled?.()) {
				console.error('[ReviewPromptModal] Failed to load details:', err);
				error = err instanceof Error ? err.message : $t('reviews.prompt.load_error');
			}
		} finally {
			if (!isCancelled?.()) isLoading = false;
		}
	}

	$effect(() => {
		if (!isOpen) return;
		targetRevieweePubkey = revieweePubkey ?? null;
		targetRevieweeName = revieweeName ?? null;
		targetTaskId = taskId ?? null;
		revieweeRole = null;
		error = null;
		let cancelled = false;
		(async () => {
			await loadReviewDetails(() => cancelled);
		})();
		return () => {
			cancelled = true;
		};
	});

	function handleSubmit(eventId: string) {
		onSubmit?.(eventId);
		onClose();
	}

	function handleCancel() {
		onClose();
	}
</script>

<Drawer {isOpen} title="" {onClose} position="right" isScrollable={true}>
	{#if isLoading}
		<!-- Skeleton: mimics the review form layout so there's no layout jump -->
		<div class="animate-pulse space-y-6 px-1">
			<div class="border-base-300 flex items-center gap-3 border-b pb-4">
				<div class="bg-base-300 h-12 w-12 rounded-full"></div>
				<div class="flex-1 space-y-2">
					<div class="bg-base-300 h-3 w-16 rounded"></div>
					<div class="bg-base-300 h-4 w-36 rounded"></div>
				</div>
			</div>
			{#each [1, 2, 3] as row (row)}
				<div class="space-y-2">
					<div class="bg-base-300 h-3 w-28 rounded"></div>
					<div class="flex gap-2">
						{#each [1, 2, 3, 4, 5] as cell (cell)}
							<div class="bg-base-300 h-8 w-8 rounded-full"></div>
						{/each}
					</div>
				</div>
			{/each}
			<div class="bg-base-300 h-24 w-full rounded-lg"></div>
			<div class="bg-base-300 h-10 w-full rounded-lg"></div>
		</div>
	{:else if error}
		<div class="alert alert-outline alert-error shadow-sm">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span class="text-sm">{error}</span>
		</div>
	{:else if targetRevieweePubkey && escrowId}
		{#if targetRevieweeName}
			<div class="border-base-300 mb-6 border-b pb-4">
				<div class="flex items-center gap-3">
					<div class="avatar placeholder">
						<div class="bg-primary/20 text-primary w-12 rounded-full">
							<span class="text-lg font-semibold">{targetRevieweeName.charAt(0).toUpperCase()}</span
							>
						</div>
					</div>
					<div>
						<p class="text-base-content/50 mb-1 text-xs">{$t('reviews.prompt.reviewing')}</p>
						<p class="text-base-content text-base font-semibold">{targetRevieweeName}</p>
					</div>
				</div>
			</div>
		{/if}
		{#if targetRevieweePubkey && escrowId}
			{@const _formProps = {
				escrowId: escrowId as string,
				revieweePubkey: targetRevieweePubkey as string,
				escrowTxHash: escrowTxHash as string | undefined,
				taskId: targetTaskId ?? undefined,
				onSubmit: handleSubmit as (eventId: string) => void,
				onCancel: handleCancel as () => void
			}}
			<!-- @ts-expect-error Svelte 5 component props type inference - props are correctly typed -->
			<VerifiedReviewForm
				escrowId={_formProps.escrowId}
				revieweePubkey={_formProps.revieweePubkey}
				escrowTxHash={_formProps.escrowTxHash}
				{revieweeRole}
				taskId={_formProps.taskId}
				onSubmit={_formProps.onSubmit}
				onCancel={_formProps.onCancel}
			/>
		{/if}
	{:else if targetRevieweePubkey && !escrowId}
		<!-- Direct pubkey provided without escrowId - escrowId is required -->
		<div class="alert alert-outline alert-warning shadow-sm">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
			<span class="text-sm">{$t('reviews.prompt.missing_escrow')}</span>
		</div>
	{:else if !escrowId && !revieweePubkey}
		<div class="alert alert-outline alert-warning shadow-sm">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
			<span class="text-sm">{$t('reviews.prompt.missing_info')}</span>
		</div>
	{/if}
</Drawer>
