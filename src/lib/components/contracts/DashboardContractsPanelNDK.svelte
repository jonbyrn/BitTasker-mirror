<script lang="ts">
	import { t } from 'svelte-i18n';
	import { createPortal } from '$lib/utils/portal';
	import { EscrowStatus } from '$lib/utils/escrow';
	import ContractDrawerNDK from './ContractDrawerNDK.svelte';
	import InfiniteScroll from '$lib/components/InfiniteScroll.svelte';

	// MDI Icons for filters
	import IconCheckAll from '~icons/mdi/check-all';
	import IconLightningBolt from '~icons/mdi/lightning-bolt';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconAlertCircleOutline from '~icons/mdi/alert-circle-outline';
	import IconCheck from '~icons/mdi/check';
	import IconCancel from '~icons/mdi/cancel';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconAccountOutline from '~icons/mdi/account-outline';
	import IconAccountTieOutline from '~icons/mdi/account-tie-outline';
	import { ndk } from '$lib/nostr/ndk';
	import type { NDKPaymentContract } from '$lib/nostr/events/contract';
	import KINDS from '$lib/utils/constants/kinds';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import type { PaymentContractRune } from '$lib/runes/contractRune.svelte';
	import ContractCardNDK from './ContractCardNDK.svelte';
	import NdkIdentityGate from '$lib/components/nostr/NdkIdentityGate.svelte';
	// import { ndk } from '$lib/nostr/ndk';
	// import { NDKEscrowContract } from '$lib/nostr/events/contract';

	// Filters
	let statusFilter = $state<EscrowStatus | 'all'>('all');
	let roleFilter = $state<string>('all'); // 'all', 'client', 'freelancer'
	let isStatusDropdownOpen = $state(false);

	let contractDrawerOpen = $state(false);
	let contractDrawerRune = $state<PaymentContractRune | null>(null);

	function openContractDrawer(rune: PaymentContractRune) {
		contractDrawerRune = rune;
		contractDrawerOpen = true;
	}

	function closeContractDrawer() {
		contractDrawerOpen = false;
		contractDrawerRune = null;
	}

	// Create a reactive subscription - note the callback function () => ({ ... })
	const contractsSub = ndk.$subscribe<NDKPaymentContract>(() => {
		// No subscription until we have the users pubkey
		if (!ndk.$currentPubkey) return undefined;
		return {
			filters: [{ kinds: [KINDS.CONTRACT], limit: 50, '#p': [ndk.$currentPubkey] }],
			wrap: true
		};
	});

	// const contracts = $derived(rawContracts.events.map((event) => NDKEscrowContract.from(event)));

	// Status filter options - using EscrowStatus enum
	const statusFilterOptions = $derived([
		{
			id: 'all' as const,
			label: $t('dashboard.contracts.all_statuses'),
			icon: IconCheckAll
		},
		{
			id: EscrowStatus.Funded,
			label: $t('dashboard.contracts.status.funded'),
			icon: IconLightningBolt
		},
		{
			id: EscrowStatus.Completed,
			label: $t('dashboard.contracts.status.completed'),
			icon: IconCheckCircle
		},
		{
			id: EscrowStatus.InDispute,
			label: $t('dashboard.contracts.status.in_dispute'),
			icon: IconAlertCircleOutline
		},
		{
			id: EscrowStatus.DisputeResolved,
			label: $t('dashboard.contracts.status.dispute_resolved'),
			icon: IconCheck
		},
		{
			id: EscrowStatus.Cancelled,
			label: $t('dashboard.contracts.status.cancelled'),
			icon: IconCancel
		}
	] as const);

	// Role filter options
	const roleFilterOptions = $derived([
		{
			id: 'all',
			label: $t('dashboard.contracts.all_roles'),
			icon: IconAccountOutline
		},
		{
			id: 'client',
			label: $t('dashboard.contracts.as_client'),
			icon: IconAccountTieOutline
		},
		{
			id: 'freelancer',
			label: $t('dashboard.contracts.as_freelancer'),
			icon: IconAccountOutline
		}
	] as const);

	function selectStatusFilter(statusId: EscrowStatus | 'all') {
		statusFilter = statusId;
		isStatusDropdownOpen = false;
	}

	function selectRoleFilter(roleId: string) {
		roleFilter = roleId;
	}

	function toggleStatusDropdown() {
		isStatusDropdownOpen = !isStatusDropdownOpen;
	}

	function handleClickOutside(event: MouseEvent) {
		// Only handle clicks when dropdown is open
		if (!isStatusDropdownOpen) return;
		const target = event.target as HTMLElement;
		if (!target.closest('.status-dropdown-container')) {
			isStatusDropdownOpen = false;
		}
	}

	// Handle window clicks for dropdown - use effect to conditionally attach
	$effect(() => {
		if (!isStatusDropdownOpen) return;

		const handler = (event: MouseEvent) => {
			handleClickOutside(event);
		};

		window.addEventListener('click', handler);
		return () => {
			window.removeEventListener('click', handler);
		};
	});
