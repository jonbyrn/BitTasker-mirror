import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ProfilePage from '../../../../routes/(protected)/dashboard/profile/+page.svelte';
import type { ReviewFeedResponse } from '$lib/reviews';
import { EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';
import type { ContractWithEvents } from '$lib/types/contract';

const hoisted = vi.hoisted(() => {
	function createStore<T>(initialValue: T) {
		let value = initialValue;
		const subscribers = new Set<(nextValue: T) => void>();

		return {
			subscribe(subscriber: (nextValue: T) => void) {
				subscriber(value);
				subscribers.add(subscriber);
				return () => subscribers.delete(subscriber);
			},
			set(nextValue: T) {
				value = nextValue;
				for (const subscriber of subscribers) {
					subscriber(value);
				}
			}
		};
	}

	const profileStore = createStore({
		isLoading: false,
		error: null as string | null,
		servicesLoading: false,
		servicesError: null as string | null,
		data: {
			name: 'Owner',
			about: '',
			picture: '',
			pictures: [],
			website: '',
			professionalTitle: '',
			skills: [],
			portfolio: [],
			availability: {
				timeSlots: [],
				timezone: '',
				noticeHours: 24,
				maxBookingsPerDay: 5,
				breakBetweenBookings: 60
			},
			reviews: []
		},
		services: [],
		stats: {
			tasksCompleted: 7,
			activeServices: 2,
			rating: 4.8,
			responseRate: 0.96,
			onTimeRate: 0.94
		}
	});
	const contractStore = createStore({
		contract: null as ContractWithEvents | null,
		contracts: [] as ContractWithEvents[],
		contractsMap: new Map<string, number>(),
		isLoading: false,
		error: null as string | null,
		isDrawerOpen: false,
		isResolutionFormOpen: false,
		hasMore: false,
		oldestTimestamp: null as number | null,
		isSubscribed: false,
		isLoadingMore: false
	});

	return {
		profileStore,
		contractStore,
		init: vi.fn().mockResolvedValue(undefined),
		destroy: vi.fn(),
		goto: vi.fn(),
		getCurrentReviewerPubkey: vi.fn().mockResolvedValue('owner-pubkey'),
		loadReviewFeed: vi.fn().mockResolvedValue(undefined),
		loadContracts: vi.fn()
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$app/navigation', () => ({
	goto: hoisted.goto
}));

vi.mock('$lib/stores/profile.store', () => ({
	profileStore: {
		subscribe: hoisted.profileStore.subscribe,
		init: hoisted.init,
		destroy: hoisted.destroy
	}
}));
vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		subscribe: hoisted.contractStore.subscribe,
		loadContracts: hoisted.loadContracts
	}
}));
vi.mock('$lib/api/reviews/review-api', () => ({
	getCurrentReviewerPubkey: hoisted.getCurrentReviewerPubkey,
	loadReviewFeed: hoisted.loadReviewFeed
}));

vi.mock('$lib/components/profile/ProfileHeader.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/profile/ProfileStats.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/profile/ProfileServicesSection.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/profile/ProfileInfoSection.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/profile/ProfileSidebar.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/profile/ProfileReviewsSection.svelte', async () => {
	const { default: DashboardProfileReviewsSectionStub } = await import(
		'./fixtures/DashboardProfileReviewsSectionStub.svelte'
	);
	return {
		default: DashboardProfileReviewsSectionStub
	};
});

