<script lang="ts" context="module">
	export const meta = {
		title: 'Components/Input',
		component: Input,
		tags: ['autodocs'],
		parameters: {
			layout: 'centered'
		},
		argTypes: {
			id: { control: { type: 'text' } },
			label: { control: { type: 'text' } },
			value: { control: { type: 'text' } },
			placeholder: { control: { type: 'text' } },
			error: { control: { type: 'text' } },
			type: {
				control: { type: 'select' },
				options: ['text', 'number', 'email', 'password', 'search', 'tel', 'url']
			},
			autoComplete: {
				control: { type: 'select' },
				options: ['on', 'off']
			},
			options: { control: { type: 'object' } }
		}
	};
</script>

<!-- @storybook/addon-svelte-csf -->
<script lang="ts">
	import Input from '$lib/components/Input.svelte';
	import type { InputProps } from '$lib/types/props';
	import type { Meta, StoryFn } from '@storybook/svelte';
</script>

<!-- Default -->
<div class="w-96">
	<Input id="default-input" label="Default Input" placeholder="Enter some text..." />
</div>

<!-- With Error -->
<div class="w-96">
	<Input
		id="error-input"
		label="Input with Error"
		placeholder="Enter some text..."
		error="This field is required"
	/>
</div>

<!-- With Autocomplete -->
<div class="w-96">
	<Input
		id="autocomplete-input"
		label="Autocomplete Input"
		placeholder="Start typing..."
		autoComplete="on"
		options={[
			{ label: 'Option 1', value: '1' },
			{ label: 'Option 2', value: '2' },
			{ label: 'Option 3', value: '3' }
		]}
	/>
</div>

<!-- As Select -->
<div class="w-96">
	<Input
		id="select-input"
		label="Select Input"
		placeholder="Select an option..."
		autoComplete="off"
		options={[
			{ label: 'Option 1', value: '1' },
			{ label: 'Option 2', value: '2' },
			{ label: 'Option 3', value: '3' }
		]}
	/>
</div>

<!-- Number Input -->
<div class="w-96">
	<Input id="number-input" label="Number Input" type="number" placeholder="Enter a number..." />
</div>

<!-- Password Input -->
<div class="w-96">
	<Input
		id="password-input"
		label="Password Input"
		type="password"
		placeholder="Enter password..."
	/>
</div>
