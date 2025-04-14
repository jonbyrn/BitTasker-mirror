<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Input from '$lib/components/Input.svelte';

	const { Story } = defineMeta({
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
	});
</script>

<Story
	name="Default"
	args={{ id: 'default-input', label: 'Default Input', placeholder: 'Enter some text...' }}
/>

<Story
	name="With Error"
	args={{
		id: 'error-input',
		label: 'Input with Error',
		placeholder: 'Enter some text...',
		error: 'This field is required'
	}}
/>

<Story
	name="With Autocomplete"
	args={{
		id: 'autocomplete-input',
		label: 'Autocomplete Input',
		placeholder: 'Start typing...',
		autoComplete: 'on',
		options: [
			{ label: 'Option 1', value: '1' },
			{ label: 'Option 2', value: '2' },
			{ label: 'Option 3', value: '3' }
		]
	}}
/>

<Story
	name="As Select"
	args={{
		id: 'select-input',
		label: 'Select Input',
		placeholder: 'Select an option...',
		autoComplete: 'off',
		options: [
			{ label: 'Option 1', value: '1' },
			{ label: 'Option 2', value: '2' },
			{ label: 'Option 3', value: '3' }
		]
	}}
/>

<Story
	name="Number Input"
	args={{
		id: 'number-input',
		label: 'Number Input',
		type: 'number',
		placeholder: 'Enter a number...'
	}}
/>

<Story
	name="Password Input"
	args={{
		id: 'password-input',
		label: 'Password Input',
		type: 'password',
		placeholder: 'Enter password...'
	}}
/>
