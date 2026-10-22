<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import CategoryIcon from '$lib/components/categories/CategoryIcon.svelte';
	import BrowseSearch from '$lib/components/browse/BrowseSearch.svelte';
	import { browseCopy } from '$lib/browse/copy';
	import { isTaskStaffId, staffMetaSegments } from '$lib/browse/staff-card';
	import {
		availableWorkers,
		matchesBrowse,
		workerMatches,
		type BrowseMode,
		type BrowseRow
	} from '$lib/browse/match';
	import { isTempStaffEnabled } from '$lib/services/feature-flags';
	import {
		browseLiveCount,
		formatTaskPrice,
		isImplausibleBrowsePrice,
		isJunkListing,
		isOutsideElSalvador,
		isUnrealisticDemoPrice,
		keepLoadedRows,
		selectSharedTasks,
		shouldOfferExpired,
		taskPriceUsd
	} from '$lib/browse/task-board';
	import { hitFromTask } from '$lib/search/detail-preview';
	import { findServices } from '$lib/nostr/findServices';
	import { BROWSE_DEADLINE_MS } from '$lib/nostr/relayQuery';
	import { loadSharedCatalog } from '$lib/browse/shared-catalog';
	import { refreshStaffBoard, staffBoard } from '$lib/staffing/board.svelte';
	import { staffCopy } from '$lib/staffing/copy';
	import { shiftSpan } from '$lib/staffing/hours';
	import { roleLabel, ROLE_LABELS } from '$lib/staffing/roles';
	import { suggestStaffRole } from '$lib/staffing/suggest-role';
	import { STAFF_ROLE_CHOICES } from '$lib/staffing/types';
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
		browseTiles,
		cacheIndexHit,
		categoriesWithListings,
		countsFromRows,
		fetchTypesenseJson,
		indexSuppliesListings
	} from '$lib/search/browse-index';
	import { listingImage } from '$lib/utils/helpers/listing-image';
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
	let postedStaff = $state<Task[]>([]);
	let loading = $state(true);
	let timedOut = $state(false);
	let allCountries = $state(false);
	let showExpired = $state(false);
	let offeredExpired = false;
	let openingId = $state('');
	let loadAttempt = 0;
	let relayReady = $state(false);
	let indexRows = $state<Array<BrowseRow & { id: string; when?: string }> | null>(null);
	let indexCounts = $state<Record<string, number>>({});

	const categories = $derived(
		[...categoriesFor('local'), ...categoriesFor('remote')].filter(
			(category) => category.id !== 'temp-staff'
		)
	);
	const suggestions = $derived.by(() => {
		if (kind === 'staff') {
			const needle = query.trim().toLowerCase();
			return STAFF_ROLE_CHOICES.filter((role) => {
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
			price: taskPriceUsd(task),
			location: task.pickupLocation?.displayName || '',
			mode: taskMode(task),
			date: '',
			image: listingImage(task.attachments)
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
			date: '',
			image: listingImage(service.portfolio) || listingImage(service.attachments)
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

	const relayRows = $derived.by(() => {
		if (kind === 'tasks') {
			return selectSharedTasks(tasks, { allCountries, includeExpired: showExpired })
				.filter((task) => classifyListing(task).category !== 'temp-staff')
				.map((task) => ({
					...rowForTask(task),
					expired: displayTaskStatus(task) === 'EXPIRED'
				}));
		}
		if (kind === 'services') {
			return services
				.filter((service) => serviceIsListed(service))
				.map((service) => ({ ...rowForService(service), expired: isServiceExpired(service) }))
				.filter((row) => showExpired || !row.expired);
		}
		const shifts = staffBoard.jobs
			.filter(
				(job) =>
					job.status !== 'cancelled' &&
					!isJunkListing({
						title: job.title,
						description: job.requirements,
						location: job.location
					})
			)
			.map((job) => ({ ...rowForShift(job), expired: isShiftExpired(job) }))
			.filter((row) => showExpired || !row.expired);
		const fromTasks = selectSharedTasks(postedStaff, { includeExpired: showExpired })
			.filter((task) => classifyListing(task).category === 'temp-staff')
			.map((task) => {
				const role = suggestStaffRole(task.title || '', task.description || '');
				return {
					...rowForTask(task),
					categoryId: role || 'reception',
					expired: displayTaskStatus(task) === 'EXPIRED'
				};
			})
			.filter((row) => showExpired || !row.expired);
		return [...shifts, ...fromTasks];
	});
	const rows = $derived(indexRows ?? relayRows);
	const tileCounts = $derived(
		kind === 'staff'
			? indexRows
				? indexCounts
				: countsFromRows(relayRows)
			: countsFromRows(rows)
	);
	const listedCategories = $derived(browseTiles(categories, tileCounts, true));
	const listedRoles = $derived(
		categoriesWithListings(
			STAFF_ROLE_CHOICES.map((role) => ({ id: role })),
			tileCounts
		)
	);
	const visible = $derived(rows.filter((row) => matchesBrowse(row, filters)));
	const workers = $derived(
		kind === 'staff'
			? availableWorkers(staffBoard.jobs, staffBoard.seats).filter((worker) =>
					workerMatches(worker, filters)
				)
			: []
	);

	function rememberTasks(rows: Task[]) {
		for (const task of rows) {
			if (task.id) cacheIndexHit('task', task.id, hitFromTask(task));
		}
	}

	function pressRow(id: string) {
		openingId = id;
	}

	function selectCategory(id: string) {
		categoryId = categoryId === id ? '' : id;
	}

	function categoryName(id: string): string {
		const category = categoryById(id);
		if (!category) return id;
		return language === 'es' ? category.nameEs : category.name;
	}

	function serviceIsListed(service: Service): boolean {
		const listing = {
			title: service.title,
			description: service.description,
			location: servicePlace(service)
		};
		if (isJunkListing(listing) || isOutsideElSalvador(listing)) return false;
		const amount = servicePrice(service);
		if (isUnrealisticDemoPrice({ title: service.title, amount })) return false;
		return !isImplausibleBrowsePrice({
			title: service.title,
			description: service.description,
			amount,
			currency: service.pricing?.currency
		});
	}

	function rowFromHit(hit: Record<string, unknown>, cacheType: 'task' | 'service' | 'shift') {
		const id = String(hit.public_id || hit.id || '');
		const title = String(hit.title || '');
		const text = String(hit.description || '');
		if (id && cacheType !== 'shift') cacheIndexHit(cacheType, id, hit);
		const classified = classifyListing({ title, description: text });
		return {
			id,
			title,
			text,
			categoryId: classified.category || String(hit.category || ''),
			price: Number(hit.price_usd) || 0,
			location: String(hit.location || ''),
			mode: (hit.remote ? 'remote' : 'local') as BrowseMode,
			date: '',
			when: '',
			image: typeof hit.image === 'string' ? hit.image : ''
		};
	}

	async function pullIndex(attempt: number): Promise<boolean> {
		const type = kind === 'tasks' ? 'task' : kind === 'services' ? 'service' : 'shift';
		const params = new SvelteURLSearchParams({ type, perPage: '60' });
		if (query.trim()) params.set('q', query.trim());
		if (categoryId) params.set('category', categoryId);
		if (maxPrice) params.set('maxPrice', maxPrice);
		if (location.trim()) params.set('location', location.trim());
		if (mode === 'remote') params.set('remote', 'true');
		if (mode === 'local') params.set('remote', 'false');
		const [list, countBody] = await Promise.all([
			fetchTypesenseJson(`/api/search?${params}`),
			fetchTypesenseJson(`/api/search/counts?type=${type}`)
		]);
		if (
			attempt !== loadAttempt ||
			!indexSuppliesListings(list, type === 'shift' ? 'shifts' : `${type}s`)
		) {
			return false;
		}
		const hits = (
			type === 'task' ? list?.tasks : type === 'service' ? list?.services : list?.shifts
		) as unknown;
		if (!Array.isArray(hits) || hits.length === 0) return false;
		const counts =
			(countBody?.counts as Record<string, number> | undefined) ||
			(list?.categoryCounts as Record<string, number> | undefined) ||
			{};
		const cacheType = type === 'task' ? 'task' : type === 'service' ? 'service' : 'shift';
		const mapped = hits
			.map((hit) => rowFromHit(hit as Record<string, unknown>, cacheType))
			.filter((row) => {
				if (kind === 'tasks' && row.categoryId === 'temp-staff') return false;
				if (isJunkListing({ title: row.title, description: row.text, location: row.location }))
					return false;
				if (isUnrealisticDemoPrice({ title: row.title, amount: row.price })) return false;
				if (kind === 'staff') return true;
				return !isImplausibleBrowsePrice({
					title: row.title,
					description: row.text,
					amount: row.price,
					currency: 'USD',
					category: row.categoryId
				});
			});
		if (mapped.length === 0) return false;
		indexRows = mapped;
		indexCounts = counts;
		return true;
	}

	function offerExpired(live: number, expired: number) {
		if (!shouldOfferExpired(live, expired, showExpired, offeredExpired)) return;
		showExpired = true;
		offeredExpired = true;
	}

	function loadRelay(attempt: number, finish: () => void) {
		indexRows = null;
		if (kind === 'staff') {
			if (!enabled) {
				finish();
				return;
			}
			refreshStaffBoard()
				.then(() => {
					if (attempt !== loadAttempt) return;
					relayReady = true;
					const jobs = staffBoard.jobs.filter((job) => job.status !== 'cancelled');
					const expired = jobs.filter((job) => isShiftExpired(job)).length;
					offerExpired(jobs.length - expired, expired);
				})
				.finally(finish);
			loadSharedCatalog()
				.then((rows) => {
					if (attempt !== loadAttempt) return;
					postedStaff = rows;
				})
				.catch(() => {
					if (attempt !== loadAttempt) return;
					postedStaff = [];
				});
			return;
		}
		const relayHasRows = kind === 'tasks' ? tasks.length > 0 : services.length > 0;
		if (relayReady && relayHasRows) {
			finish();
			return;
		}
		if (kind === 'tasks') {
			loadSharedCatalog()
				.then((rows) => {
					if (attempt !== loadAttempt) return;
					tasks = keepLoadedRows(tasks, rows);
					rememberTasks(tasks);
					const { live, expired } = browseLiveCount(tasks, allCountries);
					if (live + expired > 0) timedOut = false;
					offerExpired(live, expired);
					relayReady = true;
				})
				.catch(() => {
					if (attempt !== loadAttempt) return;
					if (tasks.length === 0) tasks = [];
				})
				.finally(finish);
			return;
		}
		findServices({ limit: 40, page: 1, catalogOnly: true }, (batch) => {
			if (attempt !== loadAttempt || batch.length === 0) return;
			services = batch;
			timedOut = false;
			const visible = batch.filter(
				(service) => serviceIsListed(service) && (showExpired || !isServiceExpired(service))
			);
			if (visible.length > 0) finish();
		})
			.then((result) => {
				if (attempt !== loadAttempt) return;
				services = keepLoadedRows(services, result.services || []);
				const visibleServices = services.filter((service) => serviceIsListed(service));
				const expired = visibleServices.filter((service) => isServiceExpired(service)).length;
				if (visibleServices.length > 0) timedOut = false;
				offerExpired(visibleServices.length - expired, expired);
				relayReady = true;
			})
			.catch(() => {
				if (attempt !== loadAttempt) return;
				if (services.length === 0) services = [];
			})
			.finally(finish);
	}

	function loadBoard() {
		const attempt = ++loadAttempt;
		loading = true;
		timedOut = false;
		const timer = setTimeout(() => {
			if (attempt !== loadAttempt) return;
			loading = false;
			timedOut = indexRows == null && visible.length === 0;
		}, BROWSE_DEADLINE_MS);
		const finish = () => {
			if (attempt !== loadAttempt) return;
			clearTimeout(timer);
			loading = false;
		};
		if (allCountries) {
			loadRelay(attempt, finish);
			return;
		}
		pullIndex(attempt)
			.then((indexed) => {
				if (attempt !== loadAttempt) return;
				if (indexed) {
					finish();
					if (kind === 'staff' && enabled) {
						refreshStaffBoard();
						loadSharedCatalog()
							.then((rows) => {
								if (attempt !== loadAttempt) return;
								postedStaff = rows;
							})
							.catch(() => undefined);
					}
					return;
				}
				loadRelay(attempt, finish);
			})
			.catch(() => {
				if (attempt !== loadAttempt) return;
				loadRelay(attempt, finish);
			});
	}

	$effect(() => {
		if (!browser) return;
		const signature = [query, categoryId, maxPrice, location, mode, allCountries, kind].join('|');
		const timer = setTimeout(() => {
			if (signature) loadBoard();
		}, 200);
		return () => clearTimeout(timer);
	});

	onMount(() => {
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
			<ul
				class={kind === 'staff'
					? 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'
					: 'flex gap-3 overflow-x-auto pb-2'}
				data-testid={kind === 'staff' ? undefined : 'browse-category-rail'}
			>
				{#if kind === 'staff'}
					{#each listedRoles as role (role.id)}
						<li>
							<button
								type="button"
								class="border-base-300 hover:border-primary flex h-full w-full flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center"
								class:border-primary={categoryId === role.id}
								aria-pressed={categoryId === role.id}
								data-testid="browse-tile-{role.id}"
								onclick={() => selectCategory(role.id)}
							>
								<span class="text-sm font-medium">{roleLabel(role.id, language)}</span>
								<span class="text-base-content/60 text-xs">{tileCounts[role.id] || 0}</span>
							</button>
						</li>
					{/each}
				{:else}
					{#each listedCategories as category (category.id)}
						<li class="w-36 shrink-0">
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
								<span class="text-base-content/60 text-xs">{tileCounts[category.id] || 0}</span>
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
			{#if kind === 'staff'}
				<div class="mt-8 max-w-lg" data-testid="staff-empty">
					<p class="text-lg font-medium">
						{query.trim() || categoryId || maxPrice || location.trim() || date
							? staff.empty
							: staff.emptyTitle}
					</p>
					<p class="text-base-content/70 mt-2 text-sm">{staff.emptyHelp}</p>
					<a
						href={resolve('/(app)/shifts/new')}
						class="btn btn-primary mt-4"
						data-testid="staff-empty-post"
					>
						{copy.postShift}
					</a>
				</div>
			{:else}
				<p class="mt-6" data-testid="browse-empty">{copy.empty}</p>
			{/if}
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
								class="border-base-300 hover:border-primary flex items-center gap-3 rounded-xl border px-4 py-3"
								class:border-primary={openingId === row.id}
								class:opacity-80={openingId === row.id}
								aria-busy={openingId === row.id}
								data-testid="browse-result"
								data-opening={openingId === row.id ? 'true' : undefined}
								onpointerdown={() => pressRow(row.id)}
							>
								{#if row.image}
									<img
										src={row.image}
										alt=""
										class="h-14 w-14 shrink-0 rounded-lg object-cover"
										loading="lazy"
										data-testid="listing-thumbnail"
									/>
								{/if}
								<span class="min-w-0 flex-1">
									<span class="font-medium">{row.title}</span>
									<span class="listing-body text-base-content/70 mt-1 block">
										{categoryName(row.categoryId)}
										{#if row.location}· {row.location}{/if}
										{#if formatTaskPrice(row.price)}· {formatTaskPrice(row.price)}{/if}
										{#if row.expired}
											· <span class="badge badge-warning badge-sm">{copy.expired}</span>
										{/if}
										{#if openingId === row.id}
											· <span data-testid="browse-result-opening">{copy.loading}</span>
										{/if}
									</span>
								</span>
							</a>
						{:else if kind === 'services'}
							<a
								href={resolve('/(app)/services/[serviceId]', { serviceId: row.id })}
								class="border-base-300 hover:border-primary flex items-center gap-3 rounded-xl border px-4 py-3"
								data-testid="browse-result"
							>
								{#if row.image}
									<img
										src={row.image}
										alt=""
										class="h-14 w-14 shrink-0 rounded-lg object-cover"
										loading="lazy"
										data-testid="listing-thumbnail"
									/>
								{/if}
								<span class="min-w-0 flex-1">
									<span class="font-medium">{row.title}</span>
									<span class="listing-body text-base-content/70 mt-1 block">
										{categoryName(row.categoryId)}
										{#if row.location}· {row.location}{/if}
										{#if money(row.price)}· {money(row.price)}{row.priceSuffix ?? ''}{/if}
										{#if row.expired}
											· <span class="badge badge-warning badge-sm">{copy.expired}</span>
										{/if}
									</span>
								</span>
							</a>
						{:else}
							{@const staffMeta = staffMetaSegments([
								roleLabel(row.categoryId, language),
								'when' in row ? row.when : row.date,
								row.location,
								money(row.price, 2) ? `${money(row.price, 2)}/hr` : ''
							])}
							{#snippet staffBody()}
								<span class="font-medium">{row.title}</span>
								<span class="listing-body text-base-content/70 mt-1 block">
									{staffMeta.join(' · ')}
									{#if row.expired}
										{#if staffMeta.length} · {/if}<span class="badge badge-warning badge-sm">{copy.expired}</span>
									{/if}
								</span>
							{/snippet}
							{#if isTaskStaffId(row.id)}
								<a
									href={resolve('/(app)/tasks/[taskId]', { taskId: row.id })}
									class="border-base-300 hover:border-primary block rounded-xl border px-4 py-3"
									data-testid="browse-result"
								>
									{@render staffBody()}
								</a>
							{:else}
								<a
									href={resolve('/(app)/shifts/[id]', { id: row.id })}
									class="border-base-300 hover:border-primary block rounded-xl border px-4 py-3"
									data-testid="browse-result"
								>
									{@render staffBody()}
								</a>
							{/if}
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
							<span class="listing-body text-base-content/70 mt-1 block">
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
