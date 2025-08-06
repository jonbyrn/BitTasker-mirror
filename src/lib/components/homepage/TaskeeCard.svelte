<script lang="ts">
	import type { FeaturedTaskee } from '$lib/types/homepage';
	import { t, locale } from 'svelte-i18n';

	let { taskee } = $props<{
		taskee: FeaturedTaskee;
	}>();
</script>

<div class="card bg-base-100 text-center shadow-xl transition-transform hover:scale-105 p-2">
	<div class="card-body items-center">
		<div class="avatar">
			<div class="w-24 rounded-full ring ring-primary ring-offset-2 ring-offset-base-100">
				<img src={taskee.avatar} alt="Avatar of {taskee.name}" loading="lazy" />
			</div>
		</div>
		<h6 class="card-title mt-4">{taskee.name}</h6>
		<p class="text-base-content/70 h-12 line-clamp-2 overflow-hidden">{taskee.skills}</p>
		<div class="mt-2 flex items-center gap-2">
			<div class="badge badge-accent font-bold">★ {taskee.rating.toFixed(1)}</div>
			<span class="text-sm text-base-content/70">({taskee.reviews} {$t('common.reviews')})</span>
		</div>
		<div class="card-actions mt-4">
			<button class="btn btn-outline btn-primary btn-sm">{$t('common.view_profile')}</button>
		</div>
	</div>
</div>
