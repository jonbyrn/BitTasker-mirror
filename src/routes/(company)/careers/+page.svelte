<script lang="ts">
	// Obfuscate email address to make it harder for simple bots to scrape
	// This is constructed on the client-side
	const user = 'careers';
	const domain = 'bittasker.com';
	const mailtoHref = `mailto:${user}@${domain}`;
	
	// Job application sections visibility state with Svelte 5 runes
	let expandedSection = $state<string | null>(null);
	
	function toggleSection(section: string): void {
		expandedSection = expandedSection === section ? null : section;
	}
</script>

<div class="container mx-auto px-4 py-8 md:px-8">
	<!-- Hero Section -->
	<div class="hero bg-base-200 py-8">
		<div class="hero-content text-center">
			<div class="max-w-3xl">
				<h1 class="text-5xl font-bold">Join Our Revolution</h1>
				<p class="py-6 text-lg">
					Help us build the decentralized future of work and empower people around the globe
				</p>
			</div>
		</div>
	</div>

	<!-- Our Culture Section -->
	<div class="py-8">
		<div class="mx-auto max-w-3xl text-center">
			<h2 class="text-4xl font-bold">Our Culture</h2>
			<p class="mt-4 text-lg text-base-content/80">
				At BitTasker, we're building more than a platform—we're creating a movement. Our team is unified
				by a shared vision of economic freedom, decentralization, and peer-to-peer exchange without
				intermediaries.
			</p>
		</div>
	</div>

	<!-- Our Values Section -->
	<div class="bg-base-200 py-16">
		<div class="container mx-auto px-4 md:px-8">
			<h2 class="mb-12 text-center text-4xl font-bold">Why Join BitTasker?</h2>
			<div class="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body">
						<h3 class="card-title text-xl">Bitcoin-First</h3>
						<p>
							We pay salaries in Bitcoin and believe in its power to transform the global economy.
						</p>
					</div>
				</div>
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body">
						<h3 class="card-title text-xl">Fully Remote</h3>
						<p>
							Work from anywhere in the world. We believe talent has no borders.
						</p>
					</div>
				</div>
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body">
						<h3 class="card-title text-xl">Innovation-Driven</h3>
						<p>
							We're pioneering the integration of Bitcoin, Lightning Network, and decentralized
							technologies.
						</p>
					</div>
				</div>
				<div class="card bg-base-100 shadow-lg">
					<div class="card-body">
						<h3 class="card-title text-xl">Mission-Focused</h3>
						<p>
							We're committed to building tools that enhance financial sovereignty and economic
							freedom.
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Open Positions -->
	<div class="py-16">
		<div class="mx-auto max-w-4xl">
			<h2 class="mb-8 text-center text-4xl font-bold">Open Positions</h2>

			<!-- Full Stack Developer Position -->
			<div class="mb-6">
				<div class="card border border-base-300 bg-base-100 shadow-lg">
					<div class="card-body">
						<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
							<h3 class="card-title text-2xl">Full Stack Developer</h3>
							<span class="badge badge-primary self-start sm:self-center mt-2 sm:mt-0">Global, Remote</span>
						</div>
						<button
							class="btn btn-ghost w-full justify-between" 
							onclick={() => toggleSection('dev')}
						>
							<span>View Details</span>
							<span class="text-xl">{expandedSection === 'dev' ? '−' : '+'}</span>
						</button>
						
						{#if expandedSection === 'dev'}
							<div class="mt-4 space-y-4">
								<div>
									<h4 class="font-bold">About the Role:</h4>
									<p class="mt-2">
										We're seeking passionate developers to help build the future of decentralized
										work. You'll be working with cutting-edge technologies to create a platform
										that empowers people worldwide to earn, trade, and thrive using Bitcoin.
									</p>
								</div>
								<div>
									<h4 class="font-bold">Key Responsibilities:</h4>
									<ul class="ml-5 list-disc space-y-1">
										<li>Develop and maintain our lean, clean codebase and expand functionality</li>
										<li>Expand and improve Bitcoin capabilities in our app</li>
										<li>Leverage the power of Nostr to enhance users' experience</li>
										<li>Create responsive, mobile-first user interfaces</li>
										<li>Work with cutting-edge AI development tools and practices</li>
									</ul>
								</div>
								<div>
									<h4 class="font-bold">Qualifications:</h4>
									<ul class="ml-5 list-disc space-y-1">
										<li>Experience with modern JavaScript frameworks, especially Svelte/SvelteKit</li>
										<li>Knowledge of TypeScript, Tailwind CSS, and responsive design</li>
										<li>Experience with AI development tools and practices</li>
										<li>Familiarity with the Bitcoin ecosystem and concepts</li>
										<li>Interest in decentralized technologies and privacy-preserving systems</li>
										<li>Strong problem-solving skills and commitment to clean code</li>
									</ul>
								</div>
								<div class="card-actions justify-end mt-4">
									<a href={mailtoHref} class="btn btn-primary">Apply Now</a>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- PR Specialist Position -->
			<div class="mb-6">
				<div class="card border border-base-300 bg-base-100 shadow-lg">
					<div class="card-body">
						<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
							<h3 class="card-title text-2xl">Public Relations Specialist</h3>
							<span class="badge badge-primary self-start sm:self-center mt-2 sm:mt-0">El Salvador & Global, Remote</span>
						</div>
						<button
							class="btn btn-ghost w-full justify-between" 
							onclick={() => toggleSection('pr')}
						>
							<span>View Details</span>
							<span class="text-xl">{expandedSection === 'pr' ? '−' : '+'}</span>
						</button>
						
						{#if expandedSection === 'pr'}
							<div class="mt-4 space-y-4">
								<div>
									<h4 class="font-bold">About the Role:</h4>
									<p class="mt-2">
										We're looking for a strategic PR specialist to help spread BitTasker's message
										globally, with a special focus on El Salvador, the epicenter of the BitTasker circular economy revolution.
										You'll help us tell the story of how we're revolutionizing work through
										decentralization and Bitcoin.
									</p>
								</div>
								<div>
									<h4 class="font-bold">Key Responsibilities:</h4>
									<ul class="ml-5 list-disc space-y-1">
										<li>Develop and execute PR strategies focused on Bitcoin, decentralization, and the future of work</li>
										<li>Build relationships with media outlets in El Salvador and internationally</li>
										<li>Create compelling press releases, stories, and content about BitTasker's mission</li>
										<li>Collaborate with marketing to ensure consistent messaging across all channels</li>
									</ul>
								</div>
								<div>
									<h4 class="font-bold">Qualifications:</h4>
									<ul class="ml-5 list-disc space-y-1">
										<li>Experience in PR, communications, or journalism</li>
										<li>Fluency in Spanish and English required</li>
										<li>Understanding of Bitcoin, cryptocurrency, and decentralized technologies</li>
										<li>Strong writing and storytelling abilities</li>
										<li>Experience with media relations in Latin America preferred</li>
										<li>Existing relationships with relevant media outlets is a plus</li>
									</ul>
								</div>
								<div class="card-actions justify-end mt-4">
									<a href={mailtoHref} class="btn btn-primary">Apply Now</a>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Brand Ambassadors Position -->
			<div class="mb-6">
				<div class="card border border-base-300 bg-base-100 shadow-lg">
					<div class="card-body">
						<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
							<h3 class="card-title text-2xl">Brand Ambassadors</h3>
							<span class="badge badge-primary self-start sm:self-center mt-2 sm:mt-0">El Salvador, Latin America, South America</span>
						</div>
						<button
							class="btn btn-ghost w-full justify-between" 
							onclick={() => toggleSection('ambassador')}
						>
							<span>View Details</span>
							<span class="text-xl">{expandedSection === 'ambassador' ? '−' : '+'}</span>
						</button>
						
						{#if expandedSection === 'ambassador'}
							<div class="mt-4 space-y-4">
								<div>
									<h4 class="font-bold">About the Role:</h4>
									<p class="mt-2">
										Become the face of BitTasker in your local community! We're seeking enthusiastic
										Bitcoin believers to spread the word about our platform throughout Latin America,
										with a special focus on El Salvador. You'll help local professionals and clients
										discover the benefits of our decentralized gig economy platform.
									</p>
								</div>
								<div>
									<h4 class="font-bold">Key Responsibilities:</h4>
									<ul class="ml-5 list-disc space-y-1">
										<li>Organize and attend local events to promote BitTasker</li>
										<li>Build relationships with local professionals and businesses</li>
										<li>Demonstrate the platform and help new users get started</li>
										<li>Create localized content for social media</li>
										<li>Provide feedback on local market needs and opportunities</li>
									</ul>
								</div>
								<div>
									<h4 class="font-bold">Qualifications:</h4>
									<ul class="ml-5 list-disc space-y-1">
										<li>Passion for Bitcoin and decentralized technologies</li>
										<li>Strong local network and community presence</li>
										<li>Excellent communication skills in Spanish (English is a plus)</li>
										<li>Experience in community building, marketing, or sales is preferred</li>
										<li>Entrepreneurial spirit and self-motivation</li>
										<li>Located in El Salvador, Latin America, or South America</li>
									</ul>
								</div>
								<div class="card-actions justify-end mt-4">
									<a href={mailtoHref} class="btn btn-primary">Apply Now</a>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- How to Apply Section -->
	<div class="bg-base-200 py-16">
		<div class="container mx-auto px-4 md:px-8">
			<div class="mx-auto max-w-3xl text-center">
				<h2 class="text-3xl font-bold mb-6">How to Apply</h2>
				<p class="mb-6">
					To apply for any of our open positions, please send your resume, LinkedIn profile, or Git
					repository links to our careers team. We look forward to learning more about you and your
					passion for building the future of decentralized work!
				</p>
				<div class="card-body items-center text-center">
					<a href={mailtoHref} class="btn btn-primary btn-wide mt-4">
						<i class="fa-solid fa-envelope fa-xl"></i>
						Apply via Email
					</a>
				</div>
			</div>
		</div>
	</div>
</div>

