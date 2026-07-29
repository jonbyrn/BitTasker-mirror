import type { Meta, StoryObj } from '@storybook/svelte';
import CounterOfferForm from '$lib/components/bidding/CounterOfferForm.svelte';
import type { NostrBidContent } from '$lib/types/bid';

const meta = {
	title: 'Bidding/CounterOfferForm',
	component: CounterOfferForm,
	tags: ['autodocs'],
	argTypes: {
		onSubmit: { action: 'submit' },
		onCancel: { action: 'cancel' }
	}
} satisfies Meta<typeof CounterOfferForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleBid: NostrBidContent = {
	type: 'bid',
	taskId: 'task-123',
	taskTitle: 'Website Development',
	taskDescription: 'Build a modern e-commerce website',
	amount: 50,
	currency: 'USD',
	paymentType: 'FIXED',
	description: 'I can complete this task efficiently and with high quality results.',
	estimatedDuration: '3 days',
	proposedApproach: 'I will use modern techniques to solve this problem.',
	coverLetter: 'I have experience with similar tasks and would love to help.',
	timestamp: Math.floor(Date.now() / 1000),
	bidId: 'bid-1',
	startDateTime: Math.floor(Date.now() / 1000) + 86400,
	endDateTime: Math.floor(Date.now() / 1000) + 86400 + 7200
};

export const Default: Story = {
	args: {
		bid: sampleBid
	} as unknown as Story['args']
};

export const HourlyRateBid: Story = {
	args: {
		bid: {
			...sampleBid,
			paymentType: 'HOURLY',
			hourlyRate: 25,
			estimatedHours: 20,
			amount: 500
		}
	} as unknown as Story['args']
};
