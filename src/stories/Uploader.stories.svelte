<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import Uploader from '$lib/components/Uploader.svelte';

	const { Story } = defineMeta({
		title: 'Components/Uploader',
		component: Uploader,
		tags: ['autodocs'],
		parameters: {
			layout: 'centered'
		},
		argTypes: {
			id: {
				control: 'text',
				description: 'Unique identifier for the uploader'
			},
			label: {
				control: 'text',
				description: 'Label text for the upload button'
			},
			maxFiles: {
				control: { type: 'number', min: 1, max: 10 },
				description: 'Maximum number of files allowed'
			},
			maxFileSize: {
				control: { type: 'number', min: 0.1, max: 10, step: 0.1 },
				description: 'Maximum file size in MB'
			},
			allowedTypes: {
				control: 'text',
				description: 'Allowed file types'
			},
			error: {
				control: 'text',
				description: 'Error message to display'
			},
			width: {
				control: 'number',
				description: 'Width of the uploader'
			},
			height: {
				control: 'number',
				description: 'Height of the uploader'
			},
			onChange: { action: 'fileChange' },
			onError: { action: 'error' }
		}
	});
</script>

<Story
	name="Default"
	args={{
		id: 'demo-uploader',
		label: 'Upload images',
		maxFiles: 4,
		maxFileSize: 1,
		allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
		files: [],
		error: ''
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const uploadButton = canvas.getByRole('button', { name: /Upload images/i });
		await expect(uploadButton).toBeInTheDocument();

		const input = canvas.getByTestId('file-input');
		const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
		await userEvent.upload(input, file);
	}}
/>

<Story
	name="With Error"
	args={{
		id: 'demo-uploader',
		label: 'Upload images',
		maxFiles: 4,
		maxFileSize: 1,
		allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
		files: [],
		error: 'Maximum file size exceeded'
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const errorMessage = canvas.getByText('Maximum file size exceeded');
		await expect(errorMessage).toBeInTheDocument();
		await expect(errorMessage).toHaveClass('text-error');
	}}
/>

<Story
	name="Single File"
	args={{
		id: 'demo-uploader',
		label: 'Upload profile picture',
		maxFiles: 1,
		maxFileSize: 1,
		allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
		files: [],
		error: ''
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const uploadButton = canvas.getByRole('button', { name: /Upload profile picture/i });
		await expect(uploadButton).toBeInTheDocument();
	}}
/>

<Story
	name="Custom Dimensions"
	args={{
		id: 'demo-uploader',
		label: 'Upload landscape image',
		maxFiles: 4,
		maxFileSize: 1,
		width: 1024,
		height: 768,
		allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
		files: [],
		error: ''
	}}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const uploadButton = canvas.getByRole('button', { name: /Upload landscape image/i });
		await expect(uploadButton).toBeInTheDocument();
	}}
/>
