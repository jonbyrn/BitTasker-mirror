<script lang="ts">
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';

	let { direction } = $props();
</script>

<div
	class="space-y-6"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<h2 class="text-xl font-semibold">Boost Your Task</h2>
	<p class="text-sm">
		Would you like to boost your task to get more visibility and faster responses?
	</p>

	<!-- <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div class="card bg-base-100 shadow-md hover:shadow-lg transition-all cursor-pointer border border-transparent hover:border-primary">
							<div class="card-body p-4">
								<h3 class="card-title">Standard</h3>
								<p class="text-2xl font-bold">Free</p>
								<div class="divider my-1"></div>
								<ul class="space-y-2">
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										Standard visibility
									</li>
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										Basic search ranking
									</li>
								</ul>
								<div class="card-actions justify-end mt-4">
									<button class="btn btn-outline btn-sm">Select</button>
								</div>
							</div>
						</div>

						<div class="card bg-base-100 shadow-md hover:shadow-lg transition-all cursor-pointer border-2 border-primary">
							<div class="card-body p-4">
								<div class="badge badge-primary mb-2">MOST POPULAR</div>
								<h3 class="card-title">Premium</h3>
								<p class="text-2xl font-bold">$5.99</p>
								<div class="divider my-1"></div>
								<ul class="space-y-2">
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										Featured for 24 hours
									</li>
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										Highlighted in search results
									</li>
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										Priority notifications
									</li>
								</ul>
								<div class="card-actions justify-end mt-4">
									<button class="btn btn-primary btn-sm">Select</button>
								</div>
							</div>
						</div>

						<div class="card bg-base-100 shadow-md hover:shadow-lg transition-all cursor-pointer border border-transparent hover:border-primary">
							<div class="card-body p-4">
								<h3 class="card-title">Ultimate</h3>
								<p class="text-2xl font-bold">$9.99</p>
								<div class="divider my-1"></div>
								<ul class="space-y-2">
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										Featured for 72 hours
									</li>
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										Top search placement
									</li>
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										Instant notifications
									</li>
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										VIP support
									</li>
								</ul>
								<div class="card-actions justify-end mt-4">
									<button class="btn btn-outline btn-sm">Select</button>
								</div>
							</div>
						</div>
					</div> -->

	<div class="alert alert-info mt-4">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			class="h-6 w-6 shrink-0 stroke-current"
			><path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
			></path></svg
		>
		<span> Boosting your task increases your chances of finding the right tasker faster! </span>
	</div>

	<div class="divider">Payment Options</div>

	<!-- <div class="flex flex-wrap gap-3">
						<div class="form-control">
							<label class="cursor-pointer label gap-2">
								<input type="radio" name="payment-option" class="radio radio-primary" checked />
								<span class="label-text">Bitcoin</span>
							</label>
						</div>
						<div class="form-control">
							<label class="cursor-pointer label gap-2">
								<input type="radio" name="payment-option" class="radio radio-primary" />
								<span class="label-text">Lightning</span>
							</label>
						</div>
						<div class="form-control">
							<label class="cursor-pointer label gap-2">
								<input type="radio" name="payment-option" class="radio radio-primary" />
								<span class="label-text">Liquid</span>
							</label>
						</div>
					</div> -->
</div>
