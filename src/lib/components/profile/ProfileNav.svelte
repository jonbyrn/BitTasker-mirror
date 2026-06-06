<script lang="ts">
	import { t } from 'svelte-i18n';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconCheck from '~icons/mdi/check';

	const sections = [
		{ id: 'about', labelKey: 'common.profile.about' },
		{ id: 'services', labelKey: 'common.profile.services' },
		{ id: 'portfolio', labelKey: 'common.profile.portfolio' },
		{ id: 'reviews', labelKey: 'common.profile.reviews' },
		{ id: 'tasks', labelKey: 'common.profile.tasks' }
	];

	let activeSection = $state(sections[0].id);
	let scrollLock = $state(false);
	let navRef = $state<HTMLElement | null>(null);
	let dropdownOpen = $state(false);

	function handleClickOutside(event: MouseEvent) {
		if (dropdownOpen) {
			const target = event.target as HTMLElement;
			if (!target.closest('.profile-nav-dropdown')) {
				dropdownOpen = false;
			}
		}
	}

	function handleNavClick(sectionId: string) {
		scrollLock = true;
		activeSection = sectionId;

		const target = document.getElementById(sectionId);
		target?.scrollIntoView({ behavior: 'smooth' });

		// Focus management: move focus to target section heading for keyboard users
		const heading = target?.querySelector('h2, h3') as HTMLElement | null;
		if (heading) {
			heading.setAttribute('tabindex', '-1');
			heading.focus({ preventScroll: true });
		}

		// Safari-compatible scrollend handling
		if ('onscrollend' in window) {
			const onScrollEnd = () => {
				scrollLock = false;
				window.removeEventListener('scrollend', onScrollEnd);
			};
			window.addEventListener('scrollend', onScrollEnd, { once: true });
		}
		// Always set timeout fallback (covers Safari + short scrolls)
		setTimeout(() => {
			scrollLock = false;
		}, 600);

		// Clear hash after scroll completes. Keeping the hash in the URL causes
		// it to persist through back-navigation (the hash becomes part of the
		// history entry, so navigating away and pressing back returns to
		// profile#section). Remove it once the smooth scroll is done.
		const clearHash = () => {
			if (window.location.hash) {
				history.replaceState(null, '', window.location.pathname + window.location.search);
			}
		};
		if ('onscrollend' in window) {
			window.addEventListener('scrollend', clearHash, { once: true });
		}
		setTimeout(clearHash, 800);
	}

	function handleKeydown(e: KeyboardEvent, currentIndex: number) {
		let targetIndex: number | null = null;

		switch (e.key) {
			case 'ArrowRight':
				targetIndex = (currentIndex + 1) % sections.length;
				break;
			case 'ArrowLeft':
				targetIndex = (currentIndex - 1 + sections.length) % sections.length;
				break;
			case 'Home':
				targetIndex = 0;
				break;
			case 'End':
				targetIndex = sections.length - 1;
				break;
			default:
				return;
		}

		e.preventDefault();
		const links = navRef?.querySelectorAll<HTMLAnchorElement>('a[data-nav-link]');
		if (links && targetIndex !== null && links[targetIndex]) {
			links[targetIndex].focus();
			links[targetIndex].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
		}
	}

	function handleIntersection(entries: IntersectionObserverEntry[]) {
		if (scrollLock) return;

		for (const entry of entries) {
			if (entry.isIntersecting) {
				activeSection = entry.target.id;
				break;
			}
		}
	}

	$effect(() => {
		const observer = new IntersectionObserver(handleIntersection, {
			rootMargin: '-73px 0px -60% 0px',
			threshold: [0, 0.1, 0.25, 0.5, 0.75, 1]
		});

		for (const section of sections) {
			const el = document.getElementById(section.id);
			if (el) observer.observe(el);
		}

		// Check initial hash
		const hash = window.location.hash.slice(1);
		if (hash && sections.some((s) => s.id === hash)) {
			activeSection = hash;
		}

		return () => observer.disconnect();
	});
</script>

<svelte:window onclick={handleClickOutside} />

<nav
	bind:this={navRef}
	aria-label="Profile sections"
	class="bg-base-100 border-base-300 sticky top-0 z-10 mx-auto max-w-6xl rounded-lg border shadow-md"
>
	<!-- Mobile: full-width dropdown -->
	<div class="px-4 py-2 md:hidden">
		<div class="dropdown profile-nav-dropdown w-full" class:dropdown-open={dropdownOpen}>
			<button
				type="button"
				class="btn no-animation border-base-300 bg-base-100/50 hover:bg-base-100/80 inline-flex w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-xl border px-4 text-sm font-medium transition-all duration-200"
				aria-haspopup="listbox"
				aria-expanded={dropdownOpen}
				aria-label={$t('profile.select_section')}
				onclick={(e) => {
					e.stopPropagation();
					dropdownOpen = !dropdownOpen;
				}}
			>
				<span class="truncate"
					>{$t(
						sections.find((s) => s.id === activeSection)?.labelKey || sections[0].labelKey
					)}</span
				>
				<IconChevronDown
					class="h-4 w-4 shrink-0 transition-transform duration-200 {dropdownOpen
						? 'rotate-180'
						: ''}"
				/>
			</button>
			{#if dropdownOpen}
				<ul
					class="dropdown-content menu bg-base-100 border-base-300 z-50 mt-1 max-h-80 w-full overflow-x-hidden overflow-y-auto rounded-xl border p-2 shadow-xl"
					role="listbox"
					tabindex="-1"
					aria-label={$t('profile.select_section')}
				>
					{#each sections as section (section.id)}
						<li role="option" aria-selected={activeSection === section.id}>
							<button
								type="button"
								class="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm {activeSection ===
								section.id
									? 'bg-primary/10 text-primary font-semibold'
									: 'hover:bg-base-200'}"
								onclick={() => {
									handleNavClick(section.id);
									dropdownOpen = false;
								}}
							>
								<span class="truncate">{$t(section.labelKey)}</span>
								{#if activeSection === section.id}
									<IconCheck class="h-4 w-4 shrink-0" />
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
	<!-- Tablet+: centered horizontal buttons -->
	<div
		class="scrollbar-none hidden snap-x snap-mandatory gap-1 overflow-x-auto px-4 py-2 md:flex md:justify-center md:gap-2"
	>
		{#each sections as section, i (section.id)}
			<a
				data-nav-link
				href="#{section.id}"
				class="btn btn-sm shrink-0 snap-start whitespace-nowrap {activeSection === section.id
					? 'btn-primary'
					: 'btn-ghost'}"
				aria-current={activeSection === section.id ? 'page' : undefined}
				tabindex="0"
				onclick={(e) => {
					e.preventDefault();
					handleNavClick(section.id);
				}}
				onkeydown={(e) => handleKeydown(e, i)}>{$t(section.labelKey)}</a
			>
		{/each}
	</div>
</nav>

<style>
	.scrollbar-none {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scrollbar-none::-webkit-scrollbar {
		display: none;
	}
</style>
