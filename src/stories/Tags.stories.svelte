<script lang="ts">
	import type { ArgTypes } from '@storybook/svelte';
	import type { TagsProps } from '$lib/types/props';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Tags from '$lib/components/Tags.svelte';
	import { fn } from '@storybook/test';

	const { Story } = defineMeta({
		title: 'Components/Tags',
		component: Tags,
		argTypes: {
			selectedTags: {
				description: 'Array of selected tags',
				control: {
					type: 'object'
				}
			},
			placeholder: {
				description: 'Placeholder text when no tags are selected',
				control: {
					type: 'text'
				}
			},
			error: {
				description: 'Error message to display',
				control: {
					type: 'text'
				}
			}
		} satisfies ArgTypes<TagsProps>,
		args: {
			onChange: fn()
		}
	});
</script>

<Story
	name="Empty"
	args={{
		selectedTags: [],
		placeholder: 'Select tags...'
	}}
/>

<Story
	name="With Tags"
	args={{
		selectedTags: ['JavaScript', 'TypeScript', 'Svelte'],
		placeholder: 'Select tags...'
	}}
/>

<Story
	name="With Error"
	args={{
		selectedTags: [],
		error: 'Please select at least one tag'
	}}
/>
