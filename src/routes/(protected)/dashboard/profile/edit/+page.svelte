<script lang="ts">
	import type { NostrEvent } from 'nostr-tools';
	import { closeNostrPool } from '$lib/nostr/profile';
	import { onMount, onDestroy } from 'svelte';
	import PersonalInfo from './_components/PersonalInfo.svelte';
	import LocationService from './_components/LocationService.svelte';
	import Skills from './_components/Skills.svelte';
	import Portfolio from './_components/Portfolio.svelte';
	import VideoIntro from './_components/VideoIntro.svelte';
	import Availability from './_components/Availability.svelte';
	import StandardServices from './_components/StandardServices.svelte';
	import AIAssistant from './_components/AIAssistant.svelte';

	// States
	let user = $state<any>(null);
	let isLoading = $state(true);
	let error = $state('');
	let completedSections = $state({
		personalInfo: false,
		location: false,
		skills: false,
		portfolio: false,
		videoIntro: false,
		availability: false,
		standardServices: false,
		aiAssistant: false
	});

	// Derived state for form completion
	let isFormComplete = $derived(Object.values(completedSections).every((completed) => completed));

	// Load profile data
	onMount(async () => {
		try {
			/* isLoading = true;
			// Load Nostr events
			nostrEvents = await getNostrMetadata();
			console.log({ nostrEvents, length: nostrEvents.length });

			// Load GraphQL data
			const meStore = new MeStore();
			const result = await meStore.fetch();
			const initialUser = result.data?.me;

			// Merge data
			if (initialUser) {
				user = {
					id: initialUser.id,
					name: initialUser.name || initialUser.displayName,
					email: initialUser.email,
					dob: initialUser.dob,
					biddingAllowed: initialUser.biddingAllowed,
					createdAt: initialUser.createdAt,
					isEmailVerified: initialUser.isEmailVerified,
					lastLoginAt: initialUser.lastLoginAt,
					location: initialUser.location,
					mobileNumber: initialUser.mobileNumber,
					onboardingComplete: initialUser.onboardingComplete,
					skills: initialUser.skills,
					status: initialUser.status,
					updatedAt: initialUser.updatedAt,
					userRole: initialUser.userRole,
					username: initialUser.username
				};

				if (initialUser.profilePictureUrl && initialUser.profilePictureId) {
					user.pictures = [
						{
							url: initialUser.profilePictureUrl,
							alt: 'main profile picture',
							type: 'image',
							key: initialUser.profilePictureId
						}
					];
				}

				// Subscribe to profile updates
				cleanup = await subscribeToProfileUpdates((event) => {
					try {
						// Update nostrEvents with the new event
						nostrEvents = [...nostrEvents.filter((e) => e.id !== event.id), event];

						// Re-merge data with the updated nostrEvents
						const mergedProfile = mergeNostrAndGraphQLData(nostrEvents, user);
						user = { ...user, ...mergedProfile };
					} catch (err) {
						console.error('Failed to process profile update:', err);
					}
				});

				// Initial merge
				const mergedProfile = mergeNostrAndGraphQLData(nostrEvents, user);
				user = { ...user, ...mergedProfile };
			} */
		} catch (err) {
			console.error('Error loading profile:', err);
			error = 'Failed to load profile data';
		} finally {
			isLoading = false;
		}
	});

	// Cleanup on component destroy
	onDestroy(() => {
		// if (cleanup) cleanup();
		closeNostrPool();
	});

	// Section completion handlers
	function handleSectionComplete(section: keyof typeof completedSections, completed: boolean) {
		completedSections[section] = completed;
	}

	// Calculate overall progress
	let progress = $derived(
		(Object.values(completedSections).filter(Boolean).length /
			Object.keys(completedSections).length) *
			100
	);
</script>

<div class="mx-auto max-w-5xl p-4">
	<div class="mb-4">
		<h1 class="text-3xl font-bold">Edit Profile</h1>
		<p class="text-base-content/70">Complete your profile to increase visibility and trust</p>

		<!-- Progress Bar -->
		<div class="bg-base-100 mt-4 rounded-xl p-4">
			<div class="mb-1 flex justify-between">
				<span class="text-sm font-medium">Profile Completion</span>
				<span class="text-sm font-medium">{Math.round(progress)}%</span>
			</div>
			<div class="bg-base-200 h-2.5 w-full rounded-full">
				<div class="bg-primary h-2.5 rounded-full" style="width: {progress}%"></div>
			</div>
		</div>
	</div>

	{#if !isLoading}
		<!-- Profile Sections -->
		<div class="space-y-4">
			<!-- Personal Information -->
			<!-- <div class="card bg-base-100 rounded-xl shadow-lg">
				<div class="card-body">
					<h2 class="card-title">Personal Information</h2>
					<PersonalInfo
						onComplete={(completed) => handleSectionComplete('personalInfo', completed)}
					/>
				</div>
			</div> -->

			<!-- Location & Service Area -->
			<!-- <div class="card bg-base-100 shadow-lg">
				<div class="card-body">
					<h2 class="card-title">Location & Service Area</h2>
					<LocationService
						user={$userStore.data?.me}
						onComplete={(completed) => handleSectionComplete('location', completed)}
					/>
				</div>
			</div> -->

			<!-- Skills -->
			<!-- <div class="card bg-base-100 rounded-xl shadow-lg">
				<div class="card-body">
					<h2 class="card-title">Skills & Expertise</h2>
					<Skills onComplete={(completed) => handleSectionComplete('skills', completed)} />
				</div>
			</div> -->

			<!-- Portfolio -->
			<div class="card bg-base-100 rounded-xl shadow-lg">
				<Portfolio onComplete={(completed) => handleSectionComplete('portfolio', completed)} />
			</div>

			<!-- Video Introduction -->
			<div class="card bg-base-100 rounded-xl shadow-lg">
				<div class="card-body">
					<h2 class="card-title">Video Introduction</h2>
					<VideoIntro
						{user}
						onComplete={(completed) => handleSectionComplete('videoIntro', completed)}
					/>
				</div>
			</div>

			<!-- Availability Calendar -->
			<div class="card bg-base-100 rounded-xl shadow-lg">
				<div class="card-body">
					<h2 class="card-title">Availability</h2>
					<Availability
						{user}
						onComplete={(completed) => handleSectionComplete('availability', completed)}
					/>
				</div>
			</div>

			<!-- Standard Services -->
			<div class="card bg-base-100 rounded-xl shadow-lg">
				<div class="card-body">
					<h2 class="card-title">Standard Services</h2>
					<StandardServices
						{user}
						onComplete={(completed) => handleSectionComplete('standardServices', completed)}
					/>
				</div>
			</div>

			<!-- AI Assistant -->
			<div class="card bg-base-100 rounded-xl shadow-lg">
				<div class="card-body">
					<h2 class="card-title">AI Assistant</h2>
					<AIAssistant {user} />
					<!-- onComplete={(completed) => updateSectionCompletion('services', completed)} -->
				</div>
			</div>
		</div>
	{:else}
		<!-- Loading skeletons -->
		<div class="space-y-4">
			<div class="card bg-base-100 animate-pulse rounded-xl shadow-lg">
				<div class="card-body">
					<div class="flex items-center justify-between">
						<div class="bg-base-200 h-6 w-48 rounded-md"></div>
						<div class="bg-base-200 h-6 w-24 rounded-md"></div>
					</div>
					<div class="bg-base-200 h-4 w-full rounded-md"></div>
				</div>
			</div>
		</div>
	{/if}
</div>
