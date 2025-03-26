<script lang="ts">
	import BottomNavBar from '$lib/components/BottomNavBar.svelte';
	import { deviceInfo } from '$lib/states/deviceInfo';
	import { page } from '$app/state';
	import { sections } from '$lib/utils/consts';

	let { children } = $props();
	
	let width = $state(375);
	let activeSection = $state('');

	$effect(() => {
		const section = page.url.pathname.split('/dashboard/')[1] || '';
		activeSection = section;
	});
</script>

<svelte:head>
	<title>Dashboard | Bittasker</title>
	<meta
		name="description"
		content="Manage your tasks, bids, and wallet on Bittasker's dashboard."
	/>
</svelte:head>

<svelte:window bind:innerWidth={width} />

<div class="bg-base-200 min-h-screen md:pt-16">
	<div class="mx-auto px-2 py-8 md:px-4">
		<div class="flex flex-col gap-8 md:flex-row">
			{#if $deviceInfo?.platform === 'web' && width > 768}
				<!-- Sidebar -->
				<div class="w-full flex-shrink-0 md:w-64">
					<div class="card bg-base-100 mb-6 shadow-xl">
						<div class="card-body p-4">
							<h2 class="card-title text-lg">Dashboard</h2>
							<div class="divider my-2"></div>
							<ul class="menu bg-base-100 rounded-box w-full">
								{#each sections as section}
									<li>
										<a
											data-sveltekit-reload="off"
											href="/dashboard/{section.id}"
											class:menu-active={activeSection === section.id}
										>
											{section.label}
										</a>
									</li>
								{/each}
							</ul>
						</div>
					</div>
				</div>
			{:else}
				<BottomNavBar />
			{/if}

			<!-- Main Content -->
			<div class="mb-24 flex-grow">
				{@render children()}
			</div>
		</div>
	</div>
</div>
