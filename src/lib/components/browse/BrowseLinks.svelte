<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { isTempStaffEnabled } from '$lib/services/feature-flags';

	let {
		tasks,
		services,
		staff
	}: {
		tasks: string;
		services: string;
		staff: string;
	} = $props();

	const path = $derived(page.url.pathname);
	const staffOn = isTempStaffEnabled();
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
