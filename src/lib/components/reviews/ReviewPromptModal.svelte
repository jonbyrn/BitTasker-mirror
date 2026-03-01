<script lang="ts">
	// @ts-nocheck - Svelte 5 component type inference issues with VerifiedReviewForm
	import { t } from 'svelte-i18n';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { escrow } from '$lib/utils/wallet/escrow';
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
		onClose,
		onSubmit
	} = $props<{
		isOpen: boolean;
		escrowId?: string;
		revieweePubkey?: string;
		revieweeName?: string;
		escrowTxHash?: string;
		/** Task id for backend review API when available */
		taskId?: string | null;
		onClose: () => void;
		onSubmit?: (eventId: string) => void;
	}>();

	let targetRevieweePubkey = $state<string | null>(null);
	let targetRevieweeName = $state<string | null>(null);
	let revieweeRole = $state<'tasker' | 'taskee' | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let isEscrowPending = $state(false);
	let retryCountdown = $state(0);
	let retryInterval: ReturnType<typeof setInterval> | null = null;
	const RETRY_AFTER_SECONDS = 15;

	function startRetryCountdown() {
		retryCountdown = RETRY_AFTER_SECONDS;
		retryInterval = setInterval(() => {
			retryCountdown -= 1;
			if (retryCountdown <= 0) {
				clearInterval(retryInterval!);
				retryInterval = null;
				retryLoad();
			}
		}, 1000);
	}

	async function retryLoad() {
		error = null;
		isEscrowPending = false;
		isLoading = true;
		// Re-trigger the effect by toggling isOpen equivalent — just call load directly
		await loadReviewDetails();
	}

	async function loadReviewDetails() {
		if (!escrowId) return;
		isLoading = true;
		error = null;
		isEscrowPending = false;

		try {
			const currentUserNpub = await getNpub();
			const currentUserPubkey = currentUserNpub.startsWith('npub')
				? (nip19.decode(currentUserNpub).data as string)
				: currentUserNpub;

			// If revieweePubkey provided directly, use it
			if (revieweePubkey) {
				targetRevieweePubkey = revieweePubkey;
				if (!targetRevieweeName) {
					try {
						const profile = await fetchProfileMetadata(hexToNpub(revieweePubkey));
						targetRevieweeName = profile.name || null;
					} catch { /* continue */ }
				}
			} else {
				// Resolve from contract
				const contracts = await getUserContracts({ escrowIds: [escrowId] });
				if (contracts.length === 0) {
					error = 'Contract not found. Please provide reviewee pubkey directly.';
					isLoading = false;
					return;
				}
				const contractContent = contracts[0].contractEvent.content;
				if (contractContent.clientPubkey === currentUserPubkey) {
					targetRevieweePubkey = contractContent.freelancerPubkey;
				} else if (contractContent.freelancerPubkey === currentUserPubkey) {
					targetRevieweePubkey = contractContent.clientPubkey;
				} else {
					error = 'You are not a participant in this contract.';
					isLoading = false;
					return;
				}
				if (!targetRevieweeName && targetRevieweePubkey) {
					try {
						const profile = await fetchProfileMetadata(hexToNpub(targetRevieweePubkey));
						targetRevieweeName = profile.name || null;
					} catch { /* continue */ }
				}
			}

			// Verify escrow is completed
			const escrowData = await escrow.getEscrow(escrowId);
			if (!escrowData) {
				error = 'Escrow not found.';
				isLoading = false;
				return;
			}

			const completedStates = [
				EscrowStatus.Completed,
				EscrowStatus.FundsReleased,
				EscrowStatus.DisputeResolved
			];
			if (!completedStates.includes(escrowData.status)) {
				// Escrow still pending — show a friendly waiting state with auto-retry
				isEscrowPending = true;
				isLoading = false;
				startRetryCountdown();
				return;
			}

			// Determine reviewee role
			if (targetRevieweePubkey && escrowId) {
				revieweeRole = await getRevieweeRole(escrowId, targetRevieweePubkey);
			}
		} catch (err) {
			console.error('Failed to load review details:', err);
			error = err instanceof Error ? err.message : 'Failed to load contract details';
		} finally {
			isLoading = false;
		}
	}

	// Convert hex pubkey to npub if needed
	function hexToNpub(hexPubkey: string): string {
		try {
			// If already npub, return as is
			if (hexPubkey.startsWith('npub')) {
				return hexPubkey;
			}
			// Convert hex to npub
			return nip19.npubEncode(hexPubkey);
		} catch {
			return hexPubkey; // Return as is if conversion fails
		}
	}

	// Load review details when modal opens; cleanup retry interval when it closes
	$effect(() => {
		if (isOpen) {
			// Reset state on each open
			targetRevieweePubkey = null;
			targetRevieweeName = revieweeName || null;
			revieweeRole = null;
			error = null;
			isEscrowPending = false;
			if (retryInterval) { clearInterval(retryInterval); retryInterval = null; }
			loadReviewDetails();
		} else {
			// Cleanup countdown on close
			if (retryInterval) { clearInterval(retryInterval); retryInterval = null; }
			retryCountdown = 0;
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
			<div class="flex flex-col justify-center items-center py-16">
				<span class="loading loading-spinner loading-lg text-primary mb-4"></span>
				<p class="text-base-content/60 text-sm">{$t('reviews.prompt.loading')}</p>
			</div>
		{:else if isEscrowPending}
			<!-- Escrow not yet confirmed on-chain — show friendly waiting state with auto-retry -->
			<div class="flex flex-col items-center gap-6 py-12 px-4 text-center">
				<span class="loading loading-ring loading-lg text-primary"></span>
				<div>
					<p class="font-semibold text-base-content">{$t('reviews.prompt.waiting_confirmation')}</p>
					<p class="text-base-content/60 text-sm mt-1">{$t('reviews.prompt.waiting_confirmation_desc')}</p>
				</div>
				{#if retryCountdown > 0}
					<p class="text-base-content/40 text-xs">
						{$t('reviews.prompt.retry_in', { values: { seconds: retryCountdown } })}
					</p>
				{:else}
					<span class="loading loading-dots loading-sm text-primary"></span>
				{/if}
				<button class="btn btn-ghost btn-sm" onclick={retryLoad}>
					{$t('reviews.prompt.check_now')}
				</button>
			</div>
		{:else if error}
			<div class="flex flex-col items-center gap-4 py-8 px-4">
				<div class="alert alert-outline alert-error shadow-sm">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span class="text-sm">{error}</span>
				</div>
				<button class="btn btn-ghost btn-sm" onclick={retryLoad}>
					{$t('reviews.prompt.try_again')}
				</button>
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

