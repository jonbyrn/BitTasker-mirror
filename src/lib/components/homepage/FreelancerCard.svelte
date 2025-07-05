<script lang="ts">
	import type { FeaturedFreelancer } from '$lib/types/homepage';

	let { freelancer } = $props<{
		freelancer: FeaturedFreelancer;
	}>();
</script>

<div class="card bg-base-100 text-center shadow-xl transition-transform hover:scale-105">
	<div class="card-body items-center">
		<div class="avatar">
			<div class="w-24 rounded-full ring ring-primary ring-offset-2 ring-offset-base-100">
				<img src={freelancer.avatar} alt="Avatar of {freelancer.name}" />
			</div>
		</div>
		<h3 class="card-title mt-4">{freelancer.name}</h3>
		<p class="text-base-content/70">{freelancer.skills}</p>
		<div class="mt-2 flex items-center gap-2">
			<div class="badge badge-accent font-bold">★ {freelancer.rating.toFixed(1)}</div>
			<span class="text-sm text-base-content/70">({freelancer.reviews} reviews)</span>
		</div>
		<div class="card-actions mt-4">
			<button class="btn btn-outline btn-primary btn-sm">View Profile</button>
		</div>
	</div>
</div>
