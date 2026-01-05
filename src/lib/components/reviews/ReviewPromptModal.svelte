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
	import { EscrowStatus } from '$lib/utils/enums/wallet.enum';
	import VerifiedReviewForm from './VerifiedReviewForm.svelte';
	// @ts-ignore - Svelte 5 component, no default export needed
	import Drawer from '../Drawer.svelte';

	let {
		isOpen,
		escrowId,
		revieweePubkey,
		revieweeName,
		escrowTxHash,
		onClose,
		onSubmit
	} = $props<{
		isOpen: boolean;
		escrowId?: string;
		revieweePubkey?: string;
		revieweeName?: string;
		escrowTxHash?: string;
		onClose: () => void;
		onSubmit?: (eventId: string) => void;
	}>();

	let targetRevieweePubkey = $state<string | null>(null);
	let targetRevieweeName = $state<string | null>(revieweeName || null);
	let revieweeRole = $state<'tasker' | 'taskee' | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

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

	// Load reviewee pubkey from contract if escrowId provided
	$effect(() => {
		if (!isOpen) return;
		
		(async () => {

		// If revieweePubkey is directly provided, use it
		if (revieweePubkey) {
			targetRevieweePubkey = revieweePubkey;
			
			// Fetch name if not provided
			if (!targetRevieweeName) {
				try {
					const revieweeNpub = hexToNpub(revieweePubkey);
					const profile = await fetchProfileMetadata(revieweeNpub);
					targetRevieweeName = profile.name || null;
				} catch (err) {
					console.error('Failed to fetch reviewee name:', err);
					// Continue without name
				}
			}

			// Try to determine role if escrowId is also provided
			if (escrowId && targetRevieweePubkey) {
				try {
					revieweeRole = await getRevieweeRole(escrowId, targetRevieweePubkey);
				} catch (err) {
					console.error('Failed to determine reviewee role:', err);
					// Continue without role - will use generic labels
				}
			}
			return;
		}

		// If escrowId provided, fetch contract to get pubkeys
		if (escrowId) {
			isLoading = true;
			error = null;

			try {
				const currentUserNpub = await getNpub();
				const currentUserPubkey = currentUserNpub.startsWith('npub')
					? (nip19.decode(currentUserNpub).data as string)
					: currentUserNpub;

				// Get contracts to find the one with this escrowId
				const contracts = await getUserContracts({ escrowIds: [escrowId] });
				
				if (contracts.length === 0) {
					// Fallback: try to get from escrow contract directly
					// But we still need the Nostr pubkey, so we'll need another approach
					// For now, show error
					error = 'Contract not found. Please provide reviewee pubkey directly.';
					isLoading = false;
					return;
				}

				const contract = contracts[0].contract;
				
				// Determine who to review: if current user is client, review freelancer, and vice versa
				if (contract.clientPubkey === currentUserPubkey) {
					targetRevieweePubkey = contract.freelancerPubkey;
				} else if (contract.freelancerPubkey === currentUserPubkey) {
					targetRevieweePubkey = contract.clientPubkey;
				} else {
					error = 'You are not a participant in this contract.';
					isLoading = false;
					return;
				}

				// Fetch reviewee name if not provided
				if (!targetRevieweeName && targetRevieweePubkey) {
					try {
						const revieweeNpub = hexToNpub(targetRevieweePubkey);
						const profile = await fetchProfileMetadata(revieweeNpub);
						targetRevieweeName = profile.name || null;
					} catch (err) {
						console.error('Failed to fetch reviewee name:', err);
						// Continue without name
					}
				}

				// Verify escrow is completed
				const escrowData = await escrow.getEscrow(escrowId);
				if (!escrowData) {
					error = 'Escrow not found.';
					isLoading = false;
					return;
				}

				const completedStates = [EscrowStatus.Completed, EscrowStatus.DisputeResolved];
				if (!completedStates.includes(escrowData.status)) {
					error = `Escrow is not completed. Current status: ${escrowData.status}`;
					isLoading = false;
					return;
				}

				// Determine reviewee role for role-specific labels
				if (targetRevieweePubkey && escrowId) {
					revieweeRole = await getRevieweeRole(escrowId, targetRevieweePubkey);
				}
			} catch (err) {
				console.error('Failed to load contract details:', err);
				error = err instanceof Error ? err.message : 'Failed to load contract details';
			} finally {
				isLoading = false;
			}
		}
		})();
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
				<p class="text-base-content/60 text-sm">Loading review details...</p>
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
				<!-- svelte-ignore a11y-no-static-element-interactions -->
				{@const _formProps = {
					escrowId: escrowId as string,
					revieweePubkey: targetRevieweePubkey as string,
					escrowTxHash: escrowTxHash as string | undefined,
					onSubmit: handleSubmit as (eventId: string) => void,
					onCancel: handleCancel as () => void
				}}
				<!-- @ts-ignore Svelte 5 component props type inference - props are correctly typed -->
				<VerifiedReviewForm
					escrowId={_formProps.escrowId}
					revieweePubkey={_formProps.revieweePubkey}
					escrowTxHash={_formProps.escrowTxHash}
					revieweeRole={revieweeRole}
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

