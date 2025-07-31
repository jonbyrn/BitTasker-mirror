<script lang="ts">
	import { deviceInfo } from '$lib/stores/deviceInfo.store';
	import { page } from '$app/state';
	import { sections } from '$lib/utils/consts';
	import { t } from '$lib/stores/i18n.store';
	import 'iconify-icon';

	let { children } = $props();

	let width = $state(375);
	let activeSection = $state('');

	$effect(() => {
		const section = page.url.pathname.split('/dashboard/')[1] || '';
		activeSection = section;
	});
</script>

<svelte:head>
	<title>Dashboard | BitTasker</title>
	<meta
		name="description"
		content="Manage your tasks, bids, and wallet on BitTasker's dashboard."
	/>

	<script>
		((g) => {
			var h,
				a,
				k,
				p = 'The Google Maps JavaScript API',
				c = 'google',
				l = 'importLibrary',
				q = '__ib__',
				m = document,
				b = window;
			b = b[c] || (b[c] = {});
			var d = b.maps || (b.maps = {}),
				r = new Set(),
				e = new URLSearchParams(),
				u = () =>
					h ||
					(h = new Promise(async (f, n) => {
						await (a = m.createElement('script'));
						e.set('libraries', [...r] + '');
						for (k in g)
							e.set(
								k.replace(/[A-Z]/g, (t) => '_' + t[0].toLowerCase()),
								g[k]
							);
						e.set('callback', c + '.maps.' + q);
						a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
						d[q] = f;
						a.onerror = () => (h = n(Error(p + ' could not load.')));
						a.nonce = m.querySelector('script[nonce]')?.nonce || '';
						m.head.append(a);
					}));
			d[l]
				? console.warn(p + ' only loads once. Ignoring:', g)
				: (d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)));
		})({
			key: 'AIzaSyAqWtItXmQGJWbTOGX-CW2VciMuKiUMqZY',
			v: 'weekly'
			// Use the 'v' parameter to indicate the version to use (weekly, beta, alpha, etc.).
			// Add other bootstrap parameters as needed, using camel case.
		});
	</script>
</svelte:head>

<svelte:window bind:innerWidth={width} />

<div class="bg-base-200 mx-auto flex h-full w-full flex-row gap-8 sm:px-4 sm:py-8">
	{#if $deviceInfo?.platform === 'web' && width > 768}
		<!-- Sidebar -->
		<div class="w-full flex-shrink-0 md:w-64">
			<div class="card bg-base-100 mb-6 shadow-xl rounded-xl">
				<div class="card-body p-4">
					<h2 class="card-title text-lg">{$t('dashboard.titl')}</h2>
					<div class="divider my-2"></div>
					<ul class="menu bg-base-100 rounded-box w-full">
						{#each sections as section}
							<li>
								<a
									data-sveltekit-reload="off"
									href="/dashboard/{section.id}"
									class:menu-active={activeSection === section.id}
									class="flex items-center gap-3"
								>
									<iconify-icon 
										icon={section.icon} 
										width="20" 
										class="text-primary"
									></iconify-icon>
									{$t(section.label)}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>
	{/if}

	<!-- Main Content -->
	<div class="min-h-0 w-full flex-1">
		{@render children()}
	</div>
</div>
