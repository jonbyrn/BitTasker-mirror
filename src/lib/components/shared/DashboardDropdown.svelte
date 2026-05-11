<script lang="ts" generics="T extends string | number">
	import type { Component } from 'svelte';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconCheck from '~icons/mdi/check';
	import { onMount } from 'svelte';
	import { teleport } from '$lib/utils/portal';

	interface Option<T> {
		id: T;
		label: string;
		icon?: Component;
	}

	let {
		options,
		value = $bindable(),
		onSelect,
		label = '',
		containerClass = '',
		buttonClass = 'btn-sm h-10 rounded-xl border-base-300 bg-base-100/50 hover:bg-base-100/80',
		dropdownClass = '',
		testId = '',
		id = `dropdown-${Math.random().toString(36).slice(2, 9)}`,
		usePortal = true
	}: {
		options: Option<T>[];
		value: T;
		onSelect?: (value: T) => void;
		label?: string;
		containerClass?: string;
		buttonClass?: string;
		dropdownClass?: string;
		testId?: string;
		id?: string;
		usePortal?: boolean;
	} = $props();

	let isOpen = $state(false);
	let triggerRef = $state<HTMLElement | null>(null);
	let menuStyle = $state('');

	const selectedOption = $derived(options.find((opt) => opt.id === value) || options[0]);

	function handleSelect(optionId: T) {
		value = optionId;
		isOpen = false;
		onSelect?.(optionId);
	}

	function updatePosition() {
		if (!isOpen || !triggerRef || !usePortal) return;
		const rect = triggerRef.getBoundingClientRect();
		const menuHeight = 320; // max-h-80 is 20rem = 320px
		const spaceBelow = window.innerHeight - rect.bottom;
		const spaceAbove = rect.top;

		let top = rect.bottom + 4;
		if (spaceBelow < menuHeight + 20 && spaceAbove > spaceBelow) {
			// Flip to above if not enough space below and more space above
			top = rect.top - menuHeight - 4;
		}

		// Ensure the menu doesn't go off-screen horizontally
		const left = Math.max(8, Math.min(rect.left, window.innerWidth - 208)); // 200px min-width + 8px margin
		menuStyle = `
			position: fixed;
			top: ${top}px;
			left: ${left}px;
			width: ${rect.width}px;
			z-index: 10000;
		`;
	}

	$effect(() => {
		if (isOpen && usePortal) {
			updatePosition();
			// Listen to scroll events on the app shell content (which is the main scroll container)
			const scrollContainer = document.querySelector('.app-shell__content');
			if (scrollContainer) {
				scrollContainer.addEventListener('scroll', updatePosition, { passive: true });
			}
			window.addEventListener('resize', updatePosition);
			return () => {
				if (scrollContainer) {
					scrollContainer.removeEventListener('scroll', updatePosition);
				}
				window.removeEventListener('resize', updatePosition);
			};
		}
	});

	function toggleDropdown(e: MouseEvent) {
		e.preventDefault();
		const nextState = !isOpen;
		isOpen = nextState;
		if (nextState) {
			window.dispatchEvent(new CustomEvent('dashboard-dropdown-open', { detail: { id } }));
		}
	}

	function handleOtherDropdownOpen(event: Event) {
		const detail = (event as CustomEvent<{ id: string }>).detail;
		if (detail?.id !== id) {
			isOpen = false;
		}
	}

	onMount(() => {
		const handler = handleOtherDropdownOpen as EventListener;
		window.addEventListener('dashboard-dropdown-open', handler);
		return () => window.removeEventListener('dashboard-dropdown-open', handler);
	});

	function handleClickOutside(event: MouseEvent) {
		if (isOpen) {
			const target = event.target as HTMLElement;
			if (!target.closest('.dashboard-dropdown-container')) {
				isOpen = false;
			}
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div
	bind:this={triggerRef}
	class="dashboard-dropdown-container dropdown {isOpen ? 'dropdown-open' : ''} {containerClass}"
	data-testid={testId}
>
	{#if label}
		<label
			for={id}
			class="label-text mb-1 block px-1 text-xs font-semibold tracking-wide uppercase opacity-70"
		>
			{label}
		</label>
	{/if}
	<button
		{id}
		type="button"
		class="btn no-animation inline-flex w-full min-w-0 flex-nowrap items-center justify-between gap-2 overflow-hidden px-4 font-medium transition-all duration-200 {buttonClass}"
		onclick={toggleDropdown}
		aria-haspopup="listbox"
		aria-expanded={isOpen}
		aria-label={label || undefined}
	>
		<div class="flex w-0 min-w-0 flex-1 items-center gap-2 overflow-hidden">
			{#if selectedOption?.icon}
				{@const Icon = selectedOption.icon}
				<Icon class="h-4 w-4 shrink-0 opacity-70" />
			{/if}
			<span class="truncate">{selectedOption?.label}</span>
		</div>
		<IconChevronDown
			class="h-4 w-4 shrink-0 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}"
		/>
	</button>

	{#if isOpen}
		{#if usePortal}
			<div use:teleport>
				<ul
					class="menu bg-base-100 border-base-300 z-10000 max-h-80 w-full min-w-0 overflow-x-hidden overflow-y-auto rounded-xl border p-2 shadow-xl focus:outline-none {dropdownClass}"
					role="listbox"
					tabindex="-1"
					aria-label={label || undefined}
					style={menuStyle}
				>
					{#each options as option (option.id)}
						<li role="option" aria-selected={value === option.id} class="w-full overflow-hidden">
							<button
								type="button"
								class="text-base-content flex w-full items-center justify-between gap-3 px-3 py-2 text-sm {value ===
								option.id
									? 'bg-primary/10 text-primary font-semibold'
									: 'hover:bg-base-200'}"
								onclick={() => handleSelect(option.id)}
							>
								<div class="flex min-w-0 flex-1 items-center gap-2">
									{#if option.icon}
										{@const OptionIcon = option.icon}
										<OptionIcon
											class="h-4 w-4 shrink-0 {value === option.id ? 'text-primary' : 'opacity-60'}"
										/>
									{/if}
									<span class="truncate">{option.label}</span>
								</div>
								{#if value === option.id}
									<IconCheck class="h-4 w-4 shrink-0" />
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{:else}
			<ul
				class="menu dropdown-content bg-base-100 border-base-300 z-100 mt-1 max-h-80 w-full min-w-0 overflow-x-hidden overflow-y-auto rounded-xl border p-2 shadow-xl focus:outline-none {dropdownClass}"
				role="listbox"
				tabindex="-1"
				aria-label={label || undefined}
			>
				{#each options as option (option.id)}
					<li role="option" aria-selected={value === option.id} class="w-full overflow-hidden">
						<button
							type="button"
							class="text-base-content flex w-full items-center justify-between gap-3 px-3 py-2 text-sm {value ===
							option.id
								? 'bg-primary/10 text-primary font-semibold'
								: 'hover:bg-base-200'}"
							onclick={() => handleSelect(option.id)}
						>
							<div class="flex min-w-0 flex-1 items-center gap-2">
								{#if option.icon}
									{@const OptionIcon = option.icon}
									<OptionIcon
										class="h-4 w-4 shrink-0 {value === option.id ? 'text-primary' : 'opacity-60'}"
									/>
								{/if}
								<span class="truncate">{option.label}</span>
							</div>
							{#if value === option.id}
								<IconCheck class="h-4 w-4 shrink-0" />
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<style>
	/* Ensure the dropdown doesn't get cut off in small containers */
	.dropdown-content {
		position: absolute;
		top: 100%;
		left: 0;
	}
</style>
