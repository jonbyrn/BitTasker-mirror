<script lang="ts">
	import { page } from '$app/stores';
	import Avatar from '$lib/components/Avatar.svelte';
	import { onMount, onDestroy } from 'svelte';

	// Obtener el ID de la URL
	let userId = $derived($page.params.id);

	// Datos de ejemplo para el diseño
	const mockProfile = {
		name: 'Sarah Johnson',
		professionalTitle: 'Senior UI/UX Designer',
		about:
			'Passionate designer with 8+ years of experience creating beautiful and functional user interfaces. I specialize in mobile app design, web design, and user experience research. I love working with startups and established companies to bring their vision to life.',
		website: 'https://sarahjohnson.design',
		location: 'San Francisco, CA',
		picture: '',
		rating: 4.8,
		tasksCompleted: 127,
		responseRate: 98,
		onTimeRate: 95,
		joinedDate: '2022-03-15'
	};

	const mockSkills = [
		{ name: 'UI/UX Design', level: 5 },
		{ name: 'Figma', level: 5 },
		{ name: 'Adobe Creative Suite', level: 4 },
		{ name: 'Prototyping', level: 5 },
		{ name: 'User Research', level: 4 },
		{ name: 'HTML/CSS', level: 3 },
		{ name: 'JavaScript', level: 2 },
		{ name: 'React', level: 2 }
	];

	const mockPortfolio = [
		{
			title: 'E-commerce Mobile App',
			description:
				'Complete redesign of a mobile shopping app resulting in 40% increase in user engagement and 25% boost in conversion rates.',
			image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=300&fit=crop',
			tags: ['Mobile Design', 'E-commerce', 'Figma']
		},
		{
			title: 'SaaS Dashboard Redesign',
			description:
				'Modernized the user interface for a B2B analytics platform, improving user workflow efficiency by 60%.',
			image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop',
			tags: ['Dashboard', 'SaaS', 'Analytics']
		},
		{
			title: 'Brand Identity System',
			description:
				'Created comprehensive brand guidelines and visual identity for a fintech startup, including logo, color palette, and typography.',
			image: 'https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=400&h=300&fit=crop',
			tags: ['Branding', 'Logo Design', 'Identity']
		}
	];

	let currentSlide = $state(0);
	let intervalId: number;

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function nextSlide() {
		currentSlide = (currentSlide + 1) % mockPortfolio.length;
	}

	function goToSlide(index: number) {
		currentSlide = index;
	}

	onMount(() => {
		// Auto-advance slides every 3 seconds
		intervalId = setInterval(nextSlide, 3000) as unknown as number;
	});

	onDestroy(() => {
		if (intervalId) {
			clearInterval(intervalId);
		}
	});
</script>

