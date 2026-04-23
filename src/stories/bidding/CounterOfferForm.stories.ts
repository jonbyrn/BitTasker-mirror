import type { Meta, StoryObj } from '@storybook/svelte';
import CounterOfferForm from '$lib/components/bidding/CounterOfferForm.svelte';
import type { Bid } from '$lib/types/bid';
import { BidStatusEnum } from '$lib/utils/enums/bid.enum';
import type { Freelancer } from '$lib/types/freelancer';

const meta = {
	title: 'Bidding/CounterOfferForm',
	component: CounterOfferForm,
	tags: ['autodocs'],
	argTypes: {
		onSubmit: { action: 'submit' },
		onCancel: { action: 'cancel' }
	}
} satisfies Meta<CounterOfferForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleFreelancer: Freelancer = {
	id: 1,
	userId: 1,
	professionalTitle: 'Developer',
	bio: null,
	promotionalVideo: null,
	yearsExperience: 5,
	specialties: ['JavaScript', 'TypeScript'],
	standardRates: 50,
	tasksCompleted: 10,
	bidsSent: 5,
	successRate: 0.8,
	averageRating: 4.5,
	level: 1,
	experiencePoints: 100,
	reputationScore: 50,
	feeDiscount: 0,
	monthlyActivityPoints: 20,
	verificationLevel: 'basic',
	identityVerified: true,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	user: {
		id: 1,
		name: 'John Doe',
		profilePicture: null
	}
};

const sampleBid: Bid = {
	id: '1',
	taskId: 'task-123',
	freelancerId: 1,
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
		description: 'Task description',
		status: 'OPEN'
	},
	freelancer: sampleFreelancer
};

export const Default: Story = {
	args: {
		bid: sampleBid
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
		}
	}
};
