import type { Meta, StoryObj } from '@storybook/svelte';
import BidDetailsDrawer from '$lib/components/bidding/BidDetailsDrawer.svelte';
import type { Bid, CounterOffer } from '$lib/types/bid';
import { BidStatusEnum } from '$lib/utils/enums/bid.enum';

const meta = {
	title: 'Bidding/BidDetailsDrawer',
	component: BidDetailsDrawer,
	tags: ['autodocs'],
	argTypes: {
		isOpen: { control: 'boolean' },
		onClose: { action: 'close' },
		onAcceptBid: { action: 'acceptBid' },
		onRejectBid: { action: 'rejectBid' },
		onCounterOffer: { action: 'counterOffer' }
	},
	parameters: {
		layout: 'fullscreen'
	}
} satisfies Meta<typeof BidDetailsDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleBid: Bid = {
	id: '1',
	taskId: 'task-123',
	freelancerId: 1,
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
	status: BidStatusEnum.PENDING,
	clientViewed: false,
	clientViewedAt: null,
	featured: false,
	clientResponse: null,
	competitiveScore: null,
	rank: null,
	impressions: 0,
	clicks: 0,
	isWithdrawn: false,
	withdrawnReason: null,
	expiresAt: null,
	task: {
		id: 1,
		title: 'Sample Task',
		description: 'A sample task description',
		status: 'OPEN'
	},
	freelancer: {
		id: 1,
		userId: 1,
		professionalTitle: 'Full Stack Developer',
		bio: 'Experienced developer',
		promotionalVideo: null,
		yearsExperience: 5,
		specialties: ['TypeScript', 'Svelte'],
		standardRates: null,
		tasksCompleted: 10,
		bidsSent: 5,
		successRate: 0.9,
		averageRating: 4.5,
		level: 3,
		experiencePoints: 500,
		reputationScore: 80,
		feeDiscount: 0,
		monthlyActivityPoints: 100,
		verificationLevel: 'VERIFIED',
		identityVerified: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		user: {
			id: 1,
			name: 'John Developer',
			profilePicture: null
		}
	}
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
		counterOffers: sampleCounterOffers
	} as unknown as Story['args']
};

export const Closed: Story = {
	args: {
		bid: sampleBid,
		isOpen: false,
		counterOffers: sampleCounterOffers
	} as unknown as Story['args']
};

export const TaskOwnerView: Story = {
	args: {
		bid: sampleBid,
		isOpen: true,
		counterOffers: sampleCounterOffers
	} as unknown as Story['args']
};

export const BidderView: Story = {
	args: {
		bid: sampleBid,
		isOpen: true,
		counterOffers: sampleCounterOffers
	} as unknown as Story['args']
};

export const AcceptedBid: Story = {
	args: {
		bid: { ...sampleBid, status: BidStatusEnum.ACCEPTED },
		isOpen: true,
		counterOffers: sampleCounterOffers
	} as unknown as Story['args']
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
		counterOffers: []
	} as unknown as Story['args']
};
