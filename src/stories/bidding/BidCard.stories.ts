import type { Meta, StoryObj } from '@storybook/svelte';
import BidCard from '$lib/components/bidding/BidCard.svelte';
import type { Bid } from '$lib/types/bid';

const meta = {
	title: 'Bidding/BidCard',
	component: BidCard,
	tags: ['autodocs'],
	argTypes: {
		isTaskOwner: { control: 'boolean' },
		onViewDetails: { action: 'viewDetails' },
		onAcceptBid: { action: 'acceptBid' },
		onRejectBid: { action: 'rejectBid' },
		onCounterOffer: { action: 'counterOffer' }
	}
} satisfies Meta<BidCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultBid: Bid = {
	id: '1',
	taskId: 'task-123',
	bidderId: 'bidder-456',
	bidderName: 'John Developer',
	amount: 0.01,
	currency: 'BTC',
	paymentType: 'FIXED',
	description: 'I can complete this task efficiently and with high quality results.',
	estimatedDuration: '3 days',
	proposedApproach: 'I will use modern techniques to solve this problem.',
	coverLetter: 'I have experience with similar tasks and would love to help.',
	visibility: 'PUBLIC',
	responseTime: 24,
	createdAt: new Date().toISOString(),
	status: 'pending'
};

export const Default: Story = {
	args: {
		bid: defaultBid,
		isTaskOwner: false
	}
};

export const WithTaskOwnerActions: Story = {
	args: {
		bid: defaultBid,
		isTaskOwner: true
	}
};

export const Accepted: Story = {
	args: {
		bid: { ...defaultBid, status: 'accepted' },
		isTaskOwner: true
	}
};

export const Rejected: Story = {
	args: {
		bid: { ...defaultBid, status: 'rejected' },
		isTaskOwner: true
	}
};

export const Withdrawn: Story = {
	args: {
		bid: { ...defaultBid, status: 'withdrawn' },
		isTaskOwner: true
	}
};

export const Countered: Story = {
	args: {
		bid: { ...defaultBid, status: 'countered' },
		isTaskOwner: true
	}
};

export const HourlyRate: Story = {
	args: {
		bid: {
			...defaultBid,
			paymentType: 'HOURLY',
			hourlyRate: 0.0005,
			estimatedHours: 20,
			amount: 0.01
		},
		isTaskOwner: true
	}
};
