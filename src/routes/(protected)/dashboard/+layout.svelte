<script lang="ts">
	import { deviceInfo } from '$lib/stores/deviceInfo.store';
	import { page } from '$app/state';
	import { sections } from '$lib/utils/consts';
	import BottomNavBar from '$lib/components/BottomNavBar.svelte';

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
	<!-- <script
		async
		defer
		src="https://maps.googleapis.com/maps/api/js?key={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&loading=async&libraries=places"
	></script> -->

	<script>
		(g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({
		  key: "AIzaSyAqWtItXmQGJWbTOGX-CW2VciMuKiUMqZY",
		  v: "weekly",
		  // Use the 'v' parameter to indicate the version to use (weekly, beta, alpha, etc.).
		  // Add other bootstrap parameters as needed, using camel case.
		});
	</script>
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
