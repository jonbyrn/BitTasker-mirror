<!--
 * @deprecated This component uses v1 escrow patterns with ContractWithEvents.
 * Only used by deprecated components. This file will be removed in a future release.
-->
<script lang="ts">
	/**
	 * @deprecated This file is deprecated. No direct NDK replacement; context display
	 * is handled inline in ContractCardNDK.svelte.
	 */
	import { resolve } from '$app/paths';
	import type { ContractWithEvents } from '$lib/types/contract';
	import { contractStore } from '$lib/stores/contract.store';
	import { buildContractContextPresentation } from '$lib/utils/service-contract/context-presentation';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';

	const {
		contract,
		variant = 'detail',
		enableExpandableDescription = false
	} = $props<{
		contract: ContractWithEvents;
		variant?: 'card' | 'detail';
		enableExpandableDescription?: boolean;
	}>();

	const presentation = $derived(
		buildContractContextPresentation(contract, contractStore.getContractKey)
	);
	const serviceListingHref = $derived.by(() => {
		if (!presentation.isServiceContract) {
			return null;
		}

		const rawServiceId =
			typeof contract.contractEvent.content.serviceId === 'string' &&
			contract.contractEvent.content.serviceId.trim().length > 0
				? contract.contractEvent.content.serviceId
				: typeof contract.contractEvent.content.contextId === 'string' &&
					  contract.contractEvent.content.contextId.trim().length > 0
					? contract.contractEvent.content.contextId
					: null;

		return rawServiceId ? `/services/${encodeURIComponent(rawServiceId)}` : null;
	});

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	let descriptionElement: HTMLParagraphElement | null = $state(null);
	let showFullDescription = $state(false);
	let isDescriptionTruncated = $state(false);

	function checkIfDescriptionTruncated() {
		if (!descriptionElement || !presentation.description) {
			isDescriptionTruncated = false;
			return;
		}

		const clone = descriptionElement.cloneNode(true) as HTMLElement;
		clone.className = descriptionElement.className.replace(/line-clamp-\d+/g, '').trim();
		clone.style.position = 'absolute';
		clone.style.visibility = 'hidden';
		clone.style.pointerEvents = 'none';
		clone.style.height = 'auto';
		clone.style.maxHeight = 'none';
		clone.style.overflow = 'visible';
		clone.style.width = `${descriptionElement.offsetWidth}px`;
		document.body.appendChild(clone);

		const fullHeight = clone.scrollHeight;
		const lineHeight = parseFloat(getComputedStyle(descriptionElement).lineHeight) || 24;
		const maxHeight = lineHeight * 3;

		document.body.removeChild(clone);
		isDescriptionTruncated = fullHeight > maxHeight + 1;
	}

	onMount(() => {
		const handleResize = () => {
			if (variant === 'detail' && presentation.isServiceContract) {
				checkIfDescriptionTruncated();
			}
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	$effect(() => {
		const description = presentation.description;
		const isServiceDetail =
			enableExpandableDescription && variant === 'detail' && presentation.isServiceContract;

		showFullDescription = false;
		isDescriptionTruncated = false;

		if (!isServiceDetail || !description || !descriptionElement) {
			return;
		}

		requestAnimationFrame(() => {
			setTimeout(() => {
				checkIfDescriptionTruncated();
			}, 0);
		});
	});
</script>

{#if variant === 'card'}
	<div class="space-y-1">
		<span class="card-title line-clamp-2 text-lg font-semibold">
			{presentation.title}
		</span>
		{#if presentation.description}
			<p class="text-base-content/80 line-clamp-2 text-sm whitespace-pre-line">
				{presentation.description}
			</p>
		{/if}
	</div>
{:else}
	<div class="space-y-2">
		<div class="flex items-center gap-2">
			{#if !presentation.isServiceContract}
				<span class="badge badge-outline badge-sm">
					{tr('dashboard.contracts.context_summary.task_contract', 'Task Contract')}
				</span>
			{/if}
			{#if presentation.selectedTierLabel}
				<span class="badge badge-outline badge-sm">
					{presentation.selectedTierLabel}
				</span>
			{/if}
		</div>

		<div class="space-y-2">
			{#if serviceListingHref}
				<a
					href={resolve(serviceListingHref)}
					class="hover:text-primary card-title line-clamp-2 text-lg font-semibold transition-colors"
				>
					{presentation.title}
				</a>
			{:else}
				<span class="card-title line-clamp-2 text-lg font-semibold">
					{presentation.title}
				</span>
			{/if}
			{#if presentation.description}
				<p
					bind:this={descriptionElement}
					class={`text-base-content/70 text-sm whitespace-pre-line ${
						enableExpandableDescription &&
						variant === 'detail' &&
						presentation.isServiceContract &&
						!showFullDescription
							? 'line-clamp-3'
							: ''
					}`}
					data-testid={enableExpandableDescription &&
					variant === 'detail' &&
					presentation.isServiceContract
						? 'contract-context-summary-description'
						: undefined}
					id={enableExpandableDescription && variant === 'detail' && presentation.isServiceContract
						? 'contract-context-summary-description'
						: undefined}
				>
					{presentation.description}
				</p>
				{#if enableExpandableDescription && variant === 'detail' && presentation.isServiceContract && isDescriptionTruncated}
					<button
						type="button"
						class="btn btn-ghost btn-xs mt-2 h-auto min-h-0 px-0 text-[0.75rem] font-semibold tracking-wide uppercase"
						aria-controls="contract-context-summary-description"
						aria-expanded={showFullDescription}
						onclick={() => {
							showFullDescription = !showFullDescription;
						}}
					>
						{showFullDescription
							? tr('common.show_less', 'See Less')
							: tr('common.show_more', 'See More')}
					</button>
				{/if}
			{/if}
		</div>
	</div>
{/if}
