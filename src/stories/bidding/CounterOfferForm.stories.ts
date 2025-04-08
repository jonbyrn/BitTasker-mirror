import type { Meta, StoryObj } from '@storybook/svelte';
import CounterOfferForm from '$lib/components/bidding/CounterOfferForm.svelte';
import type { Bid } from '$lib/types/bid';

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

const sampleBid: Bid = {
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
