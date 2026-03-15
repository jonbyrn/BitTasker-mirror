<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import { t } from 'svelte-i18n';

	/* Props match ContractActions interface; contract/isInline/compactButtons reserved for future V2 actions. */
	/* eslint-disable @typescript-eslint/no-unused-vars */
	const {
		contract,
		containerClass = 'space-y-3',
		isInline = false,
		compactButtons = false
	} = $props<{
		contract: ContractWithEvents;
		containerClass?: string;
		isInline?: boolean;
		compactButtons?: boolean;
	}>();
	/* eslint-enable @typescript-eslint/no-unused-vars */

	// Minimal V2 actions placeholder until Milestone B (Complete/Accept wired).
	// Prevents showing v1 buttons that would call v2 stubs and throw.
</script>

<div class={containerClass}>
	<p class="text-base-content/70 text-sm">
		{$t('dashboard.contracts.v2_actions_coming_soon')}
	</p>
</div>
