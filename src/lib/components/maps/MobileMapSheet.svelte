<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Task } from '$lib/types/task.d';
	import TaskLocationMap from '$lib/components/maps/TaskLocationMap.svelte';
	import { t } from 'svelte-i18n';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';

	const {
		tasks,
		selectedTask = null,
		onCardClick,
		onBidClick,
		scrollToTaskCard,
		satsFromUsd,
		btcPrice,
		formatNumberWithTwoDecimals,
		// ✅ offsets para respetar tu header y bottom nav en mobile
		topOffset = '64px', // alto del header
		bottomOffset = '64px' // alto de la barra inferior
	} = $props<{
		tasks: Task[];
		selectedTask: Task | null;
		onCardClick: (t: Task) => void;
		onBidClick: (t: Task, e: Event) => void;
		scrollToTaskCard: (id: string) => void;
		satsFromUsd: (usd: number, btcPrice: number) => string | bigint;
		btcPrice: number;
		formatNumberWithTwoDecimals: (n: number) => string;
		topOffset?: string;
		bottomOffset?: string;
	}>();

	let handleEl: HTMLElement | null = null;
	let sheetEl: HTMLElement | null = null;
	let contentEl: HTMLElement | null = null;

	// estado drag
	let startY = $state(0);
	let currentY = $state(0);
	let snaps = $state({ low: 0, mid: 0, high: 0 });
	let sheetTop = $state(0);

	function applyTop() {
		if (sheetEl) sheetEl.style.transform = `translateY(${sheetTop}px)`;
	}
	function adjustScrollableHeight() {
		if (!contentEl) return;
		const vh = window.innerHeight;
		const headerH = 56; // handle + paddings
		const available = vh - sheetTop - headerH - parseInt(bottomOffset);
		contentEl.style.maxHeight = `${available}px`;
	}
	function recalcSnaps() {
		const vh = window.innerHeight;
		const usable = vh - parseInt(topOffset) - parseInt(bottomOffset);

		snaps = {
			low: Math.round(parseInt(topOffset) + usable * 0.65),
			mid: Math.round(parseInt(topOffset) + usable * 0.4),
			high: Math.round(parseInt(topOffset) + usable * 0.1)
		};

		if (sheetTop === 0) sheetTop = snaps.high; // ⚡ arranca en mitad
		applyTop();
		adjustScrollableHeight();
	}

	// drag SOLO desde el handle
	function onPointerDown(e: PointerEvent) {
		if (!sheetEl) return;
		handleEl?.setPointerCapture(e.pointerId);
		startY = e.clientY;
		currentY = sheetTop;
	}
	function onPointerMove(e: PointerEvent) {
		if (!sheetEl || startY === 0) return;
		const dy = e.clientY - startY;
		const next = Math.max(
			parseInt(topOffset),
			Math.min(currentY + dy, window.innerHeight - parseInt(bottomOffset))
		);
		sheetTop = next;
		applyTop();
		adjustScrollableHeight();
	}
	function onPointerUp(e: PointerEvent) {
		startY = 0;
		const dists = [{ v: snaps.low }, { v: snaps.mid }, { v: snaps.high }].sort(
			(a, b) => Math.abs(a.v - sheetTop) - Math.abs(b.v - sheetTop)
		);
		sheetTop = dists[0].v;
		applyTop();
		adjustScrollableHeight();
	}

	function onHandleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			sheetTop = snaps.mid;
			applyTop();
			adjustScrollableHeight();
		}
	}

	function handleResize() {
		recalcSnaps();
	}

	onMount(() => {
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = '';

		window.addEventListener('resize', handleResize);

		// ⚡ recalculamos y ajustamos al cargar
		recalcSnaps();
		adjustScrollableHeight();

		return () => {
			document.body.style.overflow = prevOverflow;
		};
	});

	onDestroy(() => {
		window.removeEventListener('resize', handleResize);
		document.body.style.overflow = '';
	});

	$effect(() => {
		adjustScrollableHeight();
	});

	function onCardKeydown(e: KeyboardEvent, task: Task) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onCardClick(task);
		}
	}