function createReviewFeed(): ReviewFeedResponse {
	return {
		received: [
			{
				reviewEventId: 'received-1',
				reviewDraftHash: 'draft-received',
				reviewerPubkey: 'reviewer-a',
				revieweePubkey: 'owner-pubkey',
				reviewerRole: 'client',
				revieweeRole: 'provider',
				subjectType: 'service_booking',
				settlementType: 'service_booking',
				contractOutcome: 'completed',
				rating: 5,
				createdAt: 1_700_000_100,
				content: {
					sourceLanguage: 'en',
					en: { comment: 'Excellent work' },
					es: { comment: 'Trabajo excelente' }
				},
				attachments: [],
				sourcePresentation: {
					label: 'Website redesign',
					href: '/services/site-redesign'
				}
			}
		],
		given: [
			{
				reviewEventId: 'given-1',
				reviewDraftHash: 'draft-given',
				reviewerPubkey: 'owner-pubkey',
				revieweePubkey: 'service-provider',
				reviewerRole: 'provider',
				revieweeRole: 'client',
				subjectType: 'task',
				settlementType: 'escrow',
				contractOutcome: 'disputed_resolved_payout',
				rating: 4,
				createdAt: 1_700_000_200,
				content: {
					sourceLanguage: 'es',
					en: { comment: 'Great client' },
					es: { comment: 'Gran cliente' }
				},
				attachments: [],
				reply: {
					schemaVersion: 1,
					parentReviewEventId: 'given-1',
					revieweePubkey: 'service-provider',
					createdAt: 1_700_000_250,
					content: {
						sourceLanguage: 'en',
						en: { comment: 'Thanks!' },
						es: { comment: 'Gracias!' }
					},
					attachments: []
				}
			}
		],
		pending: [
			{
				reviewEventId: 'pending-ignored',
				reviewDraftHash: 'draft-pending',
				reviewerPubkey: 'owner-pubkey',
				revieweePubkey: 'tasker-1',
				reviewerRole: 'taskee',
				revieweeRole: 'tasker',
				subjectType: 'task',
				settlementType: 'escrow',
				contractOutcome: 'completed',
				rating: 0,
				createdAt: 1_700_000_300,
				content: {
					sourceLanguage: 'en',
					en: { comment: 'Pending review' },
					es: { comment: 'Reseña pendiente' }
				},
				attachments: [],
				sourcePresentation: {
					label: 'Logo cleanup',
					href: '/tasks/logo-cleanup'
				}
			}
		],
		summary: {
			totalGiven: 1,
			totalReceived: 1,
			totalPending: 1,
			averageRating: 4.5
		}
	};
}

function createPendingContract(): ContractWithEvents {
	return {
		contractEvent: {
			id: 'contract-event-1',
			created_at: 1_700_000_000,
			pubkey: 'contract-author',
			kind: 30001,
			tags: [],
			content: {
				escrowId: 'contract-1',
				contextType: 'service',
				contextId: 'service-1',
				serviceId: 'service-1',
				serviceTitle: 'Brand refresh sprint',
				contextTitle: 'Brand refresh sprint',
				contextDescription: 'Design and delivery',
				clientPubkey: 'owner-pubkey',
				freelancerPubkey: 'reviewee-pubkey',
				currency: 'RBTC',
				contractAddress: '0xcontract',
				purchaseMode: 'quote'
			}
		},
		statusEvents: [],
		isClient: true,
		blockchainStatus: EscrowStatus.FundsReleased,
		escrowData: {
			id: 'contract-1',
			client: '0xclient',
			freelancer: '0xfreelancer'
		} as ContractWithEvents['escrowData'],
		status: EscrowStatus.FundsReleased,
		isPending: false,
		permissions: {
			canComplete: false,
			canAccept: false,
			canDispute: false,
			canPropose: false,
			canAcceptProposal: false,
			canCancel: false,
			canResolveTimelock: false,
			canDelete: false
		},
		disputeProposal: null,
		completionAttachments: null
	} as ContractWithEvents;
}

describe('dashboard profile page review integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.loadReviewFeed.mockReset();
		hoisted.loadContracts.mockReset().mockImplementation(async () => {
			hoisted.contractStore.set({
				contract: null,
				contracts: [createPendingContract()],
				contractsMap: new Map([['contract-1', 0]]),
				isLoading: false,
				error: null,
				isDrawerOpen: false,
				isResolutionFormOpen: false,
				hasMore: false,
				oldestTimestamp: 1_700_000_000,
				isSubscribed: true,
				isLoadingMore: false
			});
		});
		hoisted.contractStore.set({
			contract: null,
			contracts: [],
			contractsMap: new Map(),
			isLoading: false,
			error: null,
			isDrawerOpen: false,
			isResolutionFormOpen: false,
			hasMore: false,
			oldestTimestamp: null,
			isSubscribed: false,
			isLoadingMore: false
		});
	});

	it('loads review feed data, derives pending reviews from contracts, and wires the /reviews CTA', async () => {
		hoisted.loadReviewFeed.mockResolvedValue(createReviewFeed());

		render(ProfilePage);

		await tick();
		await tick();

		expect(screen.getByTestId('profile-reviews-stub')).toBeTruthy();

		expect(hoisted.getCurrentReviewerPubkey).toHaveBeenCalledTimes(1);
		expect(hoisted.loadReviewFeed).toHaveBeenCalledWith({
			reviewerPubkey: 'owner-pubkey'
		});
		expect(hoisted.loadContracts).toHaveBeenCalledTimes(1);
		expect(hoisted.init).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('profile-reviews-stub')).toHaveAttribute('data-pending-count', '1');

		await fireEvent.click(screen.getByRole('button', { name: 'view-all' }));
		expect(hoisted.goto).toHaveBeenCalledWith('/reviews?tab=received');
	});
});
