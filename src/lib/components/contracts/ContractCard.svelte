<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import type { ContractProfile } from '$lib/utils/nostr-profile';
	import { getStatusTranslationKey, getStatusColorClass } from '$lib/utils/helpers/contractStatusFormatter';
	import { contractStore } from '$lib/stores/contract.store';
	import { t } from 'svelte-i18n';
	import ContractActions from './ContractActions.svelte';

	const { contract, btcPrice, userProfile, onclick } = $props<{
		contract: ContractWithEvents;
		btcPrice: number;
		userProfile?: ContractProfile;
		onclick?: () => void;
	}>();

	// Profile is now passed as prop, no need to fetch
	const isLoadingUserProfile = $derived(userProfile === undefined);

	// Format member since date
	function formatMemberSinceDate(dateString: string | undefined): string {
		if (!dateString) return '';
		try {
			const date = new Date(dateString);
			if (isNaN(date.getTime())) return dateString;
			return date.toLocaleDateString('en-US', {
				month: 'short',
				year: 'numeric'
			});
		} catch (error) {
			return dateString;
		}
	}

	// Format RBTC amount
	function formatRBTC(amount: string): string {
		const num = parseFloat(amount);
		return num.toFixed(4);
	}

	// Format price with stacked USD and Sats
	function formatPriceStacked(amount: string, btcPrice: number): { usd: string; sats: string } {
		const rbtc = parseFloat(amount);
		if (isNaN(rbtc) || btcPrice <= 0) {
			return { usd: '$0.00', sats: '0 Sats' };
		}

		// Convert RBTC to USD (assuming RBTC ≈ BTC)
		const usdAmount = rbtc * btcPrice;

		// Convert to sats
		const sats = Math.round(rbtc * 100_000_000);

		return {
			usd: `$${usdAmount.toFixed(2)}`,
			sats: `${sats.toLocaleString('en-US')} Sats`
		};
	}

	// Format date with proper timestamp handling
	function formatDate(timestamp: number): string {
		// Handle invalid or zero timestamps
		if (!timestamp || timestamp <= 0) {
			return 'Not set';
		}

		// Convert to milliseconds if timestamp is in seconds
		const date = timestamp > 1000000000000 ? new Date(timestamp) : new Date(timestamp * 1000);

		// Check if date is valid
		if (isNaN(date.getTime())) {
			return 'Invalid date';
		}

		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// Get role badge class
	function getRoleBadgeClass(isClient: boolean): string {
		return isClient ? 'badge-primary' : 'badge-secondary';
	}

	// Get available actions count
	function getAvailableActionsCount(): number {
		let count = 0;
		if (contract.permissions.canComplete) count++;
		if (contract.permissions.canAccept) count++;
		if (contract.permissions.canDispute) count++;
		if (contract.permissions.canPropose) count++;
		if (contract.permissions.canAcceptProposal) count++;
		if (contract.permissions.canCancel) count++;
		if (contract.permissions.canResolveTimelock) count++;
		return count;
	}
</script>

<div class="bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body">
		<div class="flex flex-col justify-between gap-2">
			<div class="flex items-start justify-between">
				<div class="min-w-0 flex-1">
					<small class="card-title line-clamp-1 text-lg">
						<button
							class="hover:text-primary cursor-pointer text-left transition-colors"
							onclick={(e) => {
								e.stopPropagation();
								onclick?.();
							}}
						>
							{contractStore.getContractKey(contract, 'taskTitle')}
						</button>
					</small>
					<div class="text-base-content/60 mt-1 line-clamp-2">
						{contractStore.getContractKey(contract, 'taskDescription')}
					</div>
				</div>

				<!-- Badges in top right corner -->
				<div class="ml-4 flex shrink-0 flex-col items-end gap-2">
					<div class="flex items-center gap-2">
						<div class="badge {getStatusColorClass(contract.status)} badge-sm">
							{#if contract.isPending}
								<span class="loading loading-spinner loading-xs mr-1"></span>
							{/if}
							{$t(getStatusTranslationKey(contract.status))}
						</div>
						<div class="badge {getRoleBadgeClass(contract.isClient)} badge-sm">
							{contract.isClient ? $t('dashboard.client') : $t('dashboard.freelancer')}
						</div>
					</div>

					<!-- Price with stacked design -->
					<div class="text-right">
						{#if btcPrice > 0}
							{@const priceData = formatPriceStacked(contractStore.getContractKey(contract, 'amount'), btcPrice)}
							<div class="text-base-content text-lg font-bold">
								{priceData.usd}
							</div>
							<div class="text-base-content/60 text-sm">
								{priceData.sats}
							</div>
						{:else}
							<div class="text-base-content text-lg font-bold">
								{formatRBTC(contractStore.getContractKey(contract, 'amount'))} RBTC
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<div class="flex w-full items-center justify-between">
			<!-- Left: Deadline -->
			<div class="flex items-center gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-base-content/60 h-6 w-6 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<div class="flex flex-col">
					<small class="text-base-content/60 text-xs">
						{$t('dashboard.contracts.deadline')}
					</small>
					<span class="text-sm font-medium">
						{formatDate(contractStore.getContractKey(contract, 'estimatedCompletionTime'))}
					</span>
				</div>
			</div>

			<!-- Right: Empty space for balance -->
			<div class=""></div>
		</div>

		<div class="mt-1 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<!-- Left: User Info aligned with buttons -->
			<div class="flex items-center gap-2 md:flex-row">
				<!-- Avatar -->
				<div class="avatar shrink-0">
					<div class="bg-base-300 flex h-6 w-6 items-center justify-center rounded-full">
						{#if userProfile?.picture}
							<img
								src={userProfile.picture}
								alt="User avatar"
								class="h-6 w-6 rounded-full object-cover"
							/>
						{:else}
							<div
								class="avatar placeholder text-neutral-content bg-primary flex h-6 w-6 items-center justify-center overflow-hidden rounded-full text-center"
							>
								<span class="text-xs font-semibold">
									{(userProfile?.name || 'A').charAt(0).toUpperCase()}
								</span>
							</div>
						{/if}
					</div>
				</div>

				<div class="flex min-w-0 flex-1 flex-col">
					<small class="text-base-content/60 text-xs">
						{contract.isClient ? $t('dashboard.freelancer') : $t('dashboard.client')}
					</small>
					<span class="truncate text-sm font-medium">
						{isLoadingUserProfile
							? 'Loading...'
							: userProfile?.name || $t('dashboard.contracts.anonymous')}
					</span>

					<!-- Review Stars -->
					{#if !isLoadingUserProfile && userProfile}
						<div class="mt-1 flex min-w-0 items-center">
							<div class="flex shrink-0">
								{#each Array(5) as _, i}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-3 w-3 {i < (userProfile.averageRating || 0)
											? 'text-yellow-400'
											: 'text-base-content/30'}"
										fill="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
										/>
									</svg>
								{/each}
							</div>
							<span class="text-base-content/60 ml-1 truncate text-xs">
								{(userProfile.averageRating || 0).toFixed(1)} ({userProfile.tasksCompleted || 0}
								{$t('dashboard.contracts.tasks')})
							</span>
						</div>
					{/if}
				</div>
			</div>

			<!-- Right: Action Buttons -->
			<div class="flex w-full flex-col gap-3 sm:flex-row sm:items-center md:w-auto">
				{#if getAvailableActionsCount() > 0}
					<ContractActions
						{contract}
						containerClass="flex flex-row-reverse flex-wrap gap-2 w-full sm:w-auto"
						openDrawer={() => onclick?.()}
						isInline={true}
					/>
				{/if}
				{#if onclick}
					<button
						class="btn btn-outline btn-sm w-full sm:w-auto"
						onclick={(e) => {
							e.stopPropagation();
							onclick?.();
						}}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						{$t('dashboard.contracts.view_details')}
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>
