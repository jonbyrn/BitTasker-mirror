<script lang="ts">
	import { darkMode } from '$lib/stores/theme.store';
</script>

<div class="container mx-auto px-4 py-12 md:px-8">
	<img
		src={$darkMode
			? '/images/Bittasker-logo-tagline-dark.svg'
			: '/images/Bittasker-logo-tagline-light.svg'}
		alt="BitTasker Logo"
		class="mx-auto mb-8 block w-full max-w-lg"
	/>
	<div class="prose mx-auto max-w-4xl">
		<div class="text-center">
			<h1 class="text-4xl font-bold">Our Tasker Principles</h1>
			<p class="mx-auto mt-4 max-w-2xl text-lg text-base-content/80">
				At BitTasker, great Taskers are the heart of our community. These four principles are the
				foundation for success, helping you build a stellar reputation and earn more.
			</p>
		</div>

		<div class="mt-12 grid gap-8 md:grid-cols-2">
		<!-- Principle 1: Be Professional -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body">
				<h2 class="card-title text-2xl">1. Be Professional</h2>
				<p class="font-semibold">Uphold Quality & Expertise</p>
				<ul class="mt-2 list-inside list-disc space-y-1">
					<li>Take pride in delivering 5-star work.</li>
					<li>Only offer on tasks you have the skills for.</li>
					<li>Price your work fairly and accurately.</li>
					<li>Prioritize safety for yourself and others.</li>
				</ul>
			</div>
		</div>

		<!-- Principle 2: Be Reliable -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body">
				<h2 class="card-title text-2xl">2. Be Reliable</h2>
				<p class="font-semibold">Honor Your Commitments</p>
				<ul class="mt-2 list-inside list-disc space-y-1">
					<li>Show up on time, every time.</li>
					<li>Complete the task as agreed upon.</li>
					<li>Keep cancellations to an absolute minimum.</li>
					<li>Manage the Poster's expectations clearly.</li>
				</ul>
			</div>
		</div>

		<!-- Principle 3: Be Responsive -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body">
				<h2 class="card-title text-2xl">3. Be Responsive</h2>
				<p class="font-semibold">Communicate Clearly & Promptly</p>
				<ul class="mt-2 list-inside list-disc space-y-1">
					<li>Ask questions to clarify task details.</li>
					<li>Personalize your offers to the task.</li>
					<li>Keep the Poster updated on your progress.</li>
					<li>Confirm completion when the work is done.</li>
				</ul>
			</div>
		</div>

		<!-- Principle 4: Be Honest & Trustworthy -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body">
				<h2 class="card-title text-2xl">4. Be Honest & Trustworthy</h2>
				<p class="font-semibold">Build Trust Through Transparency</p>
				<ul class="mt-2 list-inside list-disc space-y-1">
					<li>Be truthful in your profile and offers.</li>
					<li>Keep all payments on the platform for security.</li>
					<li>Treat everyone with respect.</li>
					<li>Follow our Community Guidelines.</li>
				</ul>
			</div>
		</div>
	</div>
	</div>
</div>
