<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { isMarketEnabled, isTempStaffEnabled } from '$lib/services/feature-flags';

	let {
		tasks,
		services,
		staff,
		goods
	}: {
		tasks: string;
		services: string;
		staff: string;
		goods: string;
	} = $props();

	const path = $derived(page.url.pathname);
	const staffOn = isTempStaffEnabled();
	const goodsOn = isMarketEnabled();
</script>

<li>
	<a
		href={resolve('/(app)/browse/tasks')}
		class="btn btn-ghost"
		class:btn-active={path.startsWith('/browse/tasks')}
		data-testid="nav-browse-tasks"
	>
		{tasks}
	</a>
</li>
<li>
	<a
		href={resolve('/(app)/browse/services')}
		class="btn btn-ghost"
		class:btn-active={path.startsWith('/browse/services')}
		data-testid="nav-browse-services"
	>
		{services}
	</a>
</li>
{#if staffOn}
	<li>
		<a
			href={resolve('/(app)/browse/staff')}
			class="btn btn-ghost"
			class:btn-active={path.startsWith('/browse/staff')}
			data-testid="nav-browse-staff"
		>
			{staff}
		</a>
	</li>
{/if}
{#if goodsOn}
	<li>
		<a
			href={resolve('/(app)/browse/goods')}
			class="btn btn-ghost"
			class:btn-active={path.startsWith('/browse/goods')}
			data-testid="nav-buy-sell"
		>
			{goods}
		</a>
	</li>
{/if}