</script>

<NdkIdentityGate>
	<div class="space-y-6">
		<!-- Filters container with same design as TasksPanel -->
		<div class="border-base-300/60 bg-base-100/40 mt-2 rounded-3xl border p-4 shadow-sm">
			<!-- Header with title and refresh button -->
			<div class="mb-3 flex items-center justify-between gap-2">
				<div class="space-y-1">
					<p class="text-base-content/70 text-xs font-semibold tracking-wide uppercase">
						{$t('dashboard.contracts.filter_by_status_and_role')}
					</p>
					<p class="text-base-content/70 hidden text-sm sm:block">
						{$t('dashboard.contracts.filter_description')}
					</p>
				</div>
			</div>

			<!-- Mobile: Subheading and dropdowns -->
			<div class="mb-3 sm:hidden">
				<p class="text-base-content/70 mb-3 text-sm">
					{$t('dashboard.contracts.filter_description')}
				</p>

				<!-- Role Filter Buttons (Mobile) -->
				<div class="mb-3 flex gap-2">
					{#each roleFilterOptions as option (option.id)}
						{@const IconComponent = option.icon}
						<button
							class="btn {roleFilter === option.id
								? 'btn-primary'
								: 'btn-secondary'} btn-sm flex items-center gap-2"
							onclick={() => selectRoleFilter(option.id)}
							aria-label={option.label}
						>
							{#if roleFilter === option.id}
								<IconCheck class="h-4 w-4" />
							{:else}
								<IconComponent class="h-4 w-4" />
							{/if}
							<span>{option.label}</span>
						</button>
					{/each}
				</div>

				<!-- Status Filter Dropdown (Mobile) -->
				<div class="status-dropdown-container relative">
					<button
						class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-between rounded-3xl border px-4 py-2 transition-all duration-200"
						onclick={toggleStatusDropdown}
						aria-expanded={isStatusDropdownOpen}
						aria-haspopup="true"
						aria-controls="status-dropdown-menu"
						aria-label={$t('dashboard.contracts.filter_by_status')}
					>
						<div class="flex items-center gap-2">
							{#each statusFilterOptions as option (String(option.id))}
								{#if statusFilter === option.id}
									{@const IconComponent = option.icon}
									<IconComponent class="h-5 w-5" />
								{/if}
							{/each}
							<span class="font-medium">
								{statusFilterOptions.find((opt) => opt.id === statusFilter)?.label}
							</span>
						</div>
						<IconChevronDown
							class="h-5 w-5 transition-transform duration-200 {isStatusDropdownOpen
								? 'rotate-180'
								: ''}"
						/>
					</button>

					{#if isStatusDropdownOpen}
						<div
							id="status-dropdown-menu"
							role="menu"
							aria-label={$t('dashboard.contracts.status_filter_menu')}
							class="border-base-300 bg-base-100 absolute top-full right-0 left-0 z-50 mt-2 rounded-xl border shadow-lg"
						>
							{#each statusFilterOptions as option (String(option.id))}
								{@const IconComponent = option.icon}
								<button
									role="menuitemradio"
									aria-checked={statusFilter === option.id}
									class="hover:bg-base-200 flex w-full items-center gap-2 px-4 py-2 text-left transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl {statusFilter ===
									option.id
										? 'bg-primary/10 text-primary'
										: 'text-base-content'}"
									onclick={() => selectStatusFilter(option.id)}
								>
									<IconComponent
										class="h-5 w-5 {statusFilter === option.id
											? 'text-primary'
											: 'text-base-content/60'}"
									/>
									<span class="font-medium">{option.label}</span>
									{#if statusFilter === option.id}
										<IconCheck class="text-primary ml-auto h-5 w-5" />
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Desktop: Role Filter Buttons -->
			<div class="mb-4 hidden sm:block">
				<div class="flex gap-2">
					{#each roleFilterOptions as option (option.id)}
						{@const IconComponent = option.icon}
						<button
							class="btn {roleFilter === option.id
								? 'btn-primary'
								: 'btn-secondary'} btn-sm flex items-center gap-2"
							onclick={() => selectRoleFilter(option.id)}
							aria-label={option.label}
						>
							{#if roleFilter === option.id}
								<IconCheck class="h-4 w-4" />
							{:else}
								<IconComponent class="h-4 w-4" />
							{/if}
							<span>{option.label}</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- Desktop: Status Filter Buttons -->
			<div class="mt-4 hidden sm:block">
				<div class="flex flex-col gap-3 sm:flex-row">
					{#each statusFilterOptions as option (String(option.id))}
						{@const IconComponent = option.icon}
						<button
							class="btn btn-sm flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-3xl py-4 text-center transition-all duration-200 {statusFilter ===
							option.id
								? 'text-primary bg-primary/10 border-primary/30 border'
								: 'bg-base-100/40 hover:bg-base-100/60 text-base-content/70'}"
							onclick={() => selectStatusFilter(option.id)}
							aria-label={option.label}
						>
							<IconComponent class="h-5 w-5 {statusFilter === option.id ? 'text-primary' : ''}" />
							<span class="font-medium">{option.label}</span>
						</button>
					{/each}
				</div>
			</div>
		</div>

		<!-- Contracts List -->
		{#if contractsSub.events.length === 0}
			<div class="py-12 text-center">
				<div class="mb-4">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content/30 mx-auto h-12 w-12"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
				</div>
				<h3 class="mb-2 text-lg font-semibold">
					{$t('dashboard.contracts.no_contracts')}
				</h3>
				<p class="text-base-content/70">
					{$t('dashboard.contracts.no_contracts_description')}
				</p>
			</div>
		{:else}
			{#each contractsSub.events as contract (contract.id)}
				<ContractCardNDK {contract} onOpenContractDrawer={openContractDrawer} />
			{/each}

			<!-- End of list indicator -->
			<!-- {#if !$contractStore.hasMore && filteredContracts.length > 0}
			<div class="text-center">
				<p class="text-base-content/50 text-sm">
					{$t('dashboard.contracts.no_more_contracts')}
				</p>
			</div>
		{/if} -->
		{/if}

		<!-- Infinite Scroll Component -->
		<InfiniteScroll />
	</div>
</NdkIdentityGate>

<!-- Contract Drawer - DO Not wrap in a condition for animation to work -->
<ContractDrawerNDK
	isOpen={contractDrawerOpen}
	onClose={closeContractDrawer}
	contractRune={contractDrawerRune}
	btcPrice={btcPrice.price}
/>

<!-- Portal target for confirmation modals - outside drawer context -->
<div use:createPortal={'modals'} style="position: relative; z-index: 9999;"></div>
