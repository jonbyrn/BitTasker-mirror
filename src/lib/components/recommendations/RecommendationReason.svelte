<!-- 
  RecommendationReason.svelte
  Component that explains why a specific task is recommended to the user
-->
<script lang="ts">
	// Props
	let { type, description } = $props<{
		type:
			| 'skill_match'
			| 'category_preference'
			| 'location_based'
			| 'budget_range'
			| 'client_history';
		description: string;
	}>();

	// Icon mapping based on recommendation type
	const iconMap = {
		skill_match: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />`,
		category_preference: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />`,
		location_based: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />`,
		budget_range: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />`,
		client_history: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />`
	};

	// Display name for recommendation type
	const typeDisplayNames = {
		skill_match: 'Skills Match',
		category_preference: 'Category Preference',
		location_based: 'Location Based',
		budget_range: 'Budget Range',
		client_history: 'Previous Clients'
	};
</script>

<div class="flex items-start gap-2">
	<!-- Icon based on recommendation type -->
	<div class="text-primary flex-shrink-0">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-5 w-5"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			{@html iconMap[type as keyof typeof iconMap]}
		</svg>
	</div>

	<div class="flex-grow">
		<!-- Type display name -->
		<div class="text-primary text-xs font-semibold">
			{typeDisplayNames[type as keyof typeof typeDisplayNames]}
		</div>

		<!-- Description -->
		<div class="text-sm">
			{description}
		</div>
	</div>
</div>
