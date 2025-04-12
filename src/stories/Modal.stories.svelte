<script lang="ts">
	import { Meta, Template, Story } from '@storybook/addon-svelte-csf';
	import Modal from '../lib/components/Modal.svelte';
	import { action } from '@storybook/addon-actions';

	const onClose = action('onClose');
</script>

<Meta
	title="Components/Modal"
	component={Modal}
	argTypes={{
		isOpen: { control: 'boolean' },
		title: { control: 'text' },
		size: {
			control: { type: 'select', options: ['sm', 'md', 'lg', 'xl'] }
		},
		isScrollable: { control: 'boolean' }
	}}
/>

<!-- Simple Modal -->
<Template let:args>
	<div class="p-8">
		<Modal {...args} onClose={onClose}>
			<p class="mb-4">This is a basic example of using the Modal component.</p>
			<p>Modals are useful for focused interactions and decisions without navigating away from the current page.</p>
		</Modal>

		{#if !args.isOpen}
			<div class="alert alert-info">
				<p>Modal is currently closed. Use the controls to open it.</p>
			</div>
		{/if}
	</div>
</Template>

<Story
	name="Default"
	args={{
		isOpen: true,
		title: 'Example Modal',
		size: 'md',
		isScrollable: false
	}}
/>

<!-- Modal with Footer Actions -->
<Template let:args>
	<div class="p-8">
		<Modal {...args} onClose={onClose}>
			<p class="py-4">This modal includes footer buttons for common actions.</p>
			
			<svelte:fragment slot="footer">
				<button class="btn btn-ghost" onclick={onClose}>Cancel</button>
				<button class="btn btn-primary" onclick={action('confirm')}>Confirm</button>
			</svelte:fragment>
		</Modal>

		{#if !args.isOpen}
			<div class="alert alert-info">
				<p>Modal is currently closed. Use the controls to open it.</p>
			</div>
		{/if}
	</div>
</Template>

<Story
	name="With Footer Actions"
	args={{
		isOpen: true,
		title: 'Confirm Action',
		size: 'sm',
		isScrollable: false
	}}
/>

<!-- Scrollable Content Modal -->
<Template let:args>
	<div class="p-8">
		<Modal {...args} onClose={onClose}>
			<div class="space-y-4">
				{#each Array(10) as _}
					<div class="rounded bg-base-200 p-4">
						<h3 class="font-bold">Scrollable Content</h3>
						<p>This is a paragraph of text that demonstrates scrollable content within the modal.</p>
						<p>The modal will scroll when the content exceeds the available height.</p>
					</div>
				{/each}
			</div>
			
			<svelte:fragment slot="footer">
				<button class="btn btn-ghost" onclick={onClose}>Close</button>
				<button class="btn btn-primary" onclick={action('save')}>Save</button>
			</svelte:fragment>
		</Modal>

		{#if !args.isOpen}
			<div class="alert alert-info">
				<p>Modal is currently closed. Use the controls to open it.</p>
			</div>
		{/if}
	</div>
</Template>

<Story
	name="Scrollable Content"
	args={{
		isOpen: true,
		title: 'Long Content Modal',
		size: 'lg',
		isScrollable: true
	}}
/>

<!-- Extra Large Modal -->
<Template let:args>
	<div class="p-8">
		<Modal {...args} onClose={onClose}>
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div class="rounded bg-base-200 p-4">
					<h3 class="font-bold">Left Column</h3>
					<p>This demonstrates a large modal with a two-column layout on larger screens.</p>
				</div>
				<div class="rounded bg-base-200 p-4">
					<h3 class="font-bold">Right Column</h3>
					<p>The extra large size is perfect for more complex interfaces and data display.</p>
				</div>
			</div>
			
			<svelte:fragment slot="footer">
				<button class="btn btn-ghost" onclick={onClose}>Cancel</button>
				<button class="btn btn-primary" onclick={action('apply')}>Apply Changes</button>
			</svelte:fragment>
		</Modal>

		{#if !args.isOpen}
			<div class="alert alert-info">
				<p>Modal is currently closed. Use the controls to open it.</p>
			</div>
		{/if}
	</div>
</Template>

<Story
	name="Extra Large"
	args={{
		isOpen: true,
		title: 'Large Modal Example',
		size: 'xl',
		isScrollable: true
	}}
/>
