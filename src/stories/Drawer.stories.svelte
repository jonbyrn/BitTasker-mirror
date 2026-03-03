<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Drawer from '../lib/components/Drawer.svelte';
	import { action } from '@storybook/addon-actions';

	const onClose = action('onClose');

	const { Story } = defineMeta({
		title: 'Components/Drawer',
		component: Drawer,
		tags: ['autodocs'],
		argTypes: {
			isOpen: { control: 'boolean' },
			title: { control: 'text' },
			position: {
				control: { type: 'select', options: ['left', 'right'] }
			},
			width: {
				control: { type: 'select', options: ['sm', 'md', 'lg', 'full'] }
			},
			isScrollable: { control: 'boolean' }
		}
	});
</script>

<Story
	name="Right Drawer (Default)"
	args={{
		isOpen: true,
		title: 'Example Drawer',
		position: 'right',
		width: 'md',
		isScrollable: false
	}}
/>

<Story
	name="Left Drawer"
	args={{
		isOpen: true,
		title: 'Menu',
		position: 'left',
		width: 'sm',
		isScrollable: true
	}}
/>

<Story
	name="With Footer"
	args={{
		isOpen: true,
		title: 'Task Details',
		position: 'right',
		width: 'md',
		isScrollable: true
	}}
	let:args
>
	<Drawer {...args} {onClose}>
		<div class="space-y-4">
			<h3 class="font-bold">Task Details</h3>
			<div class="bg-base-200 rounded p-4">
				<p class="font-semibold">Website Development</p>
				<p class="text-base-content/70">
					Create a modern e-commerce website with payment integration
				</p>
			</div>
		</div>
		<snippet name="footer">
			<div class="flex w-full justify-between">
				<button class="btn btn-ghost" onclick={onClose}>Cancel</button>
				<button class="btn btn-primary" onclick={action('submit-bid')}>Submit Bid</button>
			</div>
		</snippet>
	</Drawer>
</Story>

<Story
	name="Full Width"
	args={{
		isOpen: true,
		title: 'Full Report View',
		position: 'right',
		width: 'full',
		isScrollable: true
	}}
/>

<Story
	name="Scrollable Content"
	args={{
		isOpen: true,
		title: 'Long Content Drawer',
		position: 'right',
		width: 'lg',
		isScrollable: true
	}}
	let:args
>
	<Drawer {...args} {onClose}>
		<div class="space-y-4">
			<h3 class="font-bold">Scrollable Content</h3>
			{#each Array.from({ length: 8 }, (_, i) => i) as i (i)}
				<div class="card bg-base-200 mb-4 shadow-sm">
					<div class="card-body">
						<h4 class="card-title">Item {i + 1}</h4>
						<p>This demonstrates the drawer's scrollable content capability.</p>
					</div>
				</div>
			{/each}
		</div>
	</Drawer>
</Story>
