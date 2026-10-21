<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { animate, stagger } from 'motion';
	import {
		advancedWallet,
		loadAdvancedMode,
		setAdvancedMode
	} from '$lib/stores/wallet/wallet-mode';

	let reduced = $state(false);

	const cards = $derived([
		{
			slug: 'nostr',
			title: $t('settings.cards.nostr.title'),
			description: $t('settings.cards.nostr.description'),
			animation: 'icon-float',
			color: 'var(--color-primary)'
		},
		{
			slug: 'devices',
			title: $t('settings.cards.devices.title'),
			description: $t('settings.cards.devices.description'),
			animation: 'icon-pulse-glow',
			color: 'var(--color-info)'
		},
		{
			slug: 'recovery',
			title: $t('settings.cards.recovery.title'),
			description: $t('settings.cards.recovery.description'),
			animation: 'icon-rotate-oscillate',
			color: 'var(--color-success)'
		},
		{
			slug: 'muted',
			title: $t('settings.cards.muted.title'),
			description: $t('settings.cards.muted.description'),
			animation: 'icon-vibrate',
			color: 'var(--color-warning)'
		},
		{
			slug: 'notifications',
			title: $t('settings.cards.notifications.title'),
			description: $t('settings.cards.notifications.description'),
			animation: 'icon-pulse-glow',
			color: 'var(--color-info)'
		},
		{
			slug: 'actions',
			title: $t('settings.cards.actions.title'),
			description: $t('settings.cards.actions.description'),
			animation: 'icon-spin-slow',
			color: 'var(--color-error)'
		}
	]);

	let gridEl = $state<HTMLElement | null>(null);

	function revealCards(items: NodeListOf<Element>): void {
		for (const item of items) {
			if (item instanceof HTMLElement) item.style.opacity = '1';
		}
	}

	onMount(() => {
		loadAdvancedMode();
		reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!gridEl || reduced) return;
		const items = gridEl.querySelectorAll('.settings-card');
		if (items.length === 0) return;
		try {
			void animate(items, { scale: [0.9, 1], opacity: [0, 1] }, {
				duration: 0.3,
				delay: stagger(0.06, { startDelay: 0.1 }),
				easing: [0, 0, 0, 1]
			} as Parameters<typeof animate>[2])
				.finished.then(() => {
					if (gridEl) gridEl.classList.add('entrance-done');
				})
				.catch(() => revealCards(items));
		} catch {
			revealCards(items);
		}
	});

	function handleMouseMove(e: MouseEvent, card: HTMLElement) {
		const rect = card.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		card.style.setProperty('--spotlight-x', `${x}px`);
		card.style.setProperty('--spotlight-y', `${y}px`);
	}

	function handleMouseLeave(card: HTMLElement) {
		card.style.setProperty('--spotlight-x', '50%');
		card.style.setProperty('--spotlight-y', '50%');
	}
</script>

<label
	class="border-base-300 bg-base-100 mb-4 flex min-h-12 min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"
	data-testid="advanced-mode"
>
	<span class="min-w-0 flex-1">
		<span class="block text-sm font-semibold">{$t('settings.cards.advanced.title')}</span>
		<span class="text-base-content/60 block text-xs"
			>{$t('settings.cards.advanced.description')}</span
		>
	</span>
	<input
		type="checkbox"
		class="toggle toggle-primary"
		checked={$advancedWallet}
		onchange={(event) => {
			const input = event.currentTarget;
			if (input instanceof HTMLInputElement) setAdvancedMode(input.checked);
		}}
	/>
</label>

