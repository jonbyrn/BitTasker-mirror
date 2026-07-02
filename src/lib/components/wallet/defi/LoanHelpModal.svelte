<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { t } from 'svelte-i18n';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		mode?: 'borrow' | 'lending' | 'lp';
	}

	let { isOpen, onClose, mode = 'borrow' }: Props = $props();

	let prefix = $derived(
		mode === 'lending'
			? 'wallet.defi.lending_help'
			: mode === 'lp'
				? 'wallet.defi.lp_help'
				: 'wallet.defi.loan_help'
	);

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
		transition:fade={{ duration: 200 }}
		onclick={onClose}
	>
		<div
			class="bg-base-100 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl shadow-xl"
			transition:fly={{ y: 20, duration: 250 }}
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<div class="border-base-200 flex items-center justify-between border-b p-4">
				<h2 class="text-lg font-bold">{$t(`${prefix}.title`)}</h2>
				<button
					type="button"
					class="btn btn-ghost btn-sm btn-circle"
					onclick={onClose}
					aria-label="Close"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="space-y-5 p-5">
				<p class="text-base-content/80 text-sm leading-relaxed">
					{$t(`${prefix}.intro`)}
				</p>

				<!-- Steps -->
				<div class="space-y-4">
					<!-- Step 1 -->
					<div class="flex items-start gap-3">
						<div
							class="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
						>
							1
						</div>
						<div>
							<p class="text-sm font-semibold">{$t(`${prefix}.step1_title`)}</p>
							<p class="text-base-content/70 text-xs leading-relaxed">
								{$t(`${prefix}.step1_desc`)}
							</p>
						</div>
					</div>

					<!-- Step 2 -->
					<div class="flex items-start gap-3">
						<div
							class="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
						>
							2
						</div>
						<div>
							<p class="text-sm font-semibold">{$t(`${prefix}.step2_title`)}</p>
							<p class="text-base-content/70 text-xs leading-relaxed">
								{$t(`${prefix}.step2_desc`)}
							</p>
						</div>
					</div>

					<!-- Step 3 -->
					<div class="flex items-start gap-3">
						<div
							class="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
						>
							3
						</div>
						<div>
							<p class="text-sm font-semibold">{$t(`${prefix}.step3_title`)}</p>
							<p class="text-base-content/70 text-xs leading-relaxed">
								{$t(`${prefix}.step3_desc`)}
							</p>
						</div>
					</div>

					<!-- Step 4 -->
					<div class="flex items-start gap-3">
						<div
							class="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
						>
							4
						</div>
						<div>
							<p class="text-sm font-semibold">{$t(`${prefix}.step4_title`)}</p>
							<p class="text-base-content/70 text-xs leading-relaxed">
								{$t(`${prefix}.step4_desc`)}
							</p>
						</div>
					</div>
				</div>

				<!-- Bottom note -->
				<div class="bg-base-200 rounded-lg p-3">
					<p class="text-base-content/70 text-xs leading-relaxed">
						{$t(`${prefix}.note`)}
					</p>
				</div>
			</div>
		</div>
	</div>
{/if}