<div class="bg-base-200 min-h-screen">
	<!-- Hero Section -->
	<div class="py-6">
		<div class="mx-auto px-4 sm:px-6 lg:px-8">
			<!-- Grid de 4 columnas en desktop -->
			<div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-4">
				<!-- Columna 1-3: Información del perfil -->
				<div class="lg:col-span-3">
					<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
						<div class="card-body p-4">
							<div class="flex flex-col items-center gap-6 lg:flex-row lg:items-start">
								<!-- Avatar -->
								<div class="flex-shrink-0">
									<div class="h-20 w-20 rounded-2xl p-1 shadow-lg">
										<Avatar name={mockProfile.name} picture={mockProfile.picture} size="lg" />
									</div>
								</div>

								<!-- Información del perfil -->
								<div class="flex-1 text-center lg:text-left">
									<div
										class="mb-2 flex flex-col items-center gap-2 lg:flex-row lg:items-center lg:justify-between"
									>
										<h3 class="text-base-content font-bold">{mockProfile.name}</h3>
									</div>
									<div class="badge badge-primary badge-lg mb-4 px-3 py-1 text-sm">
										{mockProfile.professionalTitle}
									</div>

									<!-- Información adicional -->
									<div
										class="text-base-content/70 mb-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start"
									>
										{#if mockProfile.website}
											<a
												href={mockProfile.website}
												target="_blank"
												rel="noopener noreferrer"
												class="hover:text-primary flex items-center gap-2 transition-colors"
											>
												<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
													/>
												</svg>
												Website
											</a>
										{/if}
										{#if mockProfile.location}
											<div class="flex items-center gap-2">
												<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
													/>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
													/>
												</svg>
												{mockProfile.location}
											</div>
										{/if}
									</div>

									<!-- Botones de acción -->
									<div class="flex flex-wrap justify-center gap-3 lg:justify-start">
										<button class="btn btn-primary btn-sm">
											<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
												/>
											</svg>
											Contact
										</button>
										<button class="btn btn-outline btn-sm">
											<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
												/>
											</svg>
											Download CV
										</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Columna 4: Performance Stats -->
				<div class="lg:col-span-1">
					<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
						<div class="card-body p-3">
							<p class="mb-2 text-xl font-bold">Performance Stats</p>
							<div class="space-y-1">
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 text-sm">Tasks Completed</span>
									<span class="text-primary text-lg font-bold">{mockProfile.tasksCompleted}</span>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 text-sm">Rating</span>
									<div class="flex items-center gap-1">
										<span class="text-lg font-bold">{mockProfile.rating}</span>
										<svg class="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
											<path
												fill-rule="evenodd"
												d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
												clip-rule="evenodd"
											/>
										</svg>
									</div>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 text-sm">Response Rate</span>
									<span class="text-success text-lg font-bold">{mockProfile.responseRate}%</span>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 text-sm">On-Time Rate</span>
									<span class="text-info text-lg font-bold">{mockProfile.onTimeRate}%</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="mx-auto px-4 sm:px-6 lg:px-8">
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
			<!-- Main Content - 3 columnas -->
			<div class="space-y-6 lg:col-span-3">
				<!-- Skills Section -->
				<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
					<div class="card-body p-4">
						<p class="mb-2 text-xl font-bold">About</p>
						<p class="text-base-content/80 line-clamp-2 text-sm leading-relaxed">
							{mockProfile.about}
						</p>
					</div>

					<div class="card-body p-4">
						<p class="mb-2 text-xl font-bold">Skills & Expertise</p>
						<div class="flex flex-wrap gap-2">
							{#each mockSkills as skill}
								<div class="border-primary text-primary rounded-full border px-3 py-1 text-sm">
									{skill.name}
								</div>
							{/each}
						</div>
					</div>
				</div>

				<!-- Portfolio Section - Solo si hay proyectos -->
				{#if mockPortfolio && mockPortfolio.length > 0}
					<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
						<div class="card-body p-4">
							<p class="mb-4 text-xl font-bold">Portfolio</p>
							<!-- Nuevo diseño de carousel automático -->
							<div class="relative overflow-hidden rounded-2xl">
								<div
									class="flex transition-transform duration-500 ease-in-out"
									style="transform: translateX(-{currentSlide * 100}%)"
								>
									{#each mockPortfolio as project}
										<div class="w-full flex-shrink-0">
											<div class="relative">
												<img
													src={project.image}
													alt={project.title}
													class="h-64 w-full object-cover"
												/>
												<div
													class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"
												></div>
												<div class="absolute right-4 bottom-4 left-4 text-white">
													<h3 class="mb-2 text-xl font-bold">{project.title}</h3>
													<p class="mb-3 line-clamp-2 text-sm opacity-90">{project.description}</p>
													<div class="flex flex-wrap gap-1">
														{#each project.tags as tag}
															<span class="rounded-full bg-white/20 px-2 py-1 text-xs text-white">
																{tag}
															</span>
														{/each}
													</div>
												</div>
											</div>
										</div>
									{/each}
								</div>

								<!-- Indicadores -->
								<div class="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
									{#each mockPortfolio as _, index}
										<button
											onclick={() => goToSlide(index)}
											class="h-4 w-4 cursor-pointer rounded-full transition-all duration-300 {currentSlide ===
											index
												? 'bg-white'
												: 'bg-white/50'}"
										>
											{' '}
										</button>
									{/each}
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Sidebar - 1 columna -->
			<div class="space-y-6 lg:col-span-1">
				<!-- Quick Actions -->
				<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
					<div class="card-body p-3">
						<p class="mb-2 text-xl font-bold">Quick Actions</p>
						<div class="space-y-2">
							<button class="btn btn-primary btn-sm w-full">
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
									/>
								</svg>
								Send Message
							</button>
							<button class="btn btn-outline btn-sm w-full">
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								Request Quote
							</button>
						</div>
					</div>
				</div>

				<!-- Availability -->
				<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
					<div class="card-body p-3">
						<p class="mb-2 text-xl font-bold">Availability</p>
						<div class="space-y-2">
							<div class="flex items-center gap-2">
								<div class="bg-success h-2 w-2 rounded-full"></div>
								<span class="text-xs">Available for new projects</span>
							</div>
							<div class="flex items-center gap-2">
								<svg
									class="text-base-content/60 h-3 w-3"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<span class="text-xs">Usually responds within 2 hours</span>
							</div>
							<div class="flex items-center gap-2">
								<svg
									class="text-base-content/60 h-3 w-3"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
									/>
								</svg>
								<span class="text-xs">Joined {formatDate(mockProfile.joinedDate)}</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
