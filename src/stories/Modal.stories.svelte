<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Modal from '../lib/components/Modal.svelte';
	import { action } from '@storybook/addon-actions';

	const onClose = action('onClose');

	const { Story } = defineMeta({
		title: 'Components/Modal',
		component: Modal,
		tags: ['autodocs'],
		argTypes: {
			isOpen: { control: 'boolean' },
			title: { control: 'text' },
			size: {
				control: { type: 'select', options: ['sm', 'md', 'lg', 'xl'] }
			},
			isScrollable: { control: 'boolean' }
		}
	});
</script>

<Story
	name="Default Example"
	args={{
		isOpen: true,
		title: 'Modal Example',
		size: 'md',
		isScrollable: false
	}}
>
	<Modal isOpen={true} title="Modal Example" size="md" isScrollable={false} {onClose}>
		<p class="mb-4">This is a basic example of using the Modal component.</p>
	</Modal>
</Story>

<Story
	name="Footer Actions Example"
	args={{
		isOpen: true,
		title: 'Confirm Action',
		size: 'md',
		isScrollable: false
	}}
>
	<Modal isOpen={true} title="Confirm Action" size="md" isScrollable={false} {onClose}>
		<p class="py-4">This modal includes footer buttons for common actions.</p>
		<snippet name="footer">
			<button class="btn btn-ghost" onclick={onClose}>Cancel</button>
			<button class="btn btn-primary" onclick={action('confirm')}>Confirm</button>
		</snippet>
	</Modal>
</Story>

<Story
	name="Scrollable Content Example"
	args={{
		isOpen: true,
		title: 'Long Content',
		size: 'lg',
		isScrollable: true
	}}
>
	<Modal isOpen={true} title="Long Content" size="lg" isScrollable={true} {onClose}>
		<div class="space-y-4">
			{#each Array(8) as _}
				<div class="bg-base-200 rounded p-4">
					<h3 class="font-bold">Scrollable Content</h3>
					<p>This is a paragraph of text that demonstrates scrollable content within the modal.</p>
				</div>
			{/each}
		</div>
		<snippet name="footer">
			<button class="btn btn-ghost" onclick={onClose}>Close</button>
			<button class="btn btn-primary" onclick={action('save')}>Save</button>
		</snippet>
	</Modal>
</Story>

<Story
	name="Extra Large Example"
	args={{
		isOpen: true,
		title: 'Large Modal',
		size: 'xl',
		isScrollable: false
	}}
>
	<Modal isOpen={true} title="Large Modal" size="xl" isScrollable={false} {onClose}>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<div class="bg-base-200 rounded p-4">
				<h3 class="font-bold">Left Column</h3>
				<p>This demonstrates a large modal with a two-column layout on larger screens.</p>
			</div>
			<div class="bg-base-200 rounded p-4">
				<h3 class="font-bold">Right Column</h3>
				<p>The extra large size is useful for more complex interfaces and data display.</p>
			</div>
		</div>
	</Modal>
</Story>
