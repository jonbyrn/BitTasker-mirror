<script lang="ts">
	import { Meta, Template, Story } from '@storybook/addon-svelte-csf';
	import Drawer from '../lib/components/Drawer.svelte';
	import { action } from '@storybook/addon-actions';

	const onClose = action('onClose');
</script>

<Meta
	title="Components/Drawer"
	component={Drawer}
	argTypes={{
		isOpen: { control: 'boolean' },
		title: { control: 'text' },
		position: {
			control: { type: 'select', options: ['left', 'right'] }
		},
		width: {
			control: { type: 'select', options: ['sm', 'md', 'lg', 'full'] }
		},
		isScrollable: { control: 'boolean' }
	}}
/>

<!-- Basic Drawer Example -->
<Template let:args>
	<div class="p-8">
		<Drawer {...args} onClose={onClose}>
			<div class="space-y-4">
				<h3 class="font-bold">Drawer Content</h3>
				<p>This is a basic example of using the Drawer component in BitTasker.</p>
				<p>Drawers are useful for secondary content, details views, and multi-step forms.</p>
			</div>
		</Drawer>

		{#if !args.isOpen}
			<div class="alert alert-info">
				<p>Drawer is currently closed. Use the controls to open it.</p>
			</div>
		{/if}
	</div>
</Template>

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

<!-- Left Side Drawer -->
<Template let:args>
	<div class="p-8">
		<Drawer {...args} onClose={onClose}>
			<div class="space-y-4">
				<h3 class="font-bold">Left Side Navigation</h3>
				<ul class="menu bg-base-200 rounded-box">
					<li><a href="#dashboard">Dashboard</a></li>
					<li><a href="#tasks">My Tasks</a></li>
					<li><a href="#bids">My Bids</a></li>
					<li><a href="#settings">Settings</a></li>
					<li><a href="#help">Help Center</a></li>
				</ul>
			</div>
		</Drawer>

		{#if !args.isOpen}
			<div class="alert alert-info">
				<p>Drawer is currently closed. Use the controls to open it.</p>
			</div>
		{/if}
	</div>
</Template>

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

<!-- Drawer with Footer -->
<Template let:args>
	<div class="p-8">
		<Drawer {...args} onClose={onClose}>
			<div class="space-y-4">
				<h3 class="font-bold">Task Details</h3>
				<div class="rounded bg-base-200 p-4">
					<p class="font-semibold">Website Development</p>
					<p class="text-base-content/70">Create a modern e-commerce website with payment integration</p>
				</div>
				
				<h4 class="font-semibold mt-6">Requirements</h4>
				<ul class="list-disc pl-5">
					<li>Responsive design</li>
					<li>Product catalog</li>
					<li>Shopping cart</li>
					<li>Bitcoin payment integration</li>
				</ul>
			</div>
			
			<svelte:fragment slot="footer">
				<div class="flex justify-between w-full">
					<button class="btn btn-ghost" onclick={onClose}>Cancel</button>
					<button class="btn btn-primary" onclick={action('submit-bid')}>Submit Bid</button>
				</div>
			</svelte:fragment>
		</Drawer>

		{#if !args.isOpen}
			<div class="alert alert-info">
				<p>Drawer is currently closed. Use the controls to open it.</p>
			</div>
		{/if}
	</div>
</Template>

<Story
	name="With Footer"
	args={{
		isOpen: true,
		title: 'Task Details',
		position: 'right',
		width: 'md',
		isScrollable: true
	}}
/>

<!-- Full Width Drawer -->
<Template let:args>
	<div class="p-8">
		<Drawer {...args} onClose={onClose}>
			<div class="space-y-6">
				<h3 class="text-xl font-bold">Detailed Report</h3>
				
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
					{#each Array(6) as _, i}
						<div class="card bg-base-200 shadow-sm">
							<div class="card-body">
								<h4 class="card-title">Section {i + 1}</h4>
								<p>This is a detailed report section that demonstrates a full-width drawer with complex layout.</p>
							</div>
						</div>
					{/each}
				</div>
			</div>
			
			<svelte:fragment slot="footer">
				<div class="flex justify-end gap-2">
					<button class="btn btn-ghost" onclick={onClose}>Close</button>
					<button class="btn btn-primary" onclick={action('export')}>Export</button>
					<button class="btn btn-secondary" onclick={action('print')}>Print</button>
				</div>
			</svelte:fragment>
		</Drawer>

		{#if !args.isOpen}
			<div class="alert alert-info">
				<p>Drawer is currently closed. Use the controls to open it.</p>
			</div>
		{/if}
	</div>
</Template>

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

<!-- Scrollable Content Drawer -->
<Template let:args>
	<div class="p-8">
		<Drawer {...args} onClose={onClose}>
			<div class="space-y-4">
				<h3 class="font-bold">Scrollable Content</h3>
				{#each Array(15) as _, i}
					<div class="card bg-base-200 shadow-sm mb-4">
						<div class="card-body">
							<h4 class="card-title">Item {i + 1}</h4>
							<p>This demonstrates the drawer's scrollable content capability.</p>
							<p>The content will scroll while the header and footer (if present) remain fixed.</p>
						</div>
					</div>
				{/each}
			</div>
		</Drawer>

		{#if !args.isOpen}
			<div class="alert alert-info">
				<p>Drawer is currently closed. Use the controls to open it.</p>
			</div>
		{/if}
	</div>
</Template>

<Story
	name="Scrollable Content"
	args={{
		isOpen: true,
		title: 'Long Content Drawer',
		position: 'right',
		width: 'lg',
		isScrollable: true
	}}
/>
