import type { Meta, StoryObj } from '@storybook/svelte';
import BidDetailsDrawer from '$lib/components/bidding/BidDetailsDrawer.svelte';
import type { Bid, CounterOffer } from '$lib/types/bid';

const meta = {
	title: 'Bidding/BidDetailsDrawer',
	component: BidDetailsDrawer,
	tags: ['autodocs'],
	argTypes: {
		isOpen: { control: 'boolean' },
		isTaskOwner: { control: 'boolean' },
		onClose: { action: 'close' },
		onAcceptBid: { action: 'acceptBid' },
		onRejectBid: { action: 'rejectBid' },
		onCounterOffer: { action: 'counterOffer' }
	},
	parameters: {
		layout: 'fullscreen'
	}
} satisfies Meta<BidDetailsDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleBid: Bid = {
	id: '1',
	taskId: 'task-123',
	amount: 0.01,
	currency: 'BTC',
	paymentType: 'FIXED',
	description:
		'I can complete this task efficiently and with high quality results. I have experience with similar projects and will ensure timely delivery of all requirements.',
	estimatedDuration: '3 days',
	proposedApproach:
		"I will start by analyzing the requirements, then break down the task into smaller components. I'll implement each component systematically and provide regular updates throughout the process.",
	coverLetter:
		'I am a full-stack developer with over 5 years of experience. I specialize in blockchain projects and have worked on similar tasks in the past.',
	visibility: 'PUBLIC',
	responseTime: 24,
	createdAt: new Date().toISOString(),
	status: 'PENDING'
};

const sampleCounterOffers: CounterOffer[] = [
	{
		id: 'counter-1',
		bidId: '1',
		price: {
			amount: 0.012,
			currency: 'BTC'
		},
		startDateTime: Math.floor(Date.now() / 1000) + 86400,
		endDateTime: Math.floor(Date.now() / 1000) + 86400 + 7200,
		message: 'Would you be able to add an additional feature for this price?',
		proposedBy: 'task-owner-123',
		createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
		status: 'pending'
	},
	{
		id: 'counter-2',
		bidId: '1',
		price: {
			amount: 0.015,
			currency: 'BTC'
		},
		message:
			'I can do that, but would need to increase the price slightly due to the additional work.',
		proposedBy: 'bidder-456',
		createdAt: new Date(Date.now() - 36000000).toISOString(), // 10 hours ago
		status: 'pending'
	}
];

export const Open: Story = {
	args: {
		bid: sampleBid,
		isOpen: true,
		isTaskOwner: true,
		counterOffers: sampleCounterOffers
	}
};

export const Closed: Story = {
	args: {
		bid: sampleBid,
		isOpen: false,
		isTaskOwner: true,
		counterOffers: sampleCounterOffers
	}
};

export const TaskOwnerView: Story = {
	args: {
		bid: sampleBid,
		isOpen: true,
		isTaskOwner: true,
		counterOffers: sampleCounterOffers
	}
};

export const BidderView: Story = {
	args: {
		bid: sampleBid,
		isOpen: true,
		isTaskOwner: false,
		counterOffers: sampleCounterOffers
	}
};

export const AcceptedBid: Story = {
	args: {
		bid: { ...sampleBid, status: 'accepted' },
		isOpen: true,
		isTaskOwner: true,
		counterOffers: sampleCounterOffers
	}
};

export const HourlyRateBid: Story = {
	args: {
		bid: {
			...sampleBid,
			paymentType: 'HOURLY',
			hourlyRate: 0.0005,
			estimatedHours: 20,
			amount: 0.01
		},
		isOpen: true,
		isTaskOwner: true,
		counterOffers: []
	}
};
