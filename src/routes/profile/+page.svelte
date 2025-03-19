<script lang="ts">
	import { onMount } from 'svelte';
	import { getCredentials } from '$lib/utils/helpers/biometrics';
	import { NativeBiometric } from 'capacitor-native-biometric';

	let user = $state({});

	onMount(async () => {
		const result = await NativeBiometric.isAvailable();
		if (result.isAvailable) user = await getCredentials();
	});
</script>

<div class="min-h-screen">
	<div class="flex flex-col items-center justify-center gap-4">
		<div class="avatar avatar-placeholder mx-auto">
			<div class="bg-neutral text-neutral-content w-32 rounded-full">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="size-20"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
					/>
				</svg>
			</div>
		</div>
		<p class="bg-neutral rounded-full px-4 py-1">{user?.username}</p>
	</div>
</div>
