<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { locale } from 'svelte-i18n';
	import CategoryIcon from '$lib/components/categories/CategoryIcon.svelte';
	import { isTempStaffEnabled } from '$lib/services/feature-flags';
	import { staffCopy } from '$lib/staffing/copy';
	import { findTasks } from '$lib/nostr/findTasks';
	import { findServices } from '$lib/nostr/findServices';
	import {
		categoryById,
		categoryCopy,
		classifyListing,
		priceLabel,
		subcategoryLabel
	} from '$lib/search/taxonomy.js';
	import type { Task } from '$lib/types/task.d';
	import type { Service } from '$lib/types/service.d';

	const categoryId = $derived(page.params.category ?? '');
	const category = $derived(categoryById(categoryId));
	let subFor = $state('');
	let subOverride = $state<string | null>(null);
	const sub = $derived(
		subFor === categoryId && subOverride !== null
			? subOverride
			: (page.url.searchParams.get('sub') ?? '')
	);
	const copy = $derived(categoryCopy(String($locale || 'en')));
	const staff = $derived(staffCopy(String($locale || 'en')));
	const spanish = $derived(String($locale || 'en').startsWith('es'));

	let tasks = $state<Task[]>([]);
	let services = $state<Service[]>([]);
	let loading = $state(true);

	function matches(item: {
		title?: string;
		description?: string;
		skills?: string[];
		categories?: Array<string | { id?: string; name?: string }>;
		searchCategory?: string;
		searchSubcategory?: string;
	}) {
		const classified = classifyListing(item);
		if (classified.category !== categoryId) return false;
		if (sub && classified.subcategory !== sub) return false;
		return true;
	}

	const visibleTasks = $derived(tasks.filter((task) => task.status === 'OPEN' && matches(task)));
	const visibleServices = $derived(services.filter((service) => matches(service)));

	function selectSub(subcategoryId: string) {
		subFor = categoryId;
		subOverride = subcategoryId;
	}

	function taskPrice(task: Task) {
		const amount = task.budget?.amount;
		return typeof amount === 'number' && amount > 0 ? `$${amount}` : '';
	}

	function servicePrice(service: Service) {
		const pricing = service.pricing;
		const amount = pricing?.amount ?? pricing?.hourlyRate ?? pricing?.tiers?.[0]?.price;
		if (typeof amount !== 'number' || amount <= 0) return '';
		return pricing?.type === 'HOURLY' ? `$${amount}/hr` : `$${amount}`;
	}

	onMount(() => {
		let cancelled = false;
		loading = true;
		Promise.all([
			findTasks({ limit: 50, page: 1 }).catch(() => ({ tasks: [] as Task[] })),
			findServices({ limit: 40, page: 1 }).catch(() => ({ services: [] as Service[] }))
		]).then(([taskResult, serviceResult]) => {
			if (cancelled) return;
			tasks = taskResult.tasks || [];
			services = serviceResult.services || [];
			loading = false;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<svelte:head>
	<title>{category ? (spanish ? category.nameEs : category.name) : copy.unknown} · BitTasker</title>
</svelte:head>

<div class="container mx-auto min-w-0 px-4 py-8" data-testid="category-page">
	<a href={resolve('/categories')} class="link link-primary text-sm">{copy.seeAll}</a>

	{#if !category}
		<h1 class="mt-4 text-2xl font-semibold">{copy.unknown}</h1>
	{:else}
		<div class="mt-4 flex items-center gap-3">
			<CategoryIcon name={category.icon} />
			<div>
				<h1 class="text-2xl font-semibold">{spanish ? category.nameEs : category.name}</h1>
				<p class="text-sm font-medium">
					{priceLabel(category.fromPrice, category.priceUnit, spanish ? 'es' : 'en')}
				</p>
				<p class="text-base-content/70 text-sm">
					{category.mode === 'remote' ? copy.remote : copy.inPerson}
				</p>
			</div>
		</div>

		{#if category.id === 'temp-staff'}
			{#if isTempStaffEnabled()}
				<p class="mt-4 text-sm">
					<a href={resolve('/(app)/shifts')} class="link link-primary">{staff.title}</a>
					·
					<a href={resolve('/(app)/shifts/new')} class="link link-primary">{staff.post}</a>
				</p>
			{:else}
				<p class="mt-4" data-testid="shifts-off">{staff.off}</p>
			{/if}
		{/if}

		<div class="mt-6 flex flex-wrap gap-2" data-testid="category-filters">
			<button
				type="button"
				class="btn btn-sm {!sub ? 'btn-primary' : 'btn-outline'}"
				onclick={() => selectSub('')}
			>
				{copy.allTypes}
			</button>
			{#each category.subcategories as subcategory (subcategory.id)}
				<button
					type="button"
					class="btn btn-sm {sub === subcategory.id ? 'btn-primary' : 'btn-outline'}"
					onclick={() => selectSub(subcategory.id)}
				>
					{subcategoryLabel(category.id, subcategory.id, spanish ? 'es' : 'en')}
				</button>
			{/each}
		</div>

		{#if loading}
			<p class="mt-8 text-sm">{copy.loading}</p>
		{:else if visibleTasks.length === 0 && visibleServices.length === 0}
			<p class="mt-8" data-testid="category-empty">{copy.empty}</p>
		{:else}
			{#if visibleTasks.length > 0}
				<h2 class="mt-8 text-lg font-semibold">{copy.tasks}</h2>
				<ul class="mt-3 grid gap-3 md:grid-cols-2">
					{#each visibleTasks as task (task.id)}
						<li>
							<a
								href={resolve('/(app)/tasks/[taskId]', { taskId: task.id })}
								class="border-base-300 hover:border-primary block rounded-xl border p-4"
							>
								<p class="font-medium">{task.title}</p>
								{#if task.description}
									<p class="text-base-content/70 mt-1 line-clamp-2 text-sm">{task.description}</p>
								{/if}
								{#if taskPrice(task)}
									<p class="mt-2 text-sm">{taskPrice(task)}</p>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			{/if}

			{#if visibleServices.length > 0}
				<h2 class="mt-8 text-lg font-semibold">{copy.services}</h2>
				<ul class="mt-3 grid gap-3 md:grid-cols-2">
					{#each visibleServices as service (service.uniqueId || service.id)}
						<li>
							<a
								href={resolve('/(app)/services/[serviceId]', {
									serviceId: service.uniqueId || service.id
								})}
								class="border-base-300 hover:border-primary block rounded-xl border p-4"
							>
								<p class="font-medium">{service.title}</p>
								{#if service.description}
									<p class="text-base-content/70 mt-1 line-clamp-2 text-sm">
										{service.description}
									</p>
								{/if}
								{#if servicePrice(service)}
									<p class="mt-2 text-sm">{servicePrice(service)}</p>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	{/if}
</div>
