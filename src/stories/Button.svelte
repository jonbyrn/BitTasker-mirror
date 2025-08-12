<script>
	import { createEventDispatcher } from 'svelte';

	let { primary = false, size = 'medium', label = 'Button' } = $props();

	const dispatch = createEventDispatcher();

	function handleClick() {
		dispatch('click');
	}
</script>

<button
	type="button"
	class={['storybook-button', `storybook-button--${size}`].join(' ')}
	class:storybook-button--primary={primary}
	onclick={handleClick}
>
	{label}
</button>
