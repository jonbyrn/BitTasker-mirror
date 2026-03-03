<script>
	let { primary = false, size = 'medium', label = 'Button' } = $props();
</script>

<button
	type="button"
	class={['storybook-button', `storybook-button--${size}`].join(' ')}
	class:storybook-button--primary={primary}
	onclick
>
	{label}
</button>
