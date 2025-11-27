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
		taskId: 'task-123',
		taskTitle: 'Install solar panels',
		taskDescription: 'Need an experienced installer to set up rooftop solar panels.',
		taskDateRange: {
			start: new Date().toISOString(),
			end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
		},
		taskDeadline: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
		taskCreatorPubkey: '',
		taskCreatorUsername: 'client123',
		taskCreatorAvatar: '',
		loggedInUserId: 'taskee-1',
		loggedInUserName: 'Taskee Test',
		loggedInUserAvatar: '',
		onClose: () => {}
	}
};

export const WithValidationErrors: Story = {
	args: {
		...Default.args
	},
	play: async ({ canvasElement }) => {
		// In a real implementation, we would use testing-library to
		// simulate user interactions and trigger validation errors
		// This is just a placeholder for the structure
	}
};
