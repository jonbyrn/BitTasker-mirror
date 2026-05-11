<script lang="ts">
	import {
		getStatusTranslationKey,
		getStatusColorClass
	} from '$lib/utils/helpers/contractStatusFormatterV2';
	import { t } from 'svelte-i18n';
	import TaskDeadlineDisplay from '../task/TaskDeadlineDisplay.svelte';
	import TaskLocationDisplay from '../task/TaskLocationDisplay.svelte';
	import UserNostrBadge from '../UserNostrBadge.svelte';
	import type { NDKPaymentContract } from '$lib/nostr/events/contract';
	import { formatConvertedAmount } from '$lib/utils/helpers/currencyFormatter';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { PaymentContractRune } from '$lib/runes/contractRune.svelte';
	import ContractActionsCardNDK from './ContractActionsCardNDK.svelte';
	import ResolutionProposalSplitDisplay from './ResolutionProposalSplitDisplay.svelte';
	import { ContractStatus } from '$lib/utils/contract/types';
	import { generateUniversalMapLink } from '$lib/utils/location/maps';

	const {
		contract,
		onOpenContractDrawer,
		rune: runeFromParent = undefined
	}: {
		contract: NDKPaymentContract;
		onOpenContractDrawer?: (rune: PaymentContractRune) => void;
		/** When set (e.g. dashboard list), the parent owns the rune lifecycle. */
		rune?: PaymentContractRune;
	} = $props();

	let ownedRune = $state<PaymentContractRune | null>(null);

	$effect(() => {
		if (runeFromParent) {
			ownedRune = null;
			return;
		}
		const rune = new PaymentContractRune(contract);
		ownedRune = rune;
		void rune.start();
		return () => {
			rune.stopSubscription();
		};
	});

	const contractRune = $derived(runeFromParent ?? ownedRune);

	function openDrawer() {
		if (contractRune && onOpenContractDrawer) {
			onOpenContractDrawer(contractRune);
		}
	}

	const isTasker = $derived(
		contractRune !== null
			? contractRune.isTasker
			: contract.author.pubkey === contract.ndk?.activeUser?.pubkey
	);

	/** After first relay EOSE (or when no status subscription runs), show real status + actions. */
	const statusAndActionsReady = $derived(
		contractRune?.statusHistoryReady === true ||
			contractRune?.optimisticBlockchainStatus == ContractStatus.Funded
	);
	const amountSats = $derived(
		formatConvertedAmount(contract.amount, contract.currency, {
			btcPrice: btcPrice.price,
			toCurrency: 'SATS'
		})
	);
	const amountUsd = $derived(
		formatConvertedAmount(contract.amount, contract.currency, {
			btcPrice: btcPrice.price,
			toCurrency: 'USD',
			suffix: ''
		})
	);

	// Service location from agreement snapshot (for service contracts with TASKER_LOCATION)
	const serviceLocation = $derived.by(() => {
		const snapshot = contract.agreementSnapshot;
		if (!snapshot?.serviceLocation?.location) return null;
		return snapshot.serviceLocation;
	});

	const serviceLocationMapLink = $derived.by(() => {
		if (!serviceLocation?.location) return null;
		return generateUniversalMapLink(serviceLocation.location, { label: serviceLocation.label });
	});
</script>

<div class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body rounded-xl p-4 md:p-4">
		<!-- Top Row: Title + Role Badge -->
		<div class="mb-2 flex flex-row items-start justify-between gap-2">
			<div class="card-title line-clamp-2 min-w-0 flex-1 text-lg font-semibold">
				<button
					type="button"
					class="hover:text-primary cursor-pointer text-left transition-colors"
					onclick={openDrawer}
				>
					{contract.taskTitle}
				</button>
			</div>
			<div class="flex shrink-0 flex-wrap gap-1">
				<div class="badge {isTasker ? 'badge-primary' : 'badge-secondary'} badge-sm">
					{isTasker ? $t('dashboard.client') : $t('dashboard.freelancer')}
				</div>
				{#if import.meta.env.DEV && contract.paymentId}
					<div class="badge badge-error badge-sm">
						{contract.version}: {contract.paymentId}
					</div>
				{/if}
			</div>
		</div>

		<!-- Description + Badges -->
		<div class="mb-3 flex flex-row items-start justify-between gap-2">
			<div class="text-base-content/80 line-clamp-2 min-w-0 flex-1 text-sm whitespace-pre-line">
				{contract.taskDescription}
			</div>
			<div class="flex shrink-0 flex-col items-end gap-1.5">
				{#if statusAndActionsReady && contractRune}
					<div class="badge {getStatusColorClass(contractRune.displayStatus)} badge-sm">
						{#if contractRune.isPending}
							<span class="loading loading-spinner loading-xs mr-1"></span>
						{/if}
						{$t(getStatusTranslationKey(contractRune.displayStatus))}
					</div>
				{:else}
					<div
						class="badge badge-ghost badge-sm min-h-6 min-w-22 justify-center"
						aria-busy="true"
						aria-label={$t('common.loading')}
					>
						<span class="loading loading-spinner loading-xs text-base-content/60"></span>
					</div>
				{/if}
				<div
					class="badge {contract.tagValue('contextType') === 'service'
						? 'badge-info'
						: 'badge-outline'} badge-sm"
				>
					{contract.tagValue('contextType') === 'service' ? 'Service' : 'Task'}
				</div>
			</div>
		</div>

		<!-- Second Row: Deadline + Location + Price -->
		<div class="mb-3 flex flex-row items-center justify-between gap-3">
			<!-- Left: Deadline + Location -->
			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<!-- Deadline -->
				<TaskDeadlineDisplay deadline={contract.estimatedCompletionTime} />

				<!-- Location: show service location if available, otherwise default to Remote -->
				<TaskLocationDisplay
					locationText={serviceLocation?.label ?? ''}
					directionsLink={serviceLocationMapLink}
				/>
			</div>

			<!-- Right: Price -->
			<div class="shrink-0 text-right">
				<div class="text-2xl font-bold">{amountUsd}</div>
				<div class="text-base-content/60 text-base">
					{amountSats}
				</div>
			</div>
		</div>

		{#if contractRune && statusAndActionsReady && contractRune.pendingResolutionProposal}
			<div class="border-base-300 bg-base-200/50 mb-3 rounded-xl border border-dashed p-3">
				<p class="text-base-content/80 mb-2 text-xs font-semibold tracking-wide uppercase">
					{$t('dashboard.contracts.actions.current_proposal')}
				</p>
				<ResolutionProposalSplitDisplay
					taskerShareWei={contractRune.pendingResolutionProposal.taskerWei}
					taskeeShareWei={contractRune.pendingResolutionProposal.taskeeWei}
					currency={contract.currency}
					btcPrice={btcPrice.price}
					isTasker={contractRune.isTasker}
					variant="compact"
					proposerIsTasker={contractRune.pendingResolutionProposal.proposerIsTasker}
				/>
			</div>
		{/if}

		<!-- Bottom Row: User Info + Action Buttons -->
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<div class="flex w-full items-center gap-2">
				<UserNostrBadge npub={contract.otherPartyNpub ?? ''} />
			</div>

			<!-- Right: Action Buttons -->
			{#if contractRune && statusAndActionsReady}
				<ContractActionsCardNDK
					{contractRune}
					btcPrice={btcPrice.price}
					onOpenDrawer={openDrawer}
				/>
			{/if}
		</div>
	</div>
</div>
