<script lang="ts">
	import { canDirectMessage } from '$lib/nostr/messaging-policy';

	let {
		pubkey,
		locked = $bindable(true)
	}: {
		pubkey: string;
		locked?: boolean;
	} = $props();

	let checking = $state(true);
	let note = $state('');

	$effect(() => {
		const target = pubkey;
		let cancelled = false;
		locked = true;
		checking = true;
		note = '';
		void canDirectMessage(target).then((result) => {
			if (cancelled) return;
			locked = !result.allowed;
			note = result.note;
			checking = false;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

{#if !checking && note}
	<div class="alert alert-warning text-sm" role="status" data-testid="messaging-lock-note">
		{note}
	</div>
{/if}
