import type { Meta, StoryObj } from '@storybook/svelte';
import BidCreationForm from '$lib/components/bidding/BidCreationForm.svelte';

const meta = {
	title: 'Bidding/BidCreationForm',
	component: BidCreationForm,
	tags: ['autodocs'],
	argTypes: {
		onSubmit: { action: 'submit' },
		onCancel: { action: 'cancel' }
	}
} satisfies Meta<BidCreationForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		taskId: 'task-123'
	}
};

export const WithValidationErrors: Story = {
	args: {
		taskId: 'task-123'
	},
	play: async ({ canvasElement }) => {
		// In a real implementation, we would use testing-library to
		// simulate user interactions and trigger validation errors
		// This is just a placeholder for the structure
	}
};
