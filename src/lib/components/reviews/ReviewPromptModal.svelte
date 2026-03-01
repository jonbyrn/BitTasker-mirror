<script lang="ts">
	// @ts-nocheck - Svelte 5 component type inference issues with VerifiedReviewForm
	import { t } from 'svelte-i18n';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { escrow } from '$lib/utils/escrow';
	import { getUserContracts } from '$lib/utils/nostr-bid';
	import { fetchProfileMetadata } from '$lib/utils/nostr-message';
	import { getRevieweeRole } from '$lib/utils/review-helpers';
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore nostr-tools type definitions issue
	import { nip19 } from 'nostr-tools';
	import { EscrowStatus } from '$lib/utils/escrow';
	import VerifiedReviewForm from './VerifiedReviewForm.svelte';
	// @ts-ignore - Svelte 5 component, no default export needed
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
	let revieweeRole = $state<'tasker' | 'taskee' | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	// Convert hex pubkey to npub if needed
	function hexToNpub(hexPubkey: string): string {
		try {
			if (hexPubkey.startsWith('npub')) return hexPubkey;
			return nip19.npubEncode(hexPubkey);
		} catch {
			return hexPubkey;
		}
	}

	async function loadReviewDetails() {
		if (!escrowId) return;
		isLoading = true;
		error = null;

		try {
			const currentUserNpub = await getNpub();
			const currentUserPubkey = currentUserNpub.startsWith('npub')
				? (nip19.decode(currentUserNpub).data as string)
				: currentUserNpub;

			// Resolve reviewee pubkey if not already provided
			if (!targetRevieweePubkey) {
				const contracts = await getUserContracts({ escrowIds: [escrowId] });
				if (contracts.length === 0) {
					error = $t('reviews.prompt.contract_not_found');
					return;
				}
				const content = contracts[0].contractEvent.content;
				if (content.clientPubkey === currentUserPubkey) {
					targetRevieweePubkey = content.freelancerPubkey;
				} else if (content.freelancerPubkey === currentUserPubkey) {
					targetRevieweePubkey = content.clientPubkey;
				} else {
					error = $t('reviews.prompt.not_participant');
					return;
				}
			}

			// Fetch reviewee display name if missing
			if (!targetRevieweeName && targetRevieweePubkey) {
				try {
					const profile = await fetchProfileMetadata(hexToNpub(targetRevieweePubkey));
					targetRevieweeName = profile.name || null;
				} catch { /* continue without name */ }
			}

			// Only check escrow status when the caller hasn't already confirmed it
			if (!escrowConfirmed) {
				const escrowData = await escrow.getEscrow(escrowId);
				const completedStates = [
					EscrowStatus.Completed,
					EscrowStatus.FundsReleased,
					EscrowStatus.DisputeResolved
				];
				if (!escrowData || !completedStates.includes(escrowData.status)) {
					// Not ready yet — close modal and let caller handle notification
					onClose();
					return;
				}
			}

			// Determine reviewee role
			if (targetRevieweePubkey && escrowId) {
				revieweeRole = await getRevieweeRole(escrowId, targetRevieweePubkey);
			}
		} catch (err) {
			console.error('[ReviewPromptModal] Failed to load details:', err);
			error = err instanceof Error ? err.message : $t('reviews.prompt.load_error');
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		if (isOpen) {
			targetRevieweePubkey = revieweePubkey ?? null;
			targetRevieweeName = revieweeName ?? null;
			revieweeRole = null;
			error = null;
			loadReviewDetails();
		}
	});

	function handleSubmit(eventId: string) {
		onSubmit?.(eventId);
		onClose();
	}

	function handleCancel() {
		onClose();
	}
</script>

<Drawer
	isOpen={isOpen}
	title=""
	onClose={onClose}
	position="right"
	isScrollable={true}
>
	{#snippet children()}
		{#if isLoading}
			<!-- Skeleton: mimics the review form layout so there's no layout jump -->
			<div class="space-y-6 animate-pulse px-1">
				<div class="flex items-center gap-3 pb-4 border-b border-base-300">
					<div class="bg-base-300 rounded-full w-12 h-12"></div>
					<div class="space-y-2 flex-1">
						<div class="bg-base-300 h-3 w-16 rounded"></div>
						<div class="bg-base-300 h-4 w-36 rounded"></div>
					</div>
				</div>
				{#each [1, 2, 3] as _}
					<div class="space-y-2">
						<div class="bg-base-300 h-3 w-28 rounded"></div>
						<div class="flex gap-2">
							{#each [1, 2, 3, 4, 5] as __}
								<div class="bg-base-300 h-8 w-8 rounded-full"></div>
							{/each}
						</div>
					</div>
				{/each}
				<div class="bg-base-300 h-24 rounded-lg w-full"></div>
				<div class="bg-base-300 h-10 rounded-lg w-full"></div>
			</div>
		{:else if error}
			<div class="alert alert-outline alert-error shadow-sm">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<span class="text-sm">{error}</span>
			</div>
		{:else if targetRevieweePubkey && escrowId}
			{#if targetRevieweeName}
				<div class="mb-6 pb-4 border-b border-base-300">
					<div class="flex items-center gap-3">
						<div class="avatar placeholder">
							<div class="bg-primary/20 text-primary rounded-full w-12">
								<span class="text-lg font-semibold">{targetRevieweeName.charAt(0).toUpperCase()}</span>
							</div>
						</div>
						<div>
							<p class="text-xs text-base-content/50 mb-1">{$t('reviews.prompt.reviewing')}</p>
							<p class="text-base font-semibold text-base-content">{targetRevieweeName}</p>
						</div>
					</div>
				</div>
			{/if}
			{#if targetRevieweePubkey && escrowId}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				{@const _formProps = {
					escrowId: escrowId as string,
					revieweePubkey: targetRevieweePubkey as string,
					escrowTxHash: escrowTxHash as string | undefined,
					taskId: taskId ?? undefined,
					onSubmit: handleSubmit as (eventId: string) => void,
					onCancel: handleCancel as () => void
				}}
				<!-- @ts-ignore Svelte 5 component props type inference - props are correctly typed -->
				<VerifiedReviewForm
					escrowId={_formProps.escrowId}
					revieweePubkey={_formProps.revieweePubkey}
					escrowTxHash={_formProps.escrowTxHash}
					revieweeRole={revieweeRole}
					taskId={_formProps.taskId}
					onSubmit={_formProps.onSubmit}
					onCancel={_formProps.onCancel}
				/>
			{/if}
		{:else if targetRevieweePubkey && !escrowId}
			<!-- Direct pubkey provided without escrowId - escrowId is required -->
			<div class="alert alert-outline alert-warning shadow-sm">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
				</svg>
				<span class="text-sm">{$t('reviews.prompt.missing_escrow')}</span>
			</div>
		{:else if !escrowId && !revieweePubkey}
			<div class="alert alert-outline alert-warning shadow-sm">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
				</svg>
				<span class="text-sm">{$t('reviews.prompt.missing_info')}</span>
			</div>
		{/if}
	{/snippet}
</Drawer>

