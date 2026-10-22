<script lang="ts">
	import { resolve } from '$app/paths';
	import { t } from 'svelte-i18n';
	import IconEye from '~icons/mdi/eye';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { isRemotePlace } from '$lib/browse/visible-listings';

	let {
		id,
		title,
		role,
		location,
		rate,
		when,
		poster,
		btcPrice = 0,
		taskLink = false,
		remoteLabel = 'Remote',
		viewLabel = ''
	} = $props<{
		id: string;
		title: string;
		role: string;
		location: string;
		/** Hourly USD rate as published. Display only. */
		rate: number;
		when: string;
		poster: string;
		btcPrice?: number;
		taskLink?: boolean;
		remoteLabel?: string;
		viewLabel?: string;
	}>();

	const remote = $derived(isRemotePlace(location));
	const place = $derived(remote ? remoteLabel : location);
	const href = $derived(
		taskLink
			? resolve('/(app)/tasks/[taskId]', { taskId: id })
			: resolve('/(app)/shifts/[id]', { id })
	);
	const view = $derived(viewLabel || $t('find_tasks.view_task'));
	const shownView = $derived(!view || view === 'find_tasks.view_task' ? 'View' : view);
	const rateText = $derived(Number.isFinite(rate) ? `$${rate.toFixed(2)}/hr` : '');
	const sats = $derived(Number.isFinite(rate) ? satsFromUsd(rate, btcPrice) : '');
</script>

<article
	class="card bt-card bg-base-100 w-full overflow-hidden rounded-xl shadow-md"
	data-shift-id={id}
>
	<div class="card-body flex min-w-0 flex-col gap-2 p-4">
		<a {href} class="card-title line-clamp-2 text-lg font-semibold" data-testid="browse-result"
			>{title}</a
		>
		{#if role}
			<div>
				<span class="badge badge-sm badge-info badge-outline">{role}</span>
			</div>
		{/if}
		<div class="flex flex-wrap items-start justify-between gap-2">
			<p class="text-base-content/80 text-sm">{when}</p>
			<div class="text-right">
				<p class="text-base leading-tight font-bold">{rateText}</p>
				{#if sats}
					<p class="text-base-content/60 text-sm">{sats}</p>
				{/if}
			</div>
		</div>
		<p class="text-sm font-medium">{place}</p>
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<UserInfoDisplay size="md" pubkey={poster} />
			<a class="btn btn-secondary btn-sm" {href} data-testid="shift-view">
				<IconEye class="h-4 w-4" />
				{shownView}
			</a>
		</div>
	</div>
</article>