<div bind:this={gridEl} class="settings-grid grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
	{#each cards as card (card.slug)}
		<a
			href="/settings/{card.slug}"
			class="settings-card group border-base-300/50 bg-base-100 relative block overflow-hidden rounded-2xl border p-6 shadow-lg active:scale-[0.97] active:brightness-95 sm:hover:scale-[1.02] sm:hover:shadow-xl"
			onmousemove={(e) => handleMouseMove(e, e.currentTarget)}
			onmouseleave={(e) => handleMouseLeave(e.currentTarget)}
			aria-label="{card.title} - {card.description}"
		>
			<div
				class="settings-card-spotlight pointer-events-none absolute inset-0 hidden opacity-0 transition-opacity duration-300 sm:block sm:group-hover:opacity-100"
				style="background: radial-gradient(300px circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), {card.color}15, transparent 60%)"
			></div>

			<div
				class="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 sm:group-hover:opacity-100"
				style="box-shadow: inset 0 0 40px {card.color}10, 0 0 30px {card.color}08"
			></div>

			<div class="relative z-10 flex flex-col items-center text-center">
				<div
					class="settings-card-icon {card.animation} mb-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl"
					style="background: {card.color}15; color: {card.color}"
				>
					{#if card.slug === 'nostr'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-8 w-8"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline
								points="10 17 15 12 10 7"
							/><line x1="15" y1="12" x2="3" y2="12" /></svg
						>
					{:else if card.slug === 'devices'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-8 w-8"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line
								x1="12"
								y1="18"
								x2="12.01"
								y2="18"
							/></svg
						>
					{:else if card.slug === 'recovery'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-8 w-8"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg
						>
					{:else if card.slug === 'muted'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-8 w-8"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle
								cx="8.5"
								cy="7"
								r="4"
							/><line x1="18" y1="8" x2="23" y2="13" /><line x1="23" y1="8" x2="18" y2="13" /></svg
						>
					{:else if card.slug === 'notifications'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-8 w-8"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path
								d="M13.73 21a2 2 0 0 1-3.46 0"
							/></svg
						>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-8 w-8"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							><circle cx="12" cy="12" r="3" /><path
								d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
							/></svg
						>
					{/if}
				</div>

				<h5 class="settings-card-title text-base-content mb-1 text-sm font-semibold">
					{card.title}
				</h5>
				<p class="settings-card-description text-base-content/60 text-xs">
					{card.description}
				</p>

				<div
					class="mt-3 flex items-center gap-1 text-xs font-medium opacity-0 transition-all duration-300 sm:group-hover:translate-x-1 sm:group-hover:opacity-100"
					style="color: {card.color}"
				>
					<span>Open</span>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-3 w-3"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg
					>
				</div>
			</div>
		</a>
	{/each}
</div>

<style>
	@keyframes icon-float {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-4px);
		}
	}

	@keyframes icon-pulse-glow {
		0%,
		100% {
			filter: drop-shadow(0 0 0px currentColor);
			transform: scale(1);
		}
		50% {
			filter: drop-shadow(0 0 8px currentColor);
			transform: scale(1.05);
		}
	}

	@keyframes icon-rotate-oscillate {
		0%,
		100% {
			transform: rotate(0deg);
		}
		25% {
			transform: rotate(8deg);
		}
		75% {
			transform: rotate(-8deg);
		}
	}

	@keyframes icon-vibrate {
		0%,
		100% {
			transform: translateX(0);
		}
		20% {
			transform: translateX(-2px);
		}
		40% {
			transform: translateX(2px);
		}
		60% {
			transform: translateX(-1px);
		}
		80% {
			transform: translateX(1px);
		}
	}

	@keyframes icon-spin-slow {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.icon-float {
		animation: icon-float 3s ease-in-out infinite;
		will-change: transform;
	}

	.icon-pulse-glow {
		animation: icon-pulse-glow 2.5s ease-in-out infinite;
		will-change: filter, transform;
	}

	.icon-rotate-oscillate {
		animation: icon-rotate-oscillate 3s ease-in-out infinite;
		will-change: transform;
	}

	.icon-vibrate {
		animation: icon-vibrate 2s ease-in-out infinite;
		will-change: transform;
	}

	.icon-spin-slow {
		animation: icon-spin-slow 8s linear infinite;
		will-change: transform;
	}

	.settings-card:active {
		transform: scale(0.97);
	}

	.settings-card {
		contain: layout style paint;
	}

	:global(.entrance-done) .settings-card {
		transition:
			transform 300ms ease,
			box-shadow 300ms ease,
			filter 300ms ease;
	}

	@media (prefers-reduced-motion: reduce) {
		.icon-float,
		.icon-pulse-glow,
		.icon-rotate-oscillate,
		.icon-vibrate,
		.icon-spin-slow {
			animation: none !important;
		}

		.settings-card {
			transition: none !important;
		}

		.settings-card:active {
			transform: none !important;
		}
	}
</style>
