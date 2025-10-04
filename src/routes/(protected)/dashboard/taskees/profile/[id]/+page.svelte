<script lang="ts">
	import { page } from '$app/stores';
	import Avatar from '$lib/components/Avatar.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { fetchComprehensiveProfile } from '$lib/utils/nostr-message';
	import { goto } from '$app/navigation';

	// Obtener el ID de la URL
	let userId = $derived($page.params.id);

	// Estado para los datos del perfil real
	let userProfile = $state<{
		name?: string;
		about?: string;
		picture?: string;
		pictures?: Array<{ url: string; type: string; alt: string; key?: string; isPrimary?: boolean }>;
		website?: string;
		professionalTitle?: string;
		skills?: Array<string | { name: string; level: number; verificationStatus?: string; endorsements?: number; certifications?: any[] }>;
		portfolio?: Array<{ id: string; title: string; description: string; images: any[]; completionDate: string; skills: string[] }>;
		availability?: { timeSlots: any[]; timezone: string; noticeHours: number; maxBookingsPerDay: number; breakBetweenBookings: number };
		reviews?: Array<{ id: string; from: string; rating: number; text: string; date: string }>;
		certifications?: Array<{ name: string; issuer: string; date: string; verified: boolean; fileUrl: string }>;
		createdAt?: string;
	} | null>(null);
	let loadingProfile = $state(true);
	let profileError = $state<string | null>(null);

	// Estado para el modal de mensaje
	let showMessageModal = $state(false);
	let messageText = $state('');
	let sendingMessage = $state(false);
	let messageError = $state('');
	let messageSuccess = $state(false);


	let currentSlide = $state(0);
	let intervalId: number;

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function nextSlide() {
		if (userProfile?.portfolio && userProfile.portfolio.length > 0) {
			currentSlide = (currentSlide + 1) % userProfile.portfolio.length;
		}
	}

	function goToSlide(index: number) {
		currentSlide = index;
	}

	// Función para cargar el perfil del usuario
	async function loadUserProfile() {
		if (!userId) {
			profileError = 'No user ID provided';
			loadingProfile = false;
			return;
		}

		try {
			loadingProfile = true;
			profileError = null;

			// Hacer la petición para obtener el perfil completo
			const profile = await fetchComprehensiveProfile(userId);

			userProfile = profile;
			console.log('Comprehensive profile loaded:', userProfile);
		} catch (error) {
			profileError = error instanceof Error ? error.message : 'Failed to load profile';
		} finally {
			loadingProfile = false;
		}
	}

	onMount(() => {
		// Cargar el perfil del usuario
		loadUserProfile();

		// Auto-advance slides every 3 seconds (only if portfolio exists)
		intervalId = setInterval(() => {
			if (userProfile?.portfolio && userProfile.portfolio.length > 1) {
				nextSlide();
			}
		}, 3000) as unknown as number;
	});

	// Función para abrir el modal de mensaje
	function openMessageModal() {
		showMessageModal = true;
		messageText = '';
		messageError = '';
		messageSuccess = false;
	}

	// Función para cerrar el modal de mensaje
	function closeMessageModal() {
		showMessageModal = false;
		messageText = '';
		messageError = '';
		messageSuccess = false;
		sendingMessage = false;
	}

	// Función para enviar mensaje
	async function sendMessage() {
		if (!messageText.trim() || !userId) {
			messageError = 'Please enter a message';
			return;
		}

		sendingMessage = true;
		messageError = '';

		try {
			// Importar la función de envío de mensajes
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');
			
			// Enviar el mensaje
			await sendDirectMessage(messageText.trim(), userId);
			
			messageSuccess = true;
			messageText = '';
			
			// Cerrar el modal después de 2 segundos
			setTimeout(() => {
				closeMessageModal();
			}, 2000);
			
		} catch (error) {
			console.error('Error sending message:', error);
			messageError = 'Failed to send message. Please try again.';
		} finally {
			sendingMessage = false;
		}
	}

	// Función para navegar directamente al chat
	function goToChat() {
		goto(`/dashboard/messages/to/${userId}`);
	}

	onDestroy(() => {
		if (intervalId) {
			clearInterval(intervalId);
		}
	});
</script>