</script>

<!-- ✅ Overlay FIJO que ocupa solo el área útil entre header y bottom nav -->
<div class="fixed inset-x-0 z-40" style={`top:${topOffset}; bottom:${bottomOffset};`}>
	<!-- MAPA arriba (40% del alto útil) -->
	<div class="absolute inset-0 h-full w-full">
		<TaskLocationMap
			{tasks}
			{selectedTask}
			height="100vh"
			onTaskSelected={(event) => {
				scrollToTaskCard(event.task.id);
			}}
		/>
	</div>

	<!-- SHEET encima del mapa -->
	<div bind:this={sheetEl} class="sheet bg-base-300 absolute inset-x-0 bottom-0 z-50">
		<!-- handle (drag area) -->
		<div
			bind:this={handleEl}
			class="relative mx-auto mt-2 flex h-6 w-full bg-base-300 rounded-t-2xl pt-4 pb-1 touch-none items-center justify-center"
			role="button"
			tabindex="0"
			aria-label="Drag task sheet"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onkeydown={onHandleKeydown}
		>
			<!-- un ligero degradado para separar visualmente del mapa -->
			<div class="my-4 mt-2 h-1.5 w-12 rounded-full bg-gray-300 py-1"></div>
		</div>

		<!-- Contenido scrolleable (fondo opaco) -->
		<div bind:this={contentEl} class="bg-base-300 overflow-y-auto px-3 pt-1 pb-3">
			<div class="space-y-3">
				{#if tasks?.length}
					{#each tasks as task}
						<div
							class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg"
							role="button"
							tabindex="0"
							aria-label={$t('dashboard.bids.components.maps.mobile_map_sheet.view_task')}
							onclick={() => onCardClick(task)}
							onkeydown={(e) => onCardKeydown(e, task)}
							data-task-id={task.id}
						>
							<div class="card-body p-4">
								<div class="mb-1 flex items-start justify-between gap-3">
									<div class="card-title line-clamp-2 text-base">
										<TranslatableTask 
											{task} 
											titleClass="card-title text-base line-clamp-2"
											descriptionClass="text-sm text-base-content/80 whitespace-pre-line line-clamp-2"
										/>
									</div>
									<div class="text-right">
										<div class="text-sm font-bold">
											${formatNumberWithTwoDecimals(task.budget.amount)}
										</div>
										<div class="text-base-content/60 text-xs">
											{satsFromUsd(task.budget.amount, btcPrice)}
										</div>
									</div>
								</div>

								<div class="text-base-content/70 mt-2 text-xs">
									{#if task.dropOffLocation?.displayName}
										{task.dropOffLocation.displayName}
									{:else if task.pickupLocation?.displayName}
										{task.pickupLocation.displayName}
									{:else}
										{$t('dashboard.bids.components.maps.mobile_map_sheet.remote')}
									{/if}
								</div>

								<div class="mt-3 flex items-center gap-2">
									<button
										type="button"
										class="btn btn-primary btn-sm flex-1"
										onclick={(e) => onBidClick(task, e)}
									>
										{$t('dashboard.bids.components.maps.mobile_map_sheet.bid_now')}
									</button>
									<a class="btn btn-secondary btn-sm flex-1" href={`/tasks/${task.id}`}
										>{$t('dashboard.bids.components.maps.mobile_map_sheet.view_task')}</a
									>
								</div>
							</div>
						</div>
					{/each}
				{:else}
					<div class="text-base-content/70 p-6 text-center text-sm">{$t('dashboard.bids.components.maps.mobile_map_sheet.no_results')}</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.sheet {
		background: hsl(var(--b1));
		border-top-left-radius: 1rem;
		border-top-right-radius: 1rem;
		transform: translateY(0); /* ⚡ deja que JS controle la posición inicial */
		transition: transform 180ms ease-out;
		will-change: transform;
	}
	:global(#map) {
		width: 100% !important;
		height: 100% !important;
	}
</style>
