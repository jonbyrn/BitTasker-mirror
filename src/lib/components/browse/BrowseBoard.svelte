<script lang="ts">
	import { resolve } from '$app/paths';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import CategoryIcon from '$lib/components/categories/CategoryIcon.svelte';
	import BrowseSearch from '$lib/components/browse/BrowseSearch.svelte';
	import { browseCopy } from '$lib/browse/copy';
	import {
		availableWorkers,
		matchesBrowse,
		workerMatches,
		type BrowseMode,
		type BrowseRow
	} from '$lib/browse/match';
	import { isTempStaffEnabled } from '$lib/services/feature-flags';
	import { isJunkListing, isOutsideElSalvador, prepareBrowseTasks } from '$lib/browse/task-board';
	import { findServices } from '$lib/nostr/findServices';
	import { BROWSE_DEADLINE_MS } from '$lib/nostr/relayQuery';
	import { findTasks } from '$lib/nostr/findTasks';
	import { refreshStaffBoard, staffBoard } from '$lib/staffing/board.svelte';
	import { staffCopy } from '$lib/staffing/copy';
	import { shiftSpan } from '$lib/staffing/hours';
	import { roleLabel, ROLE_LABELS } from '$lib/staffing/roles';
	import { STAFF_ROLES } from '$lib/staffing/types';
	import type { Service } from '$lib/types/service.d';
	import type { Task } from '$lib/types/task.d';
	import {
		displayTaskStatus,
		isServiceExpired,
		isShiftExpired
	} from '$lib/utils/helpers/taskDeadline';
	import { ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import {
		categoriesFor,
		categoryById,
		classifyListing,
		serviceSuggestions
	} from '$lib/search/taxonomy.js';

	let { kind }: { kind: 'tasks' | 'services' | 'staff' } = $props();

	const language = $derived(String($locale || 'en').startsWith('es') ? 'es' : 'en');
	const copy = $derived(browseCopy(language));
	const staff = $derived(staffCopy(language));
	const title = $derived(
		kind === 'tasks' ? copy.tasks : kind === 'services' ? copy.services : copy.staff
	);
	const enabled = isTempStaffEnabled();

	let query = $state('');
	let categoryId = $state('');
	let maxPrice = $state('');
	let location = $state('');
	let mode = $state<BrowseMode>('');
	let date = $state('');
	let tasks = $state<Task[]>([]);
	let services = $state<Service[]>([]);
	let loading = $state(true);
	let timedOut = $state(false);
	let allCountries = $state(false);
	let showExpired = $state(false);
	let loadAttempt = 0;

	const categories = $derived(
		[...categoriesFor('local'), ...categoriesFor('remote')].filter(
			(category) => category.id !== 'temp-staff'
		)
	);
	const suggestions = $derived.by(() => {
		if (kind === 'staff') {
			const needle = query.trim().toLowerCase();
			return STAFF_ROLES.filter((role) => {
				const label = language === 'es' ? ROLE_LABELS[role].nameEs : ROLE_LABELS[role].name;
				return !needle || label.toLowerCase().includes(needle);
			}).map((role) => ({
				id: role,
				label: language === 'es' ? ROLE_LABELS[role].nameEs : ROLE_LABELS[role].name,
				categoryId: role
			}));
		}
		return serviceSuggestions(query, language)
			.filter((item) => item.categoryId !== 'temp-staff')
			.map((item) => ({
				id: item.id,
				label: language === 'es' ? item.nameEs : item.name,
				categoryId: item.categoryId
			}));
	});

	function money(amount: number, digits = 0) {
		return amount > 0 ? `$${amount.toFixed(digits)}` : '';
	}

	function taskMode(task: Task): BrowseMode {
		if (task.taskType === TaskTypeEnum.REMOTE) return 'remote';
		if (task.taskType === TaskTypeEnum.IN_PERSON) return 'local';
		return '';
	}

	function serviceMode(service: Service): BrowseMode {
		const types = service.serviceLocationTypes ?? [];
		const remote = types.includes(ServiceLocationTypeEnum.REMOTE);
		const local = types.some((type) => type !== ServiceLocationTypeEnum.REMOTE);
		if (remote && !local) return 'remote';
		if (local && !remote) return 'local';
		return '';
	}

	function servicePrice(service: Service): number {
		const pricing = service.pricing;
		const amount =
			pricing?.type === 'HOURLY'
				? (pricing.hourlyRate ?? pricing.amount)
				: (pricing?.amount ?? pricing?.hourlyRate ?? pricing?.tiers?.[0]?.price);
		return typeof amount === 'number' ? amount : 0;
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

	function rowForTask(task: Task): BrowseRow & { id: string } {
		const classified = classifyListing(task);
		return {
			id: task.id,
			title: task.title || '',
			text: `${task.description || ''} ${(task.skills || []).join(' ')}`,
			categoryId: classified.category,
			price: typeof task.budget?.amount === 'number' ? task.budget.amount : 0,
			location: task.pickupLocation?.displayName || '',
			mode: taskMode(task),
			date: ''
		};
	}

	function rowForService(service: Service): BrowseRow & { id: string } {
		const classified = classifyListing(service);
		return {
			id: service.id,
			title: service.title || '',
			text: `${service.description || ''} ${(service.skills || []).join(' ')}`,
			categoryId: classified.category,
			price: servicePrice(service),
			priceSuffix: service.pricing?.type === 'HOURLY' ? '/hr' : '',
			location: servicePlace(service),
			mode: serviceMode(service),
			date: ''
		};
	}

	function rowForShift(job: {
		id: string;
		title: string;
		requirements: string;
		role: string;
		hourlyRateUsd: number;
		location: string;
		date: string;
		endDate?: string;
		startTime: string;
		endTime: string;
	}): BrowseRow & { id: string; when: string } {
		return {
			id: job.id,
			title: job.title,
			text: `${job.requirements} ${roleLabel(job.role, language)}`,
			categoryId: job.role,
			price: job.hourlyRateUsd,
			location: job.location,
			mode: 'local',
			date: job.date,
			when: shiftSpan(job)
		};
	}

	const filters = $derived({
		query,
		categoryId,
		maxPrice: Number(maxPrice) || 0,
		location,
		mode,
		date
	});

	const rows = $derived.by(() => {
		if (kind === 'tasks') {
			return prepareBrowseTasks(
				tasks.filter((task) => task.status === 'OPEN'),
				{ allCountries }
			)
				.map((task) => ({ ...rowForTask(task), expired: displayTaskStatus(task) === 'EXPIRED' }))
				.filter((row) => showExpired || !row.expired);
		}
		if (kind === 'services') {
			return services
				.filter(
					(service) =>
						!isJunkListing({
							title: service.title,
							description: service.description,
							location: servicePlace(service)
						}) &&
						!isOutsideElSalvador({
							title: service.title,
							description: service.description,
							location: servicePlace(service)
						})
				)
				.map((service) => ({ ...rowForService(service), expired: isServiceExpired(service) }))
				.filter((row) => showExpired || !row.expired);
		}
		return staffBoard.jobs
			.filter(
				(job) =>
					job.status !== 'cancelled' &&
					!isJunkListing({
						title: job.title,
						description: job.requirements,
						location: job.location
					}) &&
					!isOutsideElSalvador({
						title: job.title,
						description: job.requirements,
						location: job.location
					})
			)
			.map((job) => ({ ...rowForShift(job), expired: isShiftExpired(job) }))
			.filter((row) => showExpired || !row.expired);
	});
	const visible = $derived(rows.filter((row) => matchesBrowse(row, filters)));
	const workers = $derived(
		kind === 'staff'
			? availableWorkers(staffBoard.jobs, staffBoard.seats).filter((worker) =>
					workerMatches(worker, filters)
				)
			: []
	);

	function selectCategory(id: string) {
		categoryId = categoryId === id ? '' : id;
	}

	function categoryName(id: string): string {
		const category = categoryById(id);
		if (!category) return id;
		return language === 'es' ? category.nameEs : category.name;
	}

	function loadBoard() {
		const attempt = ++loadAttempt;
		loading = true;
		timedOut = false;
		const timer = setTimeout(() => {
			if (attempt !== loadAttempt) return;
			loading = false;
			timedOut = true;
		}, BROWSE_DEADLINE_MS);
		const finish = () => {
			if (attempt !== loadAttempt) return;
			clearTimeout(timer);
			loading = false;
		};
		if (kind === 'staff') {
			if (!enabled) {
				finish();
				return;
			}
			refreshStaffBoard().finally(finish);
			return;
		}
		if (kind === 'tasks') {
			findTasks({ limit: 50, page: 1 }, (batch) => {
				if (attempt !== loadAttempt || batch.length === 0) return;
				tasks = batch;
				timedOut = false;
				finish();
			})
				.then((result) => {
					if (attempt !== loadAttempt) return;
					tasks = result.tasks || [];
					if (tasks.length > 0) timedOut = false;
				})
				.catch(() => {
					if (attempt !== loadAttempt) return;
					tasks = [];
				})
				.finally(finish);
			return;
		}
		findServices({ limit: 40, page: 1 }, (batch) => {
			if (attempt !== loadAttempt || batch.length === 0) return;
			services = batch;
			timedOut = false;
			finish();
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
			.finally(finish);
	}

	onMount(() => {
		loadBoard();
		return () => {
			loadAttempt += 1;
		};
	});
</script>

<svelte:head>
	<title>{title} · BitTasker</title>
</svelte:head>

<div class="container mx-auto min-w-0 px-4 py-8" data-testid="browse-page-{kind}">
	<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
		<h1 class="text-2xl font-semibold">{title}</h1>
		{#if kind === 'tasks'}
			<button
				type="button"
				class="btn btn-outline btn-sm"
				aria-pressed={allCountries}
				data-testid="browse-all-countries"
				onclick={() => (allCountries = !allCountries)}
			>
				{allCountries ? copy.homeRegion : copy.allCountries}
			</button>
		{/if}
		{#if kind === 'staff' && enabled}
			<a href={resolve('/(app)/shifts')} class="btn btn-outline btn-sm" data-testid="browse-shifts">
				{staff.openTab}
			</a>
			<a href={resolve('/(app)/shifts/new')} class="btn btn-primary btn-sm">{copy.postShift}</a>
		{/if}
	</div>
	{#if kind === 'staff' && enabled}
		<p class="text-base-content/70 -mt-4 mb-6 max-w-2xl text-sm" data-testid="staff-note">
			{staff.noKyc}
		</p>
	{/if}

	{#if kind === 'staff' && !enabled}
		<p data-testid="shifts-off">{copy.off}</p>
	{:else}
		<BrowseSearch placeholder={copy.search} bind:query {suggestions} onpick={selectCategory} />

		<div class="mt-6" data-testid="browse-tiles">
			<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
				{#if kind === 'staff'}
					{#each STAFF_ROLES as role (role)}
						<li>
							<button
								type="button"
								class="border-base-300 hover:border-primary flex h-full w-full flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center"
								class:border-primary={categoryId === role}
								aria-pressed={categoryId === role}
								data-testid="browse-tile-{role}"
								onclick={() => selectCategory(role)}
							>
								<span class="text-sm font-medium">{roleLabel(role, language)}</span>
							</button>
						</li>
					{/each}
				{:else}
					{#each categories as category (category.id)}
						<li>
							<button
								type="button"
								class="border-base-300 hover:border-primary flex h-full w-full flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center"
								class:border-primary={categoryId === category.id}
								aria-pressed={categoryId === category.id}
								data-testid="browse-tile-{category.id}"
								onclick={() => selectCategory(category.id)}
							>
								<CategoryIcon name={category.icon} />
								<span class="text-sm leading-tight font-medium">
									{language === 'es' ? category.nameEs : category.name}
								</span>
							</button>
						</li>
					{/each}
				{/if}
			</ul>
		</div>

		<label class="mt-4 flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={showExpired} data-testid="browse-show-expired" />
			{copy.showExpired}
		</label>
		<div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="browse-filters">
			<label class="flex flex-col gap-1 text-sm">
				{kind === 'staff' ? copy.maxRate : copy.maxPrice}
				<input class="input input-bordered" type="number" min="0" step="1" bind:value={maxPrice} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				{copy.location}
				<input class="input input-bordered" type="search" bind:value={location} />
			</label>
			{#if kind === 'staff'}
				<label class="flex flex-col gap-1 text-sm">
					{copy.date}
					<input class="input input-bordered" type="date" bind:value={date} />
				</label>
			{:else}
				<label class="flex flex-col gap-1 text-sm">
					{copy.inPerson}
					<select class="select select-bordered" bind:value={mode}>
						<option value="">{copy.any}</option>
						<option value="local">{copy.inPerson}</option>
						<option value="remote">{copy.remote}</option>
					</select>
				</label>
			{/if}
		</div>

		{#if loading || (kind === 'staff' && !staffBoard.loaded && !timedOut)}
			<div class="mt-6 flex flex-col gap-3" data-testid="browse-loading" aria-busy="true">
				<p class="sr-only">{copy.loading}</p>
				{#each [0, 1, 2, 3] as card (card)}
					<div class="bg-base-300 h-24 w-full animate-pulse rounded-xl"></div>
				{/each}
			</div>
		{:else if timedOut && visible.length === 0}
			<div class="mt-6" data-testid="browse-timeout">
				<p>{copy.slow}</p>
				<button
					type="button"
					class="btn btn-outline btn-sm mt-3"
					data-testid="browse-retry"
					onclick={loadBoard}
				>
					{copy.retry}
				</button>
			</div>
		{:else if visible.length === 0}
			<p class="mt-6" data-testid="browse-empty">{copy.empty}</p>
		{:else}
			{#if kind === 'staff'}
				<h2 class="mt-8 text-lg font-medium">{copy.shifts}</h2>
			{/if}
			<ul class="mt-4 flex flex-col gap-3">
				{#each visible as row (row.id)}
					<li>
						{#if kind === 'tasks'}
							<a
								href={resolve('/(app)/tasks/[taskId]', { taskId: row.id })}
								class="border-base-300 hover:border-primary block rounded-xl border px-4 py-3"
								data-testid="browse-result"
							>
								<span class="font-medium">{row.title}</span>
								<span class="text-base-content/70 mt-1 block text-sm">
									{categoryName(row.categoryId)}
									{#if row.location}· {row.location}{/if}
									{#if money(row.price)}· {money(row.price)}{row.priceSuffix ?? ''}{/if}
									{#if row.expired}
										· <span class="badge badge-warning badge-sm">{copy.expired}</span>
									{/if}
								</span>
							</a>
						{:else if kind === 'services'}
							<a
								href={resolve('/(app)/services/[serviceId]', { serviceId: row.id })}
								class="border-base-300 hover:border-primary block rounded-xl border px-4 py-3"
								data-testid="browse-result"
							>
								<span class="font-medium">{row.title}</span>
								<span class="text-base-content/70 mt-1 block text-sm">
									{categoryName(row.categoryId)}
									{#if row.location}· {row.location}{/if}
									{#if money(row.price)}· {money(row.price)}{row.priceSuffix ?? ''}{/if}
									{#if row.expired}
										· <span class="badge badge-warning badge-sm">{copy.expired}</span>
									{/if}
								</span>
							</a>
						{:else}
							<a
								href={resolve('/(app)/shifts/[id]', { id: row.id })}
								class="border-base-300 hover:border-primary block rounded-xl border px-4 py-3"
								data-testid="browse-result"
							>
								<span class="font-medium">{row.title}</span>
								<span class="text-base-content/70 mt-1 block text-sm">
									{roleLabel(row.categoryId, language)} · {'when' in row ? row.when : row.date} · {row.location}
									{#if money(row.price, 2)}· {money(row.price, 2)}/hr{/if}
									{#if row.expired}
										· <span class="badge badge-warning badge-sm">{copy.expired}</span>
									{/if}
								</span>
							</a>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if kind === 'staff' && enabled && staffBoard.loaded}
			<h2 class="mt-8 text-lg font-medium">{copy.workers}</h2>
			{#if workers.length === 0}
				<p class="mt-3 text-sm" data-testid="browse-workers-empty">{copy.noWorkers}</p>
			{:else}
				<ul class="mt-3 flex flex-col gap-2" data-testid="browse-workers">
					{#each workers as worker (worker.pubkey)}
						<li class="border-base-300 rounded-xl border px-4 py-3">
							<span class="font-medium">{worker.name}</span>
							<span class="text-base-content/70 mt-1 block text-sm">
								{worker.roles.map((role) => roleLabel(role, language)).join(', ')}
								{#if worker.rating > 0}· {worker.rating}/5{/if}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	{/if}
</div>