<div class="bg-base-200 mx-auto max-w-7xl">
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
									<div class="h-20 w-20 rounded-2x shadow-lg">
										<Avatar name={userProfile?.name} picture={userProfile?.picture} size="lg" />
									</div>
								</div>

								<!-- Información del perfil -->
								<div class="flex-1 text-center lg:text-left">
									<div
										class="mb-2 flex flex-col items-center gap-2 lg:flex-row lg:items-center lg:justify-between"
									>
										<h3 class="text-base-content font-bold">
											{userProfile?.name || 'Unknown User'}
										</h3>
									</div>
									{#if userProfile?.professionalTitle}
										<div class="badge badge-primary badge-lg mb-4 px-3 py-1 text-sm">
											{userProfile.professionalTitle}
										</div>
									{/if}

									<!-- Información adicional -->
									<div
										class="text-base-content/70 mb-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start"
									>
										{#if profileError}
											<div class="text-error text-sm">
												⚠️ {profileError}
											</div>
										{:else if userProfile?.createdAt}
											<div class="flex items-center gap-2">
												<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 01-2 2v12a2 2 0 002 2z"
													/>
												</svg>
												<span>Member since {userProfile.createdAt}</span> 
											</div>
										{/if}
										{#if userProfile?.website}
											<a
												href={userProfile.website}
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
									</div>

									<!-- Botones de acción -->
									<!-- <div class="flex flex-wrap justify-center gap-3 lg:justify-start">
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
									</div> -->
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
									<span class="text-primary text-lg font-bold">
										{userProfile?.reviews?.length || 0}
									</span>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 text-sm">Rating</span>
									<div class="flex items-center gap-1">
										{#if userProfile?.reviews && userProfile.reviews.length > 0}
											{@const avgRating = userProfile.reviews.reduce((sum, review) => sum + review.rating, 0) / userProfile.reviews.length}
											<span class="text-lg font-bold">{avgRating.toFixed(1)}</span>
											<svg class="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
												<path
													fill-rule="evenodd"
													d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
													clip-rule="evenodd"
												/>
											</svg>
										{:else}
											<span class="text-base-content/60 text-sm">No ratings yet</span>
										{/if}
									</div>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 text-sm">Skills</span>
									<span class="text-success text-lg font-bold">
										{userProfile?.skills?.length || 0}
									</span>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 text-sm">Portfolio Items</span>
									<span class="text-info text-lg font-bold">
										{userProfile?.portfolio?.length || 0}
									</span>
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
							{userProfile?.about || 'No description available.'}
						</p>
					</div>

					<div class="card-body p-4">
						<p class="mb-2 text-xl font-bold">Skills & Expertise</p>
						<div class="flex flex-wrap gap-2">
							{#if userProfile?.skills && userProfile.skills.length > 0}
								{#each userProfile.skills as skill}
									<div class="border-primary text-primary rounded-full border px-3 py-1 text-sm">
										{typeof skill === 'string' ? skill : skill.name}
									</div>
								{/each}
							{:else}
								<p class="text-base-content/60 text-sm">No skills listed yet.</p>
							{/if}
						</div>
					</div>
				</div>

				<!-- Portfolio Section - Solo si hay proyectos -->
				{#if userProfile?.portfolio && userProfile.portfolio.length > 0}
					<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
						<div class="card-body p-4">
							<p class="mb-4 text-xl font-bold">Portfolio</p>
							<!-- Nuevo diseño de carousel automático -->
							<div class="relative overflow-hidden rounded-2xl">
								<div
									class="flex transition-transform duration-500 ease-in-out"
									style="transform: translateX(-{currentSlide * 100}%)"
								>
									{#each userProfile.portfolio as project}
										<div class="w-full flex-shrink-0">
											<div class="relative">
												{#if project.images && project.images.length > 0}
													{#if typeof project.images[0] === 'string'}
														<img
															src={project.images[0]}
															alt={project.title}
															class="h-64 w-full object-cover"
														/>
													{:else if project.images[0]?.url}
														<img
															src={project.images[0].url}
															alt={project.title}
															class="h-64 w-full object-cover"
														/>
													{:else}
														<div class="bg-base-300 flex h-64 w-full items-center justify-center">
															<span class="text-base-content/60">No image available</span>
														</div>
													{/if}
												{:else}
													<div class="bg-base-300 flex h-64 w-full items-center justify-center">
														<span class="text-base-content/60">No image available</span>
													</div>
												{/if}
												<div
													class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"
												></div>
												<div class="absolute right-4 bottom-4 left-4 text-white">
													<h3 class="mb-2 text-xl font-bold">{project.title}</h3>
													<p class="mb-3 line-clamp-2 text-sm opacity-90">{project.description}</p>
													<div class="flex flex-wrap gap-1">
														{#if project.skills && project.skills.length > 0}
															{#each project.skills as skill}
																<span class="rounded-full bg-white/20 px-2 py-1 text-xs text-white">
																	{skill}
																</span>
															{/each}
														{/if}
													</div>
												</div>
											</div>
										</div>
									{/each}
								</div>

								<!-- Indicadores -->
								<div class="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
									{#each userProfile.portfolio as _, index}
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
				{:else}
					<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
						<div class="card-body p-4">
							<p class="mb-4 text-xl font-bold">Portfolio</p>
							<p class="text-base-content/60 text-sm">No portfolio items available yet.</p>
						</div>
					</div>
				{/if}
			</div>

			<!-- Sidebar - 1 columna -->
			<div class="space-y-6 lg:col-span-1">
				<!-- Availability -->
				<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
					<div class="card-body p-3">
						<p class="mb-2 text-xl font-bold">Availability</p>
						<div class="space-y-2">
							<div class="flex items-center gap-2">
								{#if userProfile?.availability?.timeSlots && userProfile.availability.timeSlots.length > 0}
									<div class="bg-success h-2 w-2 rounded-full"></div>
									<span class="text-xs">Available for new projects</span>
								{:else}
									<div class="bg-warning h-2 w-2 rounded-full"></div>
									<span class="text-xs">Availability not set</span>
								{/if}
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
								<span class="text-xs">
									{#if userProfile?.availability?.noticeHours}
										Responds within {userProfile.availability.noticeHours} hours
									{:else}
										Response time not specified
									{/if}
								</span>
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
								<span class="text-xs">
									{#if userProfile?.createdAt}
										Joined {userProfile.createdAt}
									{:else}
										Member since unknown
									{/if}
								</span>
							</div>
						</div>
					</div>
				</div>

				<!-- Quick Actions -->
				<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
					<div class="card-body p-3">
						<p class="mb-2 text-xl font-bold">Quick Actions</p>
						<div class="space-y-3">
							<button class="btn btn-primary btn-sm w-full" onclick={openMessageModal}>
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
							<button class="btn btn-outline btn-sm w-full" onclick={goToChat}>
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
									/>
								</svg>
								Go to Chat
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Modal de mensaje -->
{#if showMessageModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<!-- Header del modal -->
			<div class="mb-6">
				<div class="mb-2 flex items-center gap-3">
					<div class="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
						<svg class="text-primary h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
							/>
						</svg>
					</div>
					<div>
						<h4 class="text-sm font-semibold">Send Message</h4>
						<p class="text-base-content/60 text-xs">
							To: {userProfile?.name || 'Unknown User'}
						</p>
					</div>
				</div>
			</div>

			<!-- Formulario de mensaje -->
			<form onsubmit={(e) => { e.preventDefault(); sendMessage(); }} class="space-y-4">
				<div>
					<label for="message-text" class="text-base-content mb-2 block text-sm font-medium">
						Message
					</label>
					<textarea
						id="message-text"
						class="textarea textarea-bordered w-full"
						placeholder="Type your message here..."
						bind:value={messageText}
						rows="4"
						disabled={sendingMessage}
					></textarea>
				</div>

				<!-- Mensaje de éxito -->
				{#if messageSuccess}
					<div class="alert alert-success alert-outline py-2">
						<svg class="h-4 w-4 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						<span class="text-sm">Message sent successfully!</span>
					</div>
				{/if}

				<!-- Mensaje de error -->
				{#if messageError}
					<div class="alert alert-error alert-outline py-2">
						<svg class="h-4 w-4 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span class="text-sm">{messageError}</span>
					</div>
				{/if}

				<!-- Botones de acción -->
				<div class="border-base-300 flex gap-3 border-t pt-6">
					<button 
						type="button" 
						class="btn btn-ghost flex-1" 
						onclick={closeMessageModal}
						disabled={sendingMessage}
					>
						<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
						Cancel
					</button>
					<button
						type="submit"
						class="btn btn-primary flex-1"
						disabled={!messageText.trim() || sendingMessage || messageSuccess}
					>
						{#if sendingMessage}
							<span class="loading loading-spinner loading-sm mr-2"></span>
							Sending...
						{:else if messageSuccess}
							<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M5 13l4 4L19 7"
								/>
							</svg>
							Sent!
						{:else}
							<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
								/>
							</svg>
							Send Message
						{/if}
					</button>
				</div>
			</form>
		</div>
		<button class="modal-backdrop" onclick={closeMessageModal}>X</button>
	</div>
{/if}
