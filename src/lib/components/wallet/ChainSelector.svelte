<script lang="ts">
	import { t } from 'svelte-i18n';
	import { getSupportedChainIds, getStablecoinConfig } from '$lib/services/stablecoin-registry';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconChevronUp from '~icons/mdi/chevron-up';

	/**
	 * Props:
	 * - selectedChainId: currently selected chain (null = nothing selected)
	 * - onChange: called when user selects a chain
	 * - disabled: lock the selector (e.g. during a transaction)
	 * - disabledReason: human-readable explanation shown as tooltip when disabled
	 */
	let {
		selectedChainId = null,
		onChange = (_chainId: number) => {},
		disabled = false,
		disabledReason = ''
	}: {
		selectedChainId: number | null;
		onChange: (chainId: number) => void;
		disabled?: boolean;
		disabledReason?: string;
	} = $props();

	// -----------------------------------------------------------------------
	// Local state
	// -----------------------------------------------------------------------

	/** Whether the dropdown is open */
	let isOpen = $state(false);

	/** Reference to the dropdown container for click-outside detection */
	let dropdownElement = $state<HTMLElement | null>(null);

	// -----------------------------------------------------------------------
	// Derived
	// -----------------------------------------------------------------------

	/** All supported chain IDs from the stablecoin registry */
	const supportedChains = $derived.by(() => {
		const ids = getSupportedChainIds();
		return ids
			.map((id) => {
				const config = getStablecoinConfig(id);
				if (!config) return null;
				return { chainId: id, config };
			})
			.filter((c): c is NonNullable<typeof c> => c !== null);
	});

	/** The currently selected chain config (if any) */
	const selectedConfig = $derived.by(() => {
		if (selectedChainId === null) return null;
		return getStablecoinConfig(selectedChainId) ?? null;
	});

	// -----------------------------------------------------------------------
	// Click-outside handler
	// -----------------------------------------------------------------------

	$effect(() => {
		if (!isOpen) return;

		function handleClickOutside(e: MouseEvent) {
			if (dropdownElement && !dropdownElement.contains(e.target as Node)) {
				isOpen = false;
			}
		}

		// Delay attaching so the same click that opened the dropdown does not
		// immediately close it.
		const raf = requestAnimationFrame(() => {
			document.addEventListener('click', handleClickOutside);
		});

		return () => {
			cancelAnimationFrame(raf);
			document.removeEventListener('click', handleClickOutside);
		};
	});

	// Close on Escape
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isOpen) {
			isOpen = false;
		}
	}

	// -----------------------------------------------------------------------
	// Selection handler
	// -----------------------------------------------------------------------

	function selectChain(chainId: number) {
		if (disabled) return;
		onChange(chainId);
		isOpen = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	bind:this={dropdownElement}
	class="dropdown"
	class:dropdown-open={isOpen}
	role="listbox"
	aria-label={$t('wallet.chain_selector.label')}
>
	<!-- Trigger Button -->
	<button
		class="btn btn-outline flex w-full items-center justify-between gap-2"
		class:btn-disabled={disabled}
		onclick={() => {
			if (!disabled) isOpen = !isOpen;
		}}
		aria-haspopup="listbox"
		aria-expanded={isOpen}
		title={disabled && disabledReason ? disabledReason : undefined}
	>
		{#if selectedConfig}
			<!-- Selected chain display -->
			<div class="flex min-w-0 items-center gap-2">
				<div
					class="bg-primary/10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
				>
					{selectedConfig.chainName.charAt(0)}
				</div>
				<div class="flex min-w-0 flex-col items-start">
					<span class="truncate text-sm leading-tight font-medium">
						{selectedConfig.chainName}
					</span>
					<span class="text-base-content/60 text-xs leading-tight">
						{selectedConfig.nativeCurrency.symbol}
					</span>
				</div>
			</div>
		{:else}
			<!-- Placeholder -->
			<span class="text-base-content/60 text-sm">
				{$t('wallet.chain_selector.select_placeholder')}
			</span>
		{/if}

		<!-- Chevron -->
		{#if isOpen}
			<IconChevronUp class="h-4 w-4 shrink-0 opacity-60" />
		{:else}
			<IconChevronDown class="h-4 w-4 shrink-0 opacity-60" />
		{/if}
	</button>

	<!-- Dropdown Menu -->
	{#if isOpen}
		<ul
			class="dropdown-content bg-base-100 border-base-300 z-10 mt-1 w-full overflow-hidden rounded-lg border shadow-lg"
			role="listbox"
			aria-label={$t('wallet.chain_selector.label')}
		>
			{#each supportedChains as { chainId, config } (chainId)}
				<li role="option" aria-selected={chainId === selectedChainId}>
					<button
						class="hover:bg-base-200 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100"
						class:bg-base-200={chainId === selectedChainId}
						onclick={() => selectChain(chainId)}
					>
						<!-- Chain initial avatar -->
						<div
							class="bg-primary/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
						>
							{config.chainName.charAt(0)}
						</div>

						<div class="flex min-w-0 flex-col">
							<span class="text-sm font-medium">
								{$t('wallet.chain_selector.chain_name', {
									values: { chainName: config.chainName }
								})}
							</span>
							<span class="text-base-content/60 text-xs">
								{$t('wallet.chain_selector.native_currency', {
									values: { symbol: config.nativeCurrency.symbol }
								})}
							</span>
						</div>

						<!-- Check mark for selected -->
						{#if chainId === selectedChainId}
							<div class="ml-auto shrink-0">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="text-primary h-5 w-5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
							</div>
						{/if}
					</button>
				</li>
			{/each}

			{#if supportedChains.length === 0}
				<li>
					<div class="px-3 py-4 text-center text-sm opacity-60">
						{$t('wallet.no_transactions')}
					</div>
				</li>
			{/if}
		</ul>
	{/if}
</div>
