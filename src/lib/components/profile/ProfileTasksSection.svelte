<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t, locale } from 'svelte-i18n';
	import { findProfileTasksByAuthor } from '$lib/nostr/findProfileTasks';
	import { taskTranslationService } from '$lib/services/task-translation.service';
	import FeaturedHomepageCardShell from '$lib/components/homepage/FeaturedHomepageCardShell.svelte';

	const INITIAL_LIMIT = 6;

	let {
		pubkey,
		isActive = false,
		id = 'tasks'
	}: {
		pubkey: string;
		isActive?: boolean;
		id?: string;
	} = $props();

	let tasks = $state<Task[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let hasLoaded = $state(false);
	let showAll = $state(false);

	const displayedTasks = $derived(showAll ? tasks : tasks.slice(0, INITIAL_LIMIT));
	const hasMore = $derived(tasks.length > INITIAL_LIMIT);

	async function fetchTasks() {
		if (!pubkey) return;
		isLoading = true;
		error = null;
		try {
			const result = await findProfileTasksByAuthor(pubkey, 50);
			tasks = result;
			hasLoaded = true;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		if (isActive && !hasLoaded && !isLoading && pubkey) {
			fetchTasks();
		}
	});

	function getTaskTitle(task: Task): string {
		try {
			const translation = taskTranslationService.getStoredTranslation(task, $locale || 'en');
			if (translation?.translatedTitle) return translation.translatedTitle;
		} catch (_err) {
			/* intentionally empty */
		}
		return task.title || '';
	}

	function getTaskDescription(task: Task): string {
		try {
			const translation = taskTranslationService.getStoredTranslation(task, $locale || 'en');
			if (translation?.translatedDescription) return translation.translatedDescription;
		} catch (_err) {
			/* intentionally empty */
		}
		return task.description || '';
	}

	function getTaskHref(task: Task): string {
		return `/tasks/${task.id}`;
	}

	function getTaskBudget(task: Task): string {
		try {
			const amount = task.budget?.amount;
			const currency = task.budget?.currency || 'USD';
			if (typeof amount === 'number' && amount > 0) {
				return new Intl.NumberFormat($locale || 'en', { style: 'currency', currency }).format(
					amount
				);
			}
		} catch (_err) {
			/* intentionally empty */
		}
		return '';
	}
</script>

<section
	{id}
	class="mb-8 scroll-mt-20"
	data-testid="profile-tasks-section"
	aria-labelledby="{id}-heading"
>
	<div class="mb-4">
		<h2 id="{id}-heading" class="text-xl font-bold">{$t('profile.tasks.title')}</h2>
	</div>

	{#if isLoading}
		<div
			class="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2"
			role="status"
			aria-busy="true"
			aria-label={$t('common.loading')}
		>
			{#each Array.from({ length: 3 }) as _, idx (idx)}
				<div class="skeleton h-72 w-[280px] flex-shrink-0 snap-start rounded-2xl"></div>
			{/each}
		</div>
	{:else if error}
		<div class="alert alert-error" role="alert">
			<span>{error}</span>
			<button
				class="btn btn-ghost btn-sm"
				onclick={fetchTasks}
				aria-label={$t('common.buttons.retry')}
			>
				{$t('common.buttons.retry')}
			</button>
		</div>
	{:else if hasLoaded && tasks.length === 0}
		<div class="text-base-content/60 py-8 text-center">
			<p>{$t('profile.tasks.empty')}</p>
		</div>
	{:else if hasLoaded}
		<div
			class="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2"
			aria-live="polite"
		>
			{#each displayedTasks as task (task.id)}
				<div class="max-w-[320px] min-w-[280px] flex-shrink-0 snap-start">
					<FeaturedHomepageCardShell
						href={getTaskHref(task)}
						title={getTaskTitle(task)}
						description={getTaskDescription(task)}
						price={getTaskBudget(task)}
						priceLabel={$t('profile.tasks.budget')}
						ctaLabel={$t('profile.tasks.view_task')}
						testId="profile-task-card"
						showLocationIcon={false}
					/>
				</div>
			{/each}
		</div>

		{#if hasMore}
			<div class="mt-4 flex flex-col items-center gap-2">
				{#if !showAll}
					<button class="btn btn-ghost btn-sm" onclick={() => (showAll = true)}>
						{$t('common.show_more', { values: { count: tasks.length - INITIAL_LIMIT } })}
					</button>
				{/if}
				<a href="/tasks" class="btn btn-outline btn-sm">
					{$t('profile.tasks.browse_all')}
				</a>
			</div>
		{/if}
	{/if}
</section>
