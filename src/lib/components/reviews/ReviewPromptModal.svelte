<script lang="ts">
	import { t } from 'svelte-i18n';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { escrow } from '$lib/utils/wallet/escrow';
	import { getUserContracts } from '$lib/utils/nostr-bid';
	import { fetchProfileMetadata } from '$lib/utils/nostr-message';
	import { getRevieweeRoleFromContractParticipants } from '$lib/utils/review-helpers';
	import { nostrPubkeysMatch } from '$lib/utils/nostr-pubkey';
	import { isReviewableContractStatus } from '$lib/utils/review-status';
	import { nip19 } from 'nostr-tools';
	import VerifiedReviewForm from './VerifiedReviewForm.svelte';
	import Drawer from '../Drawer.svelte';

	let { isOpen, escrowId, revieweePubkey, revieweeName, escrowTxHash, onClose, onSubmit } = $props<{
		isOpen: boolean;
		escrowId?: string;
		revieweePubkey?: string;
		revieweeName?: string;
		escrowTxHash?: string;
		onClose: () => void;
		onSubmit?: (eventId: string) => void;
	}>();

	let targetRevieweePubkey = $state<string | null>(null);
	let targetRevieweeName = $state<string | null>(null);
	let revieweeRole = $state<'tasker' | 'taskee' | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let reloadKey = $state(0);
	const revieweeIdentity = $derived.by(() => {
		if (targetRevieweeName) {
			return targetRevieweeName;
		}

		if (!targetRevieweePubkey) {
			return '';
		}

		return `${targetRevieweePubkey.slice(0, 12)}...${targetRevieweePubkey.slice(-8)}`;
	});

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
		void reloadKey;

		let cancelled = false;

		targetRevieweePubkey = null;
		targetRevieweeName = revieweeName || null;
		revieweeRole = null;
		isLoading = false;
		error = null;

		(async () => {
			if (!escrowId) {
				if (!revieweePubkey || cancelled) {
					return;
				}

				targetRevieweePubkey = revieweePubkey;
				if (!targetRevieweeName) {
					try {
						const revieweeNpub = hexToNpub(revieweePubkey);
						const profile = await fetchProfileMetadata(revieweeNpub);
						if (!cancelled) {
							targetRevieweeName = profile.name || null;
						}
					} catch (err) {
						console.error('Failed to fetch reviewee name:', err);
					}
				}
				return;
			}

			if (escrowId) {
				isLoading = true;
				error = null;

				try {
					const currentUserPubkey = await getNpub();
					const contracts = await getUserContracts({ escrowIds: [escrowId] });

					if (contracts.length === 0) {
						if (!cancelled) {
							error = $t('reviews.prompt.contract_not_found');
							isLoading = false;
						}
						return;
					}

					const contract = contracts[0].contractEvent.content;

					let resolvedRevieweePubkey: string | null = null;

					if (nostrPubkeysMatch(contract.clientPubkey, currentUserPubkey)) {
						resolvedRevieweePubkey = contract.freelancerPubkey;
					} else if (nostrPubkeysMatch(contract.freelancerPubkey, currentUserPubkey)) {
						resolvedRevieweePubkey = contract.clientPubkey;
					} else {
						if (!cancelled) {
							error = $t('reviews.prompt.not_participant');
							isLoading = false;
						}
						return;
					}

					targetRevieweePubkey =
						revieweePubkey && nostrPubkeysMatch(revieweePubkey, resolvedRevieweePubkey)
							? revieweePubkey
							: resolvedRevieweePubkey;

					if (!targetRevieweeName && targetRevieweePubkey) {
						try {
							const revieweeNpub = hexToNpub(targetRevieweePubkey);
							const profile = await fetchProfileMetadata(revieweeNpub);
							if (!cancelled) {
								targetRevieweeName = profile.name || null;
							}
						} catch (err) {
							console.error('Failed to fetch reviewee name:', err);
						}
					}

					const escrowData = await escrow.getEscrow(escrowId);
					if (!escrowData) {
						if (!cancelled) {
							error = $t('reviews.prompt.escrow_not_found');
							isLoading = false;
						}
						return;
					}

					if (!isReviewableContractStatus(escrowData.status)) {
						if (!cancelled) {
							error = $t('reviews.prompt.escrow_not_completed');
							isLoading = false;
						}
						return;
					}

					if (targetRevieweePubkey) {
						const resolvedRole = getRevieweeRoleFromContractParticipants(
							contract.clientPubkey,
							contract.freelancerPubkey,
							targetRevieweePubkey
						);
						if (!cancelled) {
							revieweeRole = resolvedRole;
						}
					}
				} catch (err) {
					console.error('Failed to load contract details:', err);
					if (!cancelled) {
						error = err instanceof Error ? err.message : $t('reviews.prompt.load_error');
					}
				} finally {
					if (!cancelled) {
						isLoading = false;
					}
				}
			}
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

	function handleRetry() {
		reloadKey += 1;
	}
</script>

<Drawer {isOpen} title={$t('reviews.prompt.title')} {onClose} position="right" isScrollable={true}>
	{#if isLoading}
		<div class="flex flex-col items-center justify-center py-16">
			<span class="loading loading-spinner loading-lg text-primary mb-4"></span>
			<p class="text-base-content/60 text-sm">{$t('reviews.prompt.loading')}</p>
		</div>
	{:else if error}
		<div class="space-y-3">
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
			<div class="flex justify-end">
				<button class="btn btn-outline btn-sm" type="button" onclick={handleRetry}>
					{$t('reviews.actions.retry')}
				</button>
			</div>
		</div>
	{:else if targetRevieweePubkey && escrowId}
		{#if revieweeIdentity}
			<div class="border-base-300 mb-6 border-b pb-4">
				<div class="flex items-center gap-3">
					<div class="avatar placeholder">
						<div class="bg-primary/20 text-primary w-12 rounded-full">
							<span class="text-lg font-semibold">{revieweeIdentity.charAt(0).toUpperCase()}</span>
						</div>
					</div>
					<div>
						<p class="text-base-content/50 mb-1 text-xs">{$t('reviews.prompt.reviewing')}</p>
						<p class="text-base-content text-base font-semibold">{revieweeIdentity}</p>
						{#if targetRevieweeName && targetRevieweePubkey}
							<p class="text-base-content/50 mt-1 text-xs">
								{targetRevieweePubkey.slice(0, 12)}...{targetRevieweePubkey.slice(-8)}
							</p>
						{/if}
					</div>
				</div>
			</div>
		{/if}
		{#if targetRevieweePubkey && escrowId}
			<VerifiedReviewForm
				{escrowId}
				revieweePubkey={targetRevieweePubkey}
				{escrowTxHash}
				{revieweeRole}
				onSubmit={handleSubmit}
				onCancel={handleCancel}
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
