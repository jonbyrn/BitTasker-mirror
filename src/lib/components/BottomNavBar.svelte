<script lang="ts">
	import 'iconify-icon';

	const sections = [
		{ id: '', label: 'My Tasks', icon: 'mdi:home' },
		{ id: 'create-task', label: 'Create', icon: 'ic:baseline-create' },
		{ id: 'find-tasks', label: 'Find', icon: 'mdi:magnify' },
		{ id: 'wallet', label: 'Wallet', icon: 'mdi:wallet' },
		{ id: 'profile', label: 'Profile', icon: 'mdi:account' }
	];
</script>

<div class="dock">
	{#each sections as section}
		<a href={`/dashboard/${section.id}`}>
			<iconify-icon icon={section.icon}></iconify-icon>
			<span class="dock-label">{section.label}</span>
		</a>
	{/each}
</div>
