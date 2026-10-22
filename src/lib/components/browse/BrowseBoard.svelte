<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { locale, t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import CategoryIcon from '$lib/components/categories/CategoryIcon.svelte';
	import BrowseSearch from '$lib/components/browse/BrowseSearch.svelte';
	import ShiftCard from '$lib/components/browse/ShiftCard.svelte';
	import ServiceCard from '$lib/components/service/ServiceCard.svelte';
	import TaskCard from '$lib/components/task/TaskCard.svelte';
	import type TaskLocationMapComponent from '$lib/components/maps/TaskLocationMap.svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { user } from '$lib/stores/user.store';
	import { servicesStore } from '$lib/stores/service.store';
	import { tasksStore } from '$lib/stores/task.store';
	import { browseCopy } from '$lib/browse/copy';
	import { isTaskStaffId } from '$lib/browse/staff-card';
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
	import { isStaffRole, roleLabel, ROLE_LABELS } from '$lib/staffing/roles';
	import { suggestStaffRole } from '$lib/staffing/suggest-role';
	import { STAFF_ROLE_CHOICES } from '$lib/staffing/types';
	import type { Service } from '$lib/types/service.d';
	import type { Task } from '$lib/types/task.d';
	import {
		displayTaskStatus,
		isServiceExpired,
		isShiftExpired
	} from '$lib/utils/helpers/taskDeadline';
	import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { dedupeListingsByEvent } from '$lib/utils/listings/publicListings';
	import { isRemotePlace, shiftMapTask, visibleListingKey } from '$lib/browse/visible-listings';
	import { isShiftPin } from '$lib/utils/maps/pin-actions';
	import { servicePagePath } from '$lib/utils/service/listing';
	import {
		browseTiles,
		cacheIndexHit,
		categoriesWithListings,
		countsFromRows,
		fetchTypesenseJson,
		indexSuppliesListings
	} from '$lib/search/browse-index';
	import { listingImage } from '$lib/utils/helpers/listing-image';
	import { categoriesFor, classifyListing, serviceSuggestions } from '$lib/search/taxonomy.js';

	let { kind }: { kind: 'tasks' | 'services' | 'staff' } = $props();

	const language = $derived(String($locale || 'en').startsWith('es') ? 'es' : 'en');
	const copy = $derived(browseCopy(language));
	const staff = $derived(staffCopy(language));
	function translated(key: string, fallback: string): string {
		const value = $t(key);
		if (!value || value === key) return fallback;
		return String(value);
	}

	const title = $derived(
		kind === 'tasks'
			? translated('navbar.browse_tasks', copy.tasks)
			: kind === 'services'
				? translated('navbar.browse_services', copy.services)
				: translated('navbar.browse_staff', copy.staff)
	);
	const shiftsHeading = $derived(translated('navbar.open_shifts', copy.shifts));
	const workersHeading = $derived(translated('navbar.workers', copy.workers));
	const mapLabel = $derived(translated('find_tasks.map', language === 'es' ? 'Mapa' : 'Map'));
	const listLabel = $derived(translated('find_tasks.list', language === 'es' ? 'Lista' : 'List'));
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
	let loadAttempt = 0;
	let relayReady = $state(false);
	let catalogLoaded = $state(false);
	let indexRows = $state<Array<BrowseRow & { id: string; when?: string; poster?: string }> | null>(
		null
	);
	let btcPrice = $state(120_000);
	let viewMode = $state<'list' | 'map'>('list');
	let TaskLocationMap: typeof TaskLocationMapComponent | null = $state(null);
	let selectedTaskForMap = $state<Task | null>(null);
	let selectedServiceForMap = $state<Service | null>(null);

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
					poster: task.npub,
					expired: displayTaskStatus(task) === 'EXPIRED'
				}));
		}
		if (kind === 'services') {
			return services
				.filter((service) => serviceIsListed(service))
				.map((service) => ({
					...rowForService(service),
					poster: service.npub,
					expired: isServiceExpired(service)
				}))
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
			.map((job) => ({
				...rowForShift(job),
				poster: job.businessPubkey,
				expired: isShiftExpired(job)
			}))
			.filter((row) => showExpired || !row.expired);
		const fromTasks = selectSharedTasks(postedStaff, { includeExpired: showExpired })
			.filter((task) => classifyListing(task).category === 'temp-staff')
			.map((task) => {
				const role = suggestStaffRole(task.title || '', task.description || '');
				return {
					...rowForTask(task),
					categoryId: role || 'reception',
					poster: task.npub,
					expired: displayTaskStatus(task) === 'EXPIRED'
				};
			})
			.filter((row) => showExpired || !row.expired);
		return [...shifts, ...fromTasks];
	});
	const relayHasListings = $derived(
		kind === 'tasks'
			? relayReady && tasks.length > 0
			: kind === 'services'
				? relayReady && services.length > 0
				: staffBoard.loaded &&
					(staffBoard.jobs.some((job) => job.status !== 'cancelled') || postedStaff.length > 0)
	);
	const rows = $derived(relayHasListings ? relayRows : (indexRows ?? relayRows));
	const tileCounts = $derived(
		countsFromRows(rows.filter((row) => matchesBrowse(row, { ...filters, categoryId: '' })))
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

	function selectCategory(id: string) {
		categoryId = categoryId === id ? '' : id;
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

	type ListedRow = BrowseRow & { id: string; when?: string; poster?: string };

	function taskFromRow(row: ListedRow): Task {
		const remote = row.mode === 'remote' || isRemotePlace(row.location);
		const place = row.location
			? {
					displayName: row.location,
					formattedAddress: row.location,
					latitude: null,
					longitude: null,
					zipCode: '',
					locationLoaded: false
				}
			: null;
		return {
			id: row.id,
			npub: row.poster || '',
			title: row.title || '',
			description: row.text || '',
			status: TaskStatusEnum.OPEN,
			taskType: remote ? TaskTypeEnum.REMOTE : TaskTypeEnum.IN_PERSON,
			budget: { amount: row.price, currency: 'USD', type: 'FIXED' },
			deadline: null,
			dateRange: null,
			pickupLocation: remote ? null : place,
			dropOffLocation: null,
			skills: [],
			categories: [],
			searchCategory: row.categoryId || undefined,
			createdAt: 0,
			updatedAt: '',
			completedAt: null,
			cancelledAt: null,
			deletedAt: null,
			isDeleted: false,
			requiredSkills: [],
			estimatedHours: 0,
			isRemovals: false,
			isBoosted: false,
			boostPercentage: null
		} as Task;
	}

	function serviceFromRow(row: ListedRow): Service {
		const remote = row.mode === 'remote' || isRemotePlace(row.location);
		return {
			id: row.id,
			uniqueId: row.id,
			npub: row.poster || '',
			status: 'active',
			title: row.title || '',
			description: row.text || '',
			skills: [],
			categories: [],
			searchCategory: row.categoryId || undefined,
			createdAt: 0,
			serviceLocationTypes: remote
				? [ServiceLocationTypeEnum.REMOTE]
				: [ServiceLocationTypeEnum.TASKER_LOCATION],
			locationDetails: remote
				? undefined
				: {
						taskerLocation: {
							locationDisplayName: row.location,
							serviceLocation: {
								displayName: row.location,
								latitude: null,
								longitude: null,
								zipCode: '',
								locationLoaded: false
							}
						}
					},
			pricing: {
				type:
					row.priceSuffix === '/hr' ? ServicePricingTypeEnum.HOURLY : ServicePricingTypeEnum.FIXED,
				amount: row.price,
				hourlyRate: row.price,
				currency: 'USD'
			}
		} as Service;
	}

	const mapTasks = $derived.by((): Task[] => {
		if (kind === 'services') return [];
		const listed = visible as ListedRow[];
		if (kind === 'tasks') {
			if (!relayHasListings) return dedupeListingsByEvent(listed.map(taskFromRow));
			const ids = new Set(listed.map((row) => row.id));
			return dedupeListingsByEvent(tasks.filter((task) => ids.has(task.id)));
		}
		if (!relayHasListings) {
			return dedupeListingsByEvent(
				listed.map((row) => shiftMapTask(row.id, row.title, row.location))
			);
		}
		const ids = new Set(listed.map((row) => row.id));
		const posted = postedStaff.filter((task) => ids.has(task.id));
		const postedIds = new Set(posted.map((task) => task.id));
		const jobs = staffBoard.jobs
			.filter((job) => ids.has(job.id) && !postedIds.has(job.id) && job.status !== 'cancelled')
			.map((job) =>
				shiftMapTask(job.id, job.title, job.location, {
					latitude: job.latitude,
					longitude: job.longitude
				})
			);
		return dedupeListingsByEvent([...posted, ...jobs]);
	});

	const visibleServices = $derived.by((): Service[] => {
		if (kind !== 'services') return [];
		const listed = visible as ListedRow[];
		if (!relayHasListings) return dedupeListingsByEvent(listed.map(serviceFromRow));
		const ids = new Set(listed.map((row) => row.id));
		return dedupeListingsByEvent(services.filter((service) => ids.has(service.id)));
	});

	const shiftCards = $derived.by(() => {
		if (kind !== 'staff') return [];
		const jobsById = new Map(staffBoard.jobs.map((job) => [job.id, job]));
		const tasksById = new Map(postedStaff.map((task) => [task.id, task]));
		return (visible as ListedRow[]).map((row) => {
			const job = relayHasListings ? jobsById.get(row.id) : undefined;
			const task = relayHasListings ? tasksById.get(row.id) : undefined;
			if (job) {
				return {
					id: job.id,
					title: job.title,
					role: roleLabel(job.role, language),
					location: job.location,
					rate: job.hourlyRateUsd,
					when: shiftSpan(job),
					poster: job.businessPubkey,
					taskLink: false,
					key: `job:${job.id}`
				};
			}
			if (task) {
				return {
					id: task.id,
					title: task.title || '',
					role: roleLabel(
						suggestStaffRole(task.title || '', task.description || '') || 'reception',
						language
					),
					location: task.pickupLocation?.displayName || task.dropOffLocation?.displayName || '',
					rate: taskPriceUsd(task),
					when: '',
					poster: task.npub,
					taskLink: true,
					key: `task:${visibleListingKey(task)}`
				};
			}
			return {
				id: row.id,
				title: row.title,
				role: roleLabel(row.categoryId, language),
				location: row.location,
				rate: row.price,
				when: row.when || row.date,
				poster: row.poster || '',
				taskLink: isTaskStaffId(row.id),
				key: `row:${row.id}`
			};
		});
	});

	async function bidOnTask(task: Task) {
		if (!$user?.npub) {
			await goto('/auth/signup');
			return;
		}
		await goto(resolve('/(app)/tasks/[taskId]', { taskId: task.id }));
	}

	async function viewTask(task: Task) {
		await goto(resolve('/(app)/tasks/[taskId]', { taskId: task.id }));
	}

	function openPin(task: Task) {
		if (isShiftPin(kind, task.id)) {
			void goto(resolve('/(app)/shifts/[id]', { id: task.id }));
			return;
		}
		void goto(resolve('/(app)/tasks/[taskId]', { taskId: task.id }));
	}

	function openService(service: Service) {
		void goto(servicePagePath(service));
	}

	function rowFromHit(hit: Record<string, unknown>, cacheType: 'task' | 'service' | 'shift') {
		const id = String(hit.public_id || hit.id || '');
		const title = String(hit.title || '');
		const text = String(hit.description || '');
		if (id && cacheType !== 'shift') cacheIndexHit(cacheType, id, hit);
		const poster = String(hit.npub || hit.pubkey || hit.author || hit.business_pubkey || '');
		const classified = classifyListing({ title, description: text });
		const storedCategory = String(hit.category || hit.role || '');
		const categoryId =
			cacheType === 'shift'
				? isStaffRole(storedCategory)
					? storedCategory
					: suggestStaffRole(title, text) || 'other'
				: classified.category || storedCategory;
		return {
			id,
			title,
			text,
			categoryId,
			price: Number(hit.price_usd) || 0,
			location: String(hit.location || ''),
			mode: (hit.remote ? 'remote' : 'local') as BrowseMode,
			date: '',
			when: '',
			image: typeof hit.image === 'string' ? hit.image : '',
			poster
		};
	}

	async function pullIndex(attempt: number): Promise<boolean> {
		const type = kind === 'tasks' ? 'task' : kind === 'services' ? 'service' : 'shift';
		const params = new SvelteURLSearchParams({ type, perPage: '60' });
		if (query.trim()) params.set('q', query.trim());
		if (maxPrice) params.set('maxPrice', maxPrice);
		if (location.trim()) params.set('location', location.trim());
		if (mode === 'remote') params.set('remote', 'true');
		if (mode === 'local') params.set('remote', 'false');
		const list = await fetchTypesenseJson(`/api/search?${params}`);
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
		return true;
	}

	function offerExpired(live: number, expired: number) {
		if (!shouldOfferExpired(live, expired, showExpired, offeredExpired)) return;
		showExpired = true;
		offeredExpired = true;
	}

	function loadRelay(attempt: number, finish: () => void) {
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
					catalogLoaded = true;
				})
				.catch(() => {
					if (attempt !== loadAttempt) return;
					postedStaff = [];
				});
			return;
		}
		const relayHasRows = kind === 'tasks' ? tasks.length > 0 : services.length > 0;
		if (catalogLoaded && relayReady && relayHasRows) {
			finish();
			return;
		}
		if (kind === 'tasks') {
			loadSharedCatalog()
				.then((rows) => {
					if (attempt !== loadAttempt) return;
					tasks = keepLoadedRows(tasks, rows);
					catalogLoaded = true;
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
				catalogLoaded = true;
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
					loadRelay(attempt, () => {});
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
		const signature = [query, maxPrice, location, mode, allCountries, kind].join('|');
		const timer = setTimeout(() => {
			if (signature) loadBoard();
		}, 200);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (!browser || kind !== 'tasks') return;
		const incoming = $tasksStore.items;
		if (incoming.length === 0) return;
		const known = new Set(tasks.map((item) => item.id));
		const fresh = incoming.filter((item) => item.id && !known.has(item.id));
		if (fresh.length === 0) return;
		tasks = [...tasks, ...fresh];
		relayReady = true;
	});

	$effect(() => {
		if (!browser || kind !== 'services') return;
		const incoming = $servicesStore.items;
		if (incoming.length === 0) return;
		const known = new Set(services.map((item) => item.id));
		const fresh = incoming.filter((item) => item.id && !known.has(item.id));
		if (fresh.length === 0) return;
		services = [...services, ...fresh];
		relayReady = true;
	});

	onMount(() => {
		void import('$lib/components/maps/TaskLocationMap.svelte').then((module) => {
			TaskLocationMap = module.default;
		});
		cryptoPriceService
			.getCurrentPrice('BTC')
			.then((price) => {
				if (price > 0) btcPrice = price;
			})
			.catch(() => undefined);
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
		<h1 class="browse-heading text-2xl font-semibold">{title}</h1>
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
		<div class="md:grid md:grid-cols-[minmax(0,1fr)_18rem] md:items-start md:gap-6 lg:grid-cols-2">
			{#snippet listingMap(height: string)}
				{#if TaskLocationMap}
					{#if kind === 'services'}
						<TaskLocationMap
							services={visibleServices}
							{height}
							selectedService={selectedServiceForMap}
							onServiceSelected={(event) => (selectedServiceForMap = event.service)}
							onViewService={openService}
							{btcPrice}
						/>
					{:else}
						<TaskLocationMap
							tasks={mapTasks}
							{height}
							selectedTask={selectedTaskForMap}
							onSelectTask={bidOnTask}
							onViewTask={viewTask}
							onOpenTask={kind === 'staff' ? openPin : undefined}
							drawersLoaded={true}
							loadDrawerComponents={async () => {}}
							{btcPrice}
						/>
					{/if}
				{:else}
					<div
						class="bg-base-200 flex h-full min-h-64 w-full items-center justify-center rounded-lg"
					>
						<span class="loading loading-spinner loading-lg"></span>
					</div>
				{/if}
			{/snippet}
			<div class="min-w-0">
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
						<input
							class="input input-bordered"
							type="number"
							min="0"
							step="1"
							bind:value={maxPrice}
						/>
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

				{#if visible.length > 0}
					{#if kind === 'staff'}
						<h2 class="browse-heading mt-8 text-lg">{shiftsHeading}</h2>
					{/if}
					<div class="mt-4 flex justify-end md:hidden">
						<button
							type="button"
							class="btn btn-outline btn-sm"
							data-testid="browse-view-toggle"
							onclick={() => (viewMode = viewMode === 'list' ? 'map' : 'list')}
						>
							{viewMode === 'map' ? listLabel : mapLabel}
						</button>
					</div>
					<div
						class="{viewMode === 'map' ? 'hidden md:block' : ''} mt-4 min-h-0"
						data-testid="browse-results"
						data-result-count={visible.length}
					>
						<div class="min-w-0">
							<ul class="flex flex-col gap-4">
								{#if kind === 'tasks'}
									{#each mapTasks as task (visibleListingKey(task))}
										<li data-price={formatTaskPrice(taskPriceUsd(task))}>
											<TaskCard
												{task}
												selectedTask={selectedTaskForMap}
												{btcPrice}
												onSelectTask={bidOnTask}
												onViewTask={viewTask}
												drawersLoaded={true}
												loadDrawerComponents={async () => {}}
												onSelectTaskForMap={(item) => (selectedTaskForMap = item)}
												isMapVisible={true}
												linkHref={resolve('/(app)/tasks/[taskId]', { taskId: task.id })}
											/>
										</li>
									{/each}
								{:else if kind === 'services'}
									{#each visibleServices as service (visibleListingKey(service))}
										<li>
											<ServiceCard
												{service}
												{btcPrice}
												selectedService={selectedServiceForMap}
												onSelectServiceForMap={(item) => (selectedServiceForMap = item)}
												isMapVisible={true}
												onRequestQuote={openService}
												resultHref={servicePagePath(service)}
											/>
										</li>
									{/each}
								{:else}
									{#each shiftCards as shift (shift.key)}
										<li data-price={formatTaskPrice(shift.rate)}>
											<ShiftCard
												id={shift.id}
												title={shift.title}
												role={shift.role}
												location={shift.location}
												rate={shift.rate}
												when={shift.when}
												poster={shift.poster}
												{btcPrice}
												taskLink={shift.taskLink}
												remoteLabel={copy.remote}
												viewLabel={language === 'es' ? 'Ver' : 'View'}
											/>
										</li>
									{/each}
								{/if}
							</ul>
						</div>
					</div>
					{#if viewMode === 'map'}
						<div class="browse-map mt-4 h-[70dvh] md:hidden" data-testid="browse-map-mobile">
							{@render listingMap('100%')}
						</div>
					{/if}
				{:else if loading || (kind === 'staff' && !staffBoard.loaded && !timedOut)}
					<div class="mt-6 flex flex-col gap-3" data-testid="browse-loading" aria-busy="true">
						<p class="sr-only">{copy.loading}</p>
						{#each [0, 1, 2, 3] as card (card)}
							<div class="bg-base-300 h-24 w-full animate-pulse rounded-xl"></div>
						{/each}
					</div>
				{:else if timedOut}
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
				{:else if kind === 'staff'}
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

				{#if kind === 'staff' && enabled && staffBoard.loaded}
					<h2 class="browse-heading mt-8 text-lg">{workersHeading}</h2>
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
			</div>
			{#if visible.length > 0}
				<aside
					class="browse-map sticky top-4 hidden h-[min(32rem,calc(100dvh-2rem))] md:block lg:h-[32rem]"
					data-testid="browse-map"
					aria-label={mapLabel}
				>
					{@render listingMap('100%')}
				</aside>
			{/if}
		</div>
	{/if}
</div>
