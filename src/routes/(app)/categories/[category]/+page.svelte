<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { locale } from 'svelte-i18n';
	import CategoryIcon from '$lib/components/categories/CategoryIcon.svelte';
	import { isTempStaffEnabled } from '$lib/services/feature-flags';
	import { staffCopy } from '$lib/staffing/copy';
	import {
		dedupeIdenticalTasks,
		isJunkListing,
		isOutsideElSalvador,
		isZeroPricedTask,
		taskBrowseLocation
	} from '$lib/browse/task-board';
	import { BROWSE_DEADLINE_MS } from '$lib/nostr/relayQuery';
	import { findTasks } from '$lib/nostr/findTasks';
	import { findServices } from '$lib/nostr/findServices';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
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
	let timedOut = $state(false);
	let loadAttempt = 0;

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

	function servicePlace(service: Service): string {
		const details = service.locationDetails;
		if (!details) return '';
		if ('locationDisplayName' in details && details.locationDisplayName)
			return details.locationDisplayName;
		if ('serviceLocation' in details && details.serviceLocation?.displayName) {
			return details.serviceLocation.displayName;
		}
		return '';
	}

	const openTasks = $derived(
		dedupeIdenticalTasks(
			tasks.filter((task) => task.status === 'OPEN' && !isZeroPricedTask(task))
		).filter((task) => {
			const listing = {
				title: task.title,
				description: task.description,
				location: taskBrowseLocation(task)
			};
			return !isJunkListing(listing) && !isOutsideElSalvador(listing);
		})
	);
	const visibleTasks = $derived(openTasks.filter((task) => matches(task)));

	function taskModeLabel(task: Task): string {
		if (task.taskType === TaskTypeEnum.REMOTE) return copy.remote;
		if (task.taskType === TaskTypeEnum.IN_PERSON) return copy.inPerson;
		return '';
	}
	const categoryServices = $derived(
		services.filter((service) => {
			const listing = {
				title: service.title,
				description: service.description,
				location: servicePlace(service)
			};
			return !isJunkListing(listing) && !isOutsideElSalvador(listing);
		})
	);
	const visibleServices = $derived(categoryServices.filter((service) => matches(service)));
	const filledSubs = $derived.by(() => {
		const ids: string[] = [];
		for (const item of [...openTasks, ...categoryServices]) {
			const classified = classifyListing(item);
			if (classified.category !== categoryId || !classified.subcategory) continue;
			if (!ids.includes(classified.subcategory)) ids.push(classified.subcategory);
		}
		return ids;
	});

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

	function loadCategory() {
		const attempt = ++loadAttempt;
		loading = true;
		timedOut = false;
		const timer = setTimeout(() => {
			if (attempt !== loadAttempt) return;
			loading = false;
			timedOut = true;
		}, BROWSE_DEADLINE_MS);
		const reveal = () => {
			if (attempt !== loadAttempt) return;
			clearTimeout(timer);
			loading = false;
		};
		Promise.all([
			findTasks({ limit: 50, page: 1 }, (batch) => {
				if (attempt !== loadAttempt || batch.length === 0) return;
				tasks = batch;
				timedOut = false;
				reveal();
			})
				.then((result) => {
					if (attempt !== loadAttempt) return;
					tasks = result.tasks || [];
					if (tasks.length > 0) timedOut = false;
				})
				.catch(() => {
					if (attempt !== loadAttempt) return;
					tasks = [];
				}),
			findServices({ limit: 40, page: 1 }, (batch) => {
				if (attempt !== loadAttempt || batch.length === 0) return;
				services = batch;
				timedOut = false;
				reveal();
			})
				.then((result) => {
					if (attempt !== loadAttempt) return;
					services = result.services || [];
					if (services.length > 0) timedOut = false;
				})
				.catch(() => {
					if (attempt !== loadAttempt) return;
					services = [];
				})
		]).finally(reveal);
	}

	onMount(() => {
		loadCategory();
		return () => {
			loadAttempt += 1;
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
				{#if category.mode === 'remote' || category.mode === 'local'}
					<p class="text-base-content/70 text-sm" data-testid="category-mode">
						{category.mode === 'remote' ? copy.remote : copy.inPerson}
					</p>
				{/if}
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
			{#each category.subcategories.filter((subcategory) => loading || filledSubs.includes(subcategory.id)) as subcategory (subcategory.id)}
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
			<div class="mt-8 flex flex-col gap-3" data-testid="browse-loading" aria-busy="true">
				<p class="sr-only">{copy.loading}</p>
				{#each [0, 1, 2, 3] as card (card)}
					<div class="bg-base-300 h-24 w-full animate-pulse rounded-xl"></div>
				{/each}
			</div>
		{:else if timedOut && visibleTasks.length === 0 && visibleServices.length === 0}
			<div class="mt-8" data-testid="category-timeout">
				<p>{copy.slow}</p>
				<button type="button" class="btn btn-outline btn-sm mt-3" onclick={loadCategory}>
					{copy.retry}
				</button>
			</div>
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
								{#if taskPrice(task) || taskModeLabel(task)}
									<p class="mt-2 flex flex-wrap items-center gap-2 text-sm">
										{#if taskPrice(task)}<span>{taskPrice(task)}</span>{/if}
										{#if taskModeLabel(task)}
											<span class="badge badge-ghost badge-sm">{taskModeLabel(task)}</span>
										{/if}
									</p>
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
