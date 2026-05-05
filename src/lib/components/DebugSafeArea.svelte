<script lang="ts">
	import { onMount } from 'svelte';

	let dockPad = $state('');
	let safeAreaBottom = $state('');
	let navHeightSafe = $state('');
	let platform = $state('');
	let standalone = $state('');
	let expanded = $state(true);

	function refresh() {
		const root = document.documentElement;
		platform = root.getAttribute('data-platform') ?? 'not set';
		standalone = (navigator as unknown as { standalone?: boolean }).standalone ? 'true' : 'false';

		const style = getComputedStyle(root);
		safeAreaBottom = style.getPropertyValue('--safe-area-inset-bottom').trim() || 'not set';
		navHeightSafe = style.getPropertyValue('--bottom-nav-height-safe').trim() || 'not set';

		const dock = document.querySelector('.dock');
		if (dock) {
			dockPad = getComputedStyle(dock).paddingBottom;
		} else {
			dockPad = 'no .dock found';
		}
	}

	onMount(() => {
		refresh();
		const id = setInterval(refresh, 1000);
		return () => clearInterval(id);
	});
</script>

<button
	class="debug-toggle"
	onclick={() => (expanded = !expanded)}
	style="position:fixed;bottom:80px;right:8px;z-index:99999;background:#000;color:#0f0;border:none;padding:4px 8px;font:10px monospace;border-radius:4px;opacity:0.85"
>
	{expanded ? '▼' : '▲'}
</button>

{#if expanded}
	<div
		class="debug-panel"
		style="position:fixed;bottom:0;left:0;right:0;z-index:99998;background:#000;color:#0f0;font:10px/1.4 monospace;padding:8px;opacity:0.85;max-height:40vh;overflow-y:auto"
	>
		<div>data-platform: <b style="color:#ff0">{platform}</b></div>
		<div>navigator.standalone: <b style="color:#ff0">{standalone}</b></div>
		<div>--safe-area-inset-bottom: <b style="color:#ff0">{safeAreaBottom}</b></div>
		<div>--bottom-nav-height-safe: <b style="color:#ff0">{navHeightSafe}</b></div>
		<div>.dock padding-bottom: <b style="color:#ff0">{dockPad}</b></div>
		<div style="margin-top:4px;color:#888">
			app-height: <span>{new Date().toLocaleTimeString()}</span>
		</div>
	</div>
{/if}
