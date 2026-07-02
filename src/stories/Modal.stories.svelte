<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Modal from '../lib/components/Modal.svelte';
	import { action } from 'storybook/actions';

	const onClose = action('onClose');

	const { Story } = defineMeta({
		title: 'Components/Modal',
		component: Modal,
		tags: ['autodocs'],
		args: {
			title: 'Modal Title',
			isOpen: true
		},
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

<Story name="Default Example">
	{#snippet template(args)}
		<div class="p-8">
			<Modal
				isOpen={args.isOpen}
				title={args.title}
				size={args.size}
				isScrollable={args.isScrollable}
				{onClose}
			>
				<p class="mb-4">This is a basic example of using the Modal component.</p>
				<p>
					Modals are useful for focused interactions and decisions without navigating away from the
					current page.
				</p>
			</Modal>
		</div>
	{/snippet}
</Story>

<Story name="Footer Actions Example">
	{#snippet template(args)}
		<div class="p-8">
			<Modal
				isOpen={args.isOpen}
				title={args.title}
				size={args.size}
				isScrollable={args.isScrollable}
				{onClose}
			>
				<p class="py-4">This modal includes footer buttons for common actions.</p>

				{#snippet footer()}
					<button class="btn btn-ghost" onclick={onClose}>Cancel</button>
					<button class="btn btn-primary" onclick={action('confirm')}>Confirm</button>
				{/snippet}
			</Modal>
		</div>
	{/snippet}
</Story>

<Story name="Scrollable Content Example">
	{#snippet template(args)}
		<div class="p-8">
			<Modal
				isOpen={args.isOpen}
				title={args.title}
				size={args.size}
				isScrollable={args.isScrollable}
				{onClose}
			>
				<div class="space-y-4">
					{#each Array(10) as _, i (i)}
						<div class="bg-base-200 rounded p-4">
							<h3 class="font-bold">Scrollable Content</h3>
							<p>
								This is a paragraph of text that demonstrates scrollable content within the modal.
							</p>
							<p>The modal will scroll when the content exceeds the available height.</p>
						</div>
					{/each}
				</div>

				{#snippet footer()}
					<button class="btn btn-ghost" onclick={onClose}>Close</button>
					<button class="btn btn-primary" onclick={action('save')}>Save</button>
				{/snippet}
			</Modal>
		</div>
	{/snippet}
</Story>

<Story name="Extra Large Example">
	{#snippet template(args)}
		<div class="p-8">
			<Modal
				isOpen={args.isOpen}
				title={args.title}
				size={args.size}
				isScrollable={args.isScrollable}
				{onClose}
			>
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div class="bg-base-200 rounded p-4">
						<h3 class="font-bold">Left Column</h3>
						<p>This demonstrates a large modal with a two-column layout on larger screens.</p>
					</div>
					<div class="bg-base-200 rounded p-4">
						<h3 class="font-bold">Right Column</h3>
						<p>The extra large size is perfect for more complex interfaces and data display.</p>
					</div>
				</div>

				{#snippet footer()}
					<button class="btn btn-ghost" onclick={onClose}>Cancel</button>
					<button class="btn btn-primary" onclick={action('apply')}>Apply Changes</button>
				{/snippet}
			</Modal>
		</div>
	{/snippet}
</Story>
