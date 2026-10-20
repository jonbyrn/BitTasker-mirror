<script lang="ts">
	import type { IContractForReview } from '$lib/utils/reviews/contract-interface';
	import { t } from 'svelte-i18n';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { fetchProfileMetadata } from '$lib/nostr/profile';
	import { getRevieweeRoleFromContractParticipants } from '$lib/utils/reviews/helpers';
	import { nostrPubkeysMatch } from '$lib/utils/nostr-pubkey';
	import { fetchIContractForReviewByEscrowId } from '$lib/utils/contract/reviewContractsFromNdk';
	import { ndk } from '$lib/nostr/ndk';
	import VerifiedReviewForm from '$lib/components/reviews/VerifiedReviewForm.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import { createPortal } from '$lib/utils/portal';
	import { createDebug } from '$lib/utils/debug';
	import IconCloseCircle from '~icons/mdi/close-circle-outline';
	import IconAlertTriangle from '~icons/mdi/alert-outline';
	import IconStarOutline from '~icons/mdi/star-outline';

	const d = createDebug('reviews:prompt');

	let {
		isOpen,
		escrowId,
		revieweePubkey,
		revieweeName,
		revieweeRole: providedRevieweeRole = null,
		escrowTxHash,
		contract,
		onClose,
		onSubmit
	} = $props<{
		isOpen: boolean;
		escrowId?: string;
		revieweePubkey?: string;
		revieweeName?: string;
		revieweeRole?: 'tasker' | 'taskee' | null;
		escrowTxHash?: string;
		contract?: IContractForReview | null;
		onClose: () => void;
		onSubmit?: (eventId: string) => void;
	}>();

	let fetchedContract = $state<IContractForReview | null>(null);
	const effectiveContract = $derived(contract ?? fetchedContract);

	let targetRevieweePubkey = $state<string | null>(null);
	let targetRevieweeName = $state<string | null>(null);
	let revieweeRole = $state<'tasker' | 'taskee' | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let reloadKey = $state(0);

	function hexToNpub(hexPubkey: string): string {
		try {
			if (hexPubkey.startsWith('npub')) {
				return hexPubkey;
			}
			const user = ndk.getUser({ pubkey: hexPubkey });
			return user.npub;
		} catch {
			return hexPubkey;
		}
	}

	$effect(() => {
		if (!isOpen) return;
		void reloadKey;

		let cancelled = false;

		targetRevieweePubkey = null;
		targetRevieweeName = revieweeName || null;
		revieweeRole = null;
		error = null;
		isLoading = false;
		fetchedContract = null;

		void (async () => {
			if (!escrowId) {
				if (!revieweePubkey || cancelled) return;
				targetRevieweePubkey = revieweePubkey;
				if (!targetRevieweeName) {
					try {
						const revieweeNpub = hexToNpub(revieweePubkey);
						const profile = await fetchProfileMetadata(revieweeNpub);
						if (!cancelled) targetRevieweeName = profile.name || null;
					} catch (err) {
						d.error('Failed to fetch reviewee name:', err);
					}
				}
				return;
			}

			if (contract) {
				if (!contract.isReviewable()) {
					if (!cancelled) error = $t('reviews.prompt.escrow_not_completed');
					return;
				}
				try {
					const pubkey = await getNpub();
					if (!pubkey || cancelled) return;
					const party = contract.getReviewableParty(pubkey);
					if (!party) {
						if (!cancelled) error = $t('reviews.prompt.not_participant');
						return;
					}
					const reviewee = party === 'client' ? contract.freelancerPubkey : contract.clientPubkey;
					if (!cancelled) {
						targetRevieweePubkey = reviewee;
						targetRevieweeName = revieweeName || null;
						revieweeRole = party === 'client' ? 'taskee' : 'tasker';
					}
					if (targetRevieweePubkey) {
						const resolvedRole = getRevieweeRoleFromContractParticipants(
							contract.clientPubkey,
							contract.freelancerPubkey,
							targetRevieweePubkey
						);
						if (!cancelled) revieweeRole = resolvedRole;
					}
				} catch (err) {
					if (!cancelled) {
						error = err instanceof Error ? err.message : $t('reviews.prompt.load_error');
					}
				}
				return;
			}

			isLoading = true;
			try {
				const ic = await fetchIContractForReviewByEscrowId(escrowId);
				if (cancelled) return;
				// RGB escrows are kind 31006, not the kind 30006 contracts this lookup reads.
				// The caller already named the other party, so the star form can open.
				if (!ic) {
					if (cancelled || (await showProvidedReviewee())) return;
					error = $t('reviews.prompt.contract_not_found');
					return;
				}
				fetchedContract = ic;
				if (!ic.isReviewable()) {
					error = $t('reviews.prompt.escrow_not_completed');
					return;
				}
				const pubkey = await getNpub();
				if (!pubkey || cancelled) return;
				const party = ic.getReviewableParty(pubkey);
				if (!party) {
					error = $t('reviews.prompt.not_participant');
					return;
				}
				const resolvedReviewee = party === 'client' ? ic.freelancerPubkey : ic.clientPubkey;
				targetRevieweePubkey =
					revieweePubkey && nostrPubkeysMatch(revieweePubkey, resolvedReviewee)
						? revieweePubkey
						: resolvedReviewee;
				targetRevieweeName = revieweeName || null;
				revieweeRole = party === 'client' ? 'taskee' : 'tasker';
				if (targetRevieweePubkey) {
					const resolvedRole = getRevieweeRoleFromContractParticipants(
						ic.clientPubkey,
						ic.freelancerPubkey,
						targetRevieweePubkey
					);
					if (!cancelled) revieweeRole = resolvedRole;
				}
				if (!targetRevieweeName && targetRevieweePubkey) {
					try {
						const revieweeNpub = hexToNpub(targetRevieweePubkey);
						const profile = await fetchProfileMetadata(revieweeNpub);
						if (!cancelled) targetRevieweeName = profile.name || null;
					} catch (err) {
						d.error('Failed to fetch reviewee name:', err);
					}
				}
			} catch (err) {
				d.error('Failed to load contract details:', err);
				if (cancelled || (await showProvidedReviewee())) return;
				error = err instanceof Error ? err.message : $t('reviews.prompt.load_error');
			} finally {
				if (!cancelled) isLoading = false;
			}
		})();

		async function showProvidedReviewee(): Promise<boolean> {
			if (!revieweePubkey || cancelled) return false;
			targetRevieweePubkey = revieweePubkey;
			if (providedRevieweeRole === 'tasker' || providedRevieweeRole === 'taskee') {
				revieweeRole = providedRevieweeRole;
			}
			if (!targetRevieweeName) {
				try {
					const profile = await fetchProfileMetadata(hexToNpub(revieweePubkey));
					if (!cancelled) targetRevieweeName = profile.name || null;
				} catch (err) {
					d.error('Failed to fetch reviewee name:', err);
				}
			}
			return !cancelled;
		}

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
				<IconCloseCircle class="h-5 w-5 shrink-0" />
				<span class="text-sm">{error}</span>
			</div>
			<div class="flex justify-end">
				<button class="btn btn-outline btn-sm" type="button" onclick={handleRetry}>
					{$t('reviews.actions.retry')}
				</button>
			</div>
		</div>
	{:else if targetRevieweePubkey && escrowId}
		<div class="border-base-300 mb-6 border-b pb-4">
			<p class="text-base-content/50 mb-3 text-xs font-medium tracking-wide uppercase">
				{$t('reviews.prompt.reviewing')}
			</p>
			<div class="flex items-center gap-3">
				<div class="bg-primary/10 border-primary/20 rounded-xl border p-2.5">
					<IconStarOutline class="text-primary h-6 w-6" />
				</div>
				<UserInfoDisplay
					pubkey={targetRevieweePubkey}
					username={targetRevieweeName}
					size="md"
					showReviewCount={true}
					showRanking={false}
				/>
			</div>
		</div>
		{#if targetRevieweePubkey && escrowId}
			<VerifiedReviewForm
				{escrowId}
				revieweePubkey={targetRevieweePubkey}
				{escrowTxHash}
				contract={effectiveContract}
				{revieweeRole}
				onSubmit={handleSubmit}
				onCancel={handleCancel}
			/>
		{/if}
	{:else if targetRevieweePubkey && !escrowId}
		<!-- Direct pubkey provided without escrowId - escrowId is required -->
		<div class="alert alert-outline alert-warning shadow-sm">
			<IconAlertTriangle class="h-5 w-5 shrink-0" />
			<span class="text-sm">{$t('reviews.prompt.missing_escrow')}</span>
		</div>
	{:else if !escrowId && !revieweePubkey}
		<div class="alert alert-outline alert-warning shadow-sm">
			<IconAlertTriangle class="h-5 w-5 shrink-0" />
			<span class="text-sm">{$t('reviews.prompt.missing_info')}</span>
		</div>
	{/if}

	{#snippet footer()}
		{#if targetRevieweePubkey && escrowId}
			<div use:createPortal={'review-form-footer'}></div>
		{/if}
	{/snippet}
</Drawer>
