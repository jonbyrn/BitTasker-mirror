<script>
	import { page } from '$app/stores';
	import { darkMode } from '$lib/states/theme';

	// Using Svelte 5 runes
	const { children } = $props();

	// Dashboard navigation items
	const navItems = [
		{ title: 'Explore Tasks', href: '/dashboard', icon: 'search', emoji: '🔍' },
		{ title: 'Current Contracts', href: '/dashboard/contracts', icon: 'file-text', emoji: '📄' },
		{ title: 'Messages', href: '/dashboard/messages', icon: 'mail', emoji: '📨' },
		{ title: 'Alerts', href: '/dashboard/alerts', icon: 'bell', emoji: '🚨' },
		{ title: 'Settings', href: '/dashboard/settings', icon: 'settings', emoji: '🔧' }
	];

	// Active route tracking
	let activePath = $derived($page.url.pathname);
</script>

<div class="bg-base-200 flex min-h-screen">
	<!-- Sidebar navigation - using daisyUI menu component -->
	<aside class="bg-base-100 hidden w-64 p-4 md:block">
		<div class="mb-6 flex items-center justify-center">
			<h1 class="text-primary text-2xl font-bold">Dashboard</h1>
		</div>

		<ul class="menu rounded-box bg-base-200 p-2">
			<li class="menu-title">
				<span>Navigation</span>
			</li>

			{#each navItems as item}
				<li>
					<a href={item.href} class:menu-active={activePath === item.href}>
						<span>{item.emoji} {item.title}</span>
					</a>
				</li>
			{/each}
		</ul>

		<div class="mt-auto pt-6">
			<div class="flex items-center justify-between">
				<span class="text-sm">Theme</span>
				<input type="checkbox" class="toggle toggle-primary" bind:checked={$darkMode} />
			</div>
		</div>
	</aside>

	<!-- Mobile menu (visible on small screens) -->
	<div class="navbar bg-base-100 md:hidden">
		<div class="navbar-start">
			<div class="dropdown">
				<div tabindex="0" role="button" class="btn btn-ghost">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 6h16M4 12h8m-8 6h16"
						/>
					</svg>
				</div>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<ul
					tabindex="0"
					class="menu dropdown-content menu-sm rounded-box bg-base-100 z-[1] mt-3 w-52 p-2 shadow"
				>
					{#each navItems as item}
						<li>
							<a href={item.href} class:menu-active={activePath === item.href}>
								<span>{item.emoji} {item.title}</span>
							</a>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</div>

	<!-- Main content -->
	<div class="flex-1 overflow-x-auto p-4 md:p-8">
		<div class="bg-base-300">
			<div class="bg-base-200 px-4 py-6">
				{@render children()}
			</div>
		</div>
	</div>
</div>
