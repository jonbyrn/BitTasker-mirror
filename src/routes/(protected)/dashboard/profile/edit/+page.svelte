<script lang="ts">
	import type { NostrEvent } from 'nostr-tools';
	import { MeStore } from '$houdini';
	import PersonalInfo from './_components/PersonalInfo.svelte';
	import LocationService from './_components/LocationService.svelte';
	import Skills from './_components/Skills.svelte';
	import Portfolio from './_components/Portfolio.svelte';
	import VideoIntro from './_components/VideoIntro.svelte';
	import Availability from './_components/Availability.svelte';
	import StandardServices from './_components/StandardServices.svelte';
	import AIAssistant from './_components/AIAssistant.svelte';
	import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
	import { fetchProfileMetadata, publishEvent } from '$lib/utils/nostr';
	import { onMount } from 'svelte';
	import { appStore } from '$lib/stores/app.store';

	// const userStore = new MeStore();
	let user = $state<any>(null);

	onMount(async () => {
		const profile = await fetchProfileMetadata(
			$appStore.biometricData?.username ?? '',
			PUBLIC_NOSTR_RELAY_URL
		);
		console.log('profile', profile);
	});

	// State for tracking section completion
	let completedSections = $state({
		personalInfo: false,
		location: false,
		skills: false,
		portfolio: false,
		video: false,
		availability: false,
		services: false
	});

	// Function to update section completion
	function updateSectionCompletion(section: keyof typeof completedSections, completed: boolean) {
		completedSections[section] = completed;
	}

	// Calculate overall progress
	let progress = $derived(
		(Object.values(completedSections).filter(Boolean).length /
			Object.keys(completedSections).length) *
			100
	);

	// Function to publish events to your relay
	async function handlePublishToRelay(event: NostrEvent): Promise<void> {
		try {
			await publishEvent(event, PUBLIC_NOSTR_RELAY_URL);
		} catch (error) {
			console.error('Failed to publish event:', error);
			throw error;
		}
	}
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

	<!-- Profile Sections -->
	<div class="space-y-4">
		<!-- Personal Information -->
		<div class="card bg-base-100 rounded-xl shadow-lg">
			<div class="card-body">
				<h2 class="card-title">Personal Information</h2>
				<PersonalInfo
					{user}
					onComplete={(completed) => updateSectionCompletion('personalInfo', completed)}
				/>
			</div>
		</div>

		<!-- Location & Service Area -->
		<!-- <div class="card bg-base-100 shadow-lg">
      <div class="card-body">
        <h2 class="card-title">Location & Service Area</h2>
        <LocationService 
          user={$userStore.data?.me}
          onComplete={(completed) => updateSectionCompletion('location', completed)}
        />
      </div>
    </div> -->

		<!-- Skills -->
		<div class="card bg-base-100 rounded-xl shadow-lg">
			<div class="card-body">
				<h2 class="card-title">Skills & Expertise</h2>
				<Skills {user} onComplete={(completed) => updateSectionCompletion('skills', completed)} />
			</div>
		</div>

		<!-- Portfolio -->
		<div class="card bg-base-100 rounded-xl shadow-lg">
			<div class="card-body">
				<h2 class="card-title">Portfolio</h2>
				<Portfolio
					{user}
					onComplete={(completed) => updateSectionCompletion('portfolio', completed)}
				/>
			</div>
		</div>

		<!-- Video Introduction -->
		<div class="card bg-base-100 rounded-xl shadow-lg">
			<div class="card-body">
				<h2 class="card-title">Video Introduction</h2>
				<VideoIntro
					{user}
					onComplete={(completed) => updateSectionCompletion('video', completed)}
				/>
			</div>
		</div>

		<!-- Availability Calendar -->
		<div class="card bg-base-100 rounded-xl shadow-lg">
			<div class="card-body">
				<h2 class="card-title">Availability</h2>
				<Availability
					{user}
					onComplete={(completed) => updateSectionCompletion('availability', completed)}
				/>
			</div>
		</div>

		<!-- Standard Services -->
		<div class="card bg-base-100 rounded-xl shadow-lg">
			<div class="card-body">
				<h2 class="card-title">Standard Services</h2>
				<StandardServices
					{user}
					onComplete={(completed) => updateSectionCompletion('services', completed)}
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
</div>
