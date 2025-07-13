<script lang="ts">
	import { darkMode } from '$lib/stores/theme.store';
</script>

<div class="container mx-auto px-4 py-8 md:px-8">
	<!-- Hero Section -->
	<div class="hero bg-base-200 py-8">
		<div class="hero-content text-center flex-col">
			<img
			src={$darkMode
				? '/images/Bittasker-logo-tagline-dark.svg'
				: '/images/Bittasker-logo-tagline-light.svg'}
			alt="BitTasker Logo"
			class="mx-auto mb-8 block w-full max-w-lg"
			/>
			<div class="max-w-3xl">
				<h1 class="text-5xl font-bold">Powering Human Freedom<br />One Task at a Time</h1>
			</div>
		</div>
	</div>

	<!-- Our Mission Section -->
	<div class="prose container mx-auto px-4 py-16 md:px-8">
		<div class="mx-auto max-w-3xl text-center">
			<h2 class="text-4xl font-bold">Our Mission</h2>
			<p class="mt-4 text-lg text-base-content/80">
				BitTasker exists to empower everyday people to earn, trade, and thrive—without borders,
				banks, or barriers. We are building a platform where skills become currency, and Bitcoin
				becomes the bridge between sovereign individuals.
			</p>
		</div>
	</div>

	<!-- Our Beliefs Section -->
	<div class="bg-base-200 py-16">
		<div class="container mx-auto px-4 md:px-8">
			<h2 class="mb-12 text-center text-4xl font-bold">Our Core Beliefs</h2>
			<div class="grid gap-8 md:grid-cols-2">
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body">
						<h3 class="card-title text-2xl">Bitcoin is Liberation</h3>
						<p>
							We embrace Bitcoin as the tool to unlock global earning potential for the
							unbanked, underpaid, and overregulated.
						</p>
					</div>
				</div>
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body">
						<h3 class="card-title text-2xl">Tasks are Dignity</h3>
						<p>
							Every person has value. BitTasker connects hands-on skills with global demand—no
							resumé, no gatekeepers, just proof of value.
						</p>
					</div>
				</div>
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body">
						<h3 class="card-title text-2xl">Decentralization is Key</h3>
						<p>
							Legacy platforms extract value through censorship and excessive fees. We choose a
							better path: peer-to-peer, open, and fair.
						</p>
					</div>
				</div>
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body">
						<h3 class="card-title text-2xl">Sovereignty Starts with Income</h3>
						<p>
							We help people own their time, money, and future by enabling direct,
							censorship-resistant earning.
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Our Platform Section -->
	<div class="container mx-auto px-4 py-16 md:px-8">
		<div class="text-center">
			<h2 class="text-4xl font-bold">Our Platform</h2>
			<p class="mx-auto mt-4 max-w-2xl text-lg text-base-content/80">
				BitTasker is not just a company—it's a mission to decentralize income and make Bitcoin
				useful in everyday life.
			</p>
		</div>
		<div class="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
			<div class="text-center">
				<h3 class="text-xl font-semibold">Decentralized Communication</h3>
				<p class="text-base-content/80">Censorship-resistant messaging via Nostr.</p>
			</div>
			<div class="text-center">
				<h3 class="text-xl font-semibold">Bitcoin Lightning Payments</h3>
				<p class="text-base-content/80">Instant, borderless, and nearly free.</p>
			</div>
			<div class="text-center">
				<h3 class="text-xl font-semibold">Automated Escrow & Reputation</h3>
				<p class="text-base-content/80">Trust without intermediaries.</p>
			</div>
			<div class="text-center">
				<h3 class="text-xl font-semibold">Fiat On-Ramp</h3>
				<p class="text-base-content/80">Mainstream accessibility.</p>
			</div>
			<div class="text-center">
				<h3 class="text-xl font-semibold">Multi-Category Marketplace</h3>
				<p class="text-base-content/80">From tech to trades, pets to plumbing.</p>
			</div>
			<div class="text-center">
				<h3 class="text-xl font-semibold">Built for Global Inclusion</h3>
				<p class="text-base-content/80">No borders, no bias.</p>
			</div>
		</div>
	</div>
</div>