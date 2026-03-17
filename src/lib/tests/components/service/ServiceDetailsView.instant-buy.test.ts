import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import type { Service } from '$lib/types/service.d';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

const hoisted = vi.hoisted(() => {
	function createStore<T>(initialValue: T) {
		let value = initialValue;
		const subscribers = new Set<(nextValue: T) => void>();

		return {
			set(nextValue: T) {
				value = nextValue;
				for (const subscriber of subscribers) {
					subscriber(value);
				}
			},
			subscribe(subscriber: (nextValue: T) => void) {
				subscriber(value);
				subscribers.add(subscriber);
				return () => subscribers.delete(subscriber);
			}
		};
	}

	return {
		mockGoto: vi.fn(),
		authStateStore: createStore({ isAuthenticated: true }),
		userStore: createStore({ npub: 'buyer-npub' }),
		mockFindServiceByUniqueId: vi.fn(),
		walletStoreMock: createStore({
			isConnected: true,
			rsk: {
				address: '0x1111111111111111111111111111111111111111',
				wallet: {},
				provider: {}
			}
		}),
		mockInitializeWallet: vi.fn(),
		mockCreateServiceContract: vi.fn(),
		mockShowSuccessToast: vi.fn(),
		mockShowErrorToast: vi.fn(),
		mockShowInfoToast: vi.fn(),
		mockWaitForContractCreation: vi.fn(),
		mockWritePendingNavigation: vi.fn(),
		mockClearPendingNavigation: vi.fn()
	};
});

const {
	mockGoto,
	authStateStore,
	userStore,
	mockFindServiceByUniqueId,
	walletStoreMock,
	mockInitializeWallet,
	mockCreateServiceContract,
	mockShowSuccessToast,
	mockShowErrorToast,
	mockShowInfoToast,
	mockWaitForContractCreation,
	mockWritePendingNavigation,
	mockClearPendingNavigation
} = hoisted;

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$app/navigation', () => ({
	goto: (...args: Parameters<typeof hoisted.mockGoto>) => hoisted.mockGoto(...args)
}));

vi.mock('$lib/stores/auth.store', () => ({
	authState: hoisted.authStateStore
}));

vi.mock('$lib/stores/user.store', () => ({
	user: hoisted.userStore
}));

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: hoisted.walletStoreMock,
	walletManager: {
		initialize: hoisted.mockInitializeWallet
	}
}));

vi.mock('$lib/utils/serviceDisplayTranslation', () => ({
	getServiceDisplayTitle: vi.fn((service: Service) => service.title),
	getServiceDisplayDescription: vi.fn((service: Service) => service.description),
	getServiceDisplayTiers: vi.fn((service: Service) => service.pricing?.tiers ?? []),
	getServiceDisplayAddOns: vi.fn(() => []),
	getServiceDisplayFaqs: vi.fn(() => []),
	getServiceDeliveryTimeDisplay: vi.fn(() => '2-3 days')
}));

vi.mock('$lib/stores/service-quote-ui.store', () => ({
	serviceQuoteUiStore: {
		submitQuoteRequest: vi.fn(),
		setNonBlockingMessage: vi.fn()
	}
}));

vi.mock('$lib/components/service/RequestQuoteModal.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showSuccessToast: hoisted.mockShowSuccessToast,
		showErrorToast: hoisted.mockShowErrorToast,
		showInfoToast: hoisted.mockShowInfoToast
	}
}));

vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: {
		initialize: vi.fn(),
		initializeDeviceName: vi.fn(),
		sendNotification: vi.fn(),
		sendInstantMessageNotification: vi.fn(),
		isSupported: vi.fn(() => false)
	}
}));

vi.mock('$lib/nostr/service', () => ({
	findServiceByUniqueId: (...args: Parameters<typeof hoisted.mockFindServiceByUniqueId>) =>
		hoisted.mockFindServiceByUniqueId(...args)
}));

vi.mock('$lib/utils/service-contract/create', () => ({
	createServiceContract: (...args: Parameters<typeof hoisted.mockCreateServiceContract>) =>
		hoisted.mockCreateServiceContract(...args)
}));

vi.mock('$lib/utils/service-contract/await-contract-creation', () => ({
	waitForContractCreationByTransactionHash: (
		...args: Parameters<typeof hoisted.mockWaitForContractCreation>
	) => hoisted.mockWaitForContractCreation(...args)
}));

vi.mock('$lib/utils/service-contract/pending-navigation', () => ({
	writePendingServiceContractNavigation: (
		...args: Parameters<typeof hoisted.mockWritePendingNavigation>
	) => hoisted.mockWritePendingNavigation(...args),
	clearPendingServiceContractNavigation: (
		...args: Parameters<typeof hoisted.mockClearPendingNavigation>
	) => hoisted.mockClearPendingNavigation(...args)
}));

vi.mock('$lib/utils/escrow', () => ({
	EscrowStatus: {
		Funded: 'FUNDED',
		Completed: 'COMPLETED',
		Cancelled: 'CANCELLED'
	},
	escrow: {
		escrowOps: {
			createEscrow: vi.fn()
		},
		eventOps: {
			registerPendingContractByTxHash: vi.fn()
		}
	}
}));

const baseService = {
	id: 'service-event-1',
	uniqueId: 'service-123',
	npub: 'a'.repeat(64),
	status: 'active',
	title: 'Brand Identity Sprint',
	description: 'Logo, color palette, and social avatar pack.',
	serviceLocationTypes: [],
	pricing: {
		type: ServicePricingTypeEnum.FIXED,
		currency: 'USDt',
		amount: 200,
		deliveryTime: {
			min: 2,
			max: 3,
			unit: 'day',
			display: '2-3 days'
		}
	},
	skills: [],
	categories: [],
	createdAt: 1_700_000_000,
	creator: {
		username: 'Designer',
		avatar: '',
		providerWalletAddress: '0x2222222222222222222222222222222222222222'
	},
	instantBuyLeadHours: 24
} as Service & {
	instantBuyLeadHours: number;
	creator: Service['creator'] & { providerWalletAddress?: string };
};

describe('ServiceDetailsView instant buy flow', () => {
	let ServiceDetailsView: Awaited<
		typeof import('$lib/components/service/ServiceDetailsView.svelte')
	>['default'];

	beforeAll(async () => {
		({ default: ServiceDetailsView } = await import(
			'$lib/components/service/ServiceDetailsView.svelte'
		));
	}, 40_000);

	function renderView(service: Service, serviceId: string) {
		return render(ServiceDetailsView, {
			props: {
				service,
				serviceId
			}
		});
	}

	function setNavigatorOnline(online: boolean) {
		Object.defineProperty(window.navigator, 'onLine', {
			value: online,
			configurable: true
		});
	}

	beforeEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.clearAllMocks();
		window.history.replaceState({}, '', `/services/${baseService.uniqueId}`);
		setNavigatorOnline(true);
		authStateStore.set({ isAuthenticated: true });
		userStore.set({ npub: 'buyer-npub' });
		walletStoreMock.set({
			isConnected: true,
			rsk: {
				address: '0x1111111111111111111111111111111111111111',
				wallet: {},
				provider: {}
			}
		});
		mockCreateServiceContract.mockResolvedValue({
			success: true,
			transactionHash: '0xtxhash'
		});
		mockWaitForContractCreation.mockResolvedValue({
			escrowId: 'escrow-123',
			transactionHash: '0xtxhash',
			contractEventId: 'contract-escrow-123'
		});
		mockFindServiceByUniqueId.mockResolvedValue(baseService);

		Object.defineProperty(globalThis, 'crypto', {
			value: {
				randomUUID: () => '123e4567-e89b-12d3-a456-426614174000'
			},
			configurable: true
		});
		vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
	});

	afterEach(() => {
		cleanup();
		window.history.replaceState({}, '', '/services');
		setNavigatorOnline(true);
	});

	it(
		'shows Buy Now and Request Quote together for eligible fixed-price services',
		async () => {
		const { getByTestId, getByText } = renderView(baseService, baseService.uniqueId);

		expect(getByTestId('service-detail-buy-now')).toBeTruthy();
		expect(getByText('dashboard.services.detail.request_quote')).toBeTruthy();
		},
		40_000
	);

	it('falls back to Request Quote only when the listing is not instant-buy eligible', async () => {
		const inquiryOnlyService = {
			...baseService,
			pricing: {
				type: ServicePricingTypeEnum.INQUIRY_REQUIRED,
				currency: 'USDt'
			}
		} as Service;

		mockFindServiceByUniqueId.mockResolvedValue(inquiryOnlyService);

		const { queryByTestId, getByText } = renderView(
			inquiryOnlyService,
			inquiryOnlyService.uniqueId
		);

		expect(queryByTestId('service-detail-buy-now')).toBeNull();
		expect(getByText('dashboard.services.detail.request_quote')).toBeTruthy();
	});

	it('keeps request-quote and instant-buy CTAs disabled while offline and surfaces reconnect guidance', async () => {
		const { getByTestId, getByText } = renderView(baseService, baseService.uniqueId);

		setNavigatorOnline(false);
		window.dispatchEvent(new Event('offline'));

		await waitFor(() => {
			expect(getByTestId('service-detail-offline-alert')).toBeTruthy();
			expect((getByTestId('service-detail-buy-now') as HTMLButtonElement).disabled).toBe(true);
			expect((getByText('dashboard.services.detail.request_quote') as HTMLButtonElement).disabled).toBe(
				true
			);
		});

		setNavigatorOnline(true);
		window.dispatchEvent(new Event('online'));

		await waitFor(() => {
			expect(getByTestId('service-detail-reconnect-alert')).toBeTruthy();
		});
	});

	it('keeps the instant-buy modal open with offline guidance if the browser disconnects after review opens', async () => {
		const { getByTestId, findByTestId } = renderView(baseService, baseService.uniqueId);

		await fireEvent.click(getByTestId('service-detail-buy-now'));
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();

		setNavigatorOnline(false);
		window.dispatchEvent(new Event('offline'));

		await waitFor(() => {
			expect(getByTestId('service-instant-buy-offline-alert')).toBeTruthy();
			expect((getByTestId('service-instant-buy-confirm') as HTMLButtonElement).disabled).toBe(
				true
			);
		});

		setNavigatorOnline(true);
		window.dispatchEvent(new Event('online'));

		await waitFor(() => {
			expect(getByTestId('service-instant-buy-reconnect-alert')).toBeTruthy();
		});
	});

	it('requires tier selection before enabling Buy Now and carries the chosen tier into confirmation', async () => {
		const tieredService = {
			...baseService,
			pricing: {
				type: ServicePricingTypeEnum.TIERED,
				currency: 'USDt',
				tiers: [
					{
						id: 'standard',
						name: 'Standard',
						price: 180,
						description: 'One polished logo concept.',
						deliveryTime: {
							min: 2,
							max: 2,
							unit: 'day',
							display: '2 days'
						}
					},
					{
						id: 'premium',
						name: 'Premium',
						price: 320,
						description: 'Three logo concepts plus brand guide.',
						deliveryTime: {
							min: 4,
							max: 5,
							unit: 'day',
							display: '4-5 days'
						}
					}
				]
			}
		} as Service & {
			instantBuyLeadHours: number;
			creator: Service['creator'] & { providerWalletAddress?: string };
		};

		mockFindServiceByUniqueId.mockResolvedValue(tieredService);

		const { getByTestId, getByText, findByTestId } = renderView(
			tieredService,
			tieredService.uniqueId
		);

		const buyNowButton = getByTestId('service-detail-buy-now') as HTMLButtonElement;
		expect(buyNowButton.disabled).toBe(true);
		expect(getByText('Select a tier to continue with Buy Now.')).toBeTruthy();
		expect(getByText('dashboard.services.detail.request_quote')).toBeTruthy();

		await fireEvent.click(getByText('Premium'));

		expect(buyNowButton.disabled).toBe(false);
		await fireEvent.click(buyNowButton);

		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		expect((await findByTestId('service-agreement-tier')).textContent).toContain('Premium');
		expect((await findByTestId('service-agreement-scope')).textContent).toContain(
			'Three logo concepts plus brand guide.'
		);
	});

	it('restores tier context from a quote reentry link and clears the one-shot params', async () => {
		const tieredService = {
			...baseService,
			pricing: {
				type: ServicePricingTypeEnum.TIERED,
				currency: 'USDt',
				tiers: [
					{
						id: 'standard',
						name: 'Standard',
						price: 180,
						description: 'One polished logo concept.',
						deliveryTime: {
							min: 2,
							max: 2,
							unit: 'day',
							display: '2 days'
						}
					},
					{
						id: 'premium',
						name: 'Premium',
						price: 320,
						description: 'Three logo concepts plus brand guide.',
						deliveryTime: {
							min: 4,
							max: 5,
							unit: 'day',
							display: '4-5 days'
						}
					}
				]
			}
		} as Service & {
			instantBuyLeadHours: number;
			creator: Service['creator'] & { providerWalletAddress?: string };
		};

		mockFindServiceByUniqueId.mockResolvedValue(tieredService);
		window.history.replaceState(
			{},
			'',
			'/services/service-123?quote=request&tier=premium&addons=source-files'
		);

		const { getByTestId, getByText } = renderView(tieredService, tieredService.uniqueId);

		expect(getByText('Premium')).toBeTruthy();
		expect((getByTestId('service-detail-buy-now') as HTMLButtonElement).disabled).toBe(false);
		expect(window.location.search).toBe('');
	});

	it(
		'waits for escrow confirmation and opens the exact service contract',
		async () => {
			const { getByTestId, findByTestId } = renderView(
				baseService,
				baseService.uniqueId
			);

			await fireEvent.click(getByTestId('service-detail-buy-now'));
			expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
			expect((await findByTestId('service-agreement-provider')).textContent).toContain('Designer');
			expect((await findByTestId('service-agreement-scope')).textContent).toContain(
				'Logo, color palette, and social avatar pack.'
			);
			expect(await findByTestId('service-instant-buy-confirm')).toBeTruthy();

			await fireEvent.click(getByTestId('service-instant-buy-confirm'));

			await waitFor(() => expect(mockCreateServiceContract).toHaveBeenCalledTimes(1));
			expect(mockFindServiceByUniqueId).toHaveBeenCalledTimes(2);
			expect(mockFindServiceByUniqueId).toHaveBeenNthCalledWith(1, baseService.uniqueId);
			expect(mockFindServiceByUniqueId).toHaveBeenNthCalledWith(2, baseService.uniqueId);
			await waitFor(() => {
				expect(mockWaitForContractCreation).toHaveBeenCalledWith('0xtxhash');
			});
			await waitFor(() => {
				expect(mockClearPendingNavigation).toHaveBeenCalledWith(expect.anything());
			});
			expect(mockCreateServiceContract).toHaveBeenCalledWith({
				freelancerPubkey: 'a'.repeat(64),
				freelancerAddress: '0x2222222222222222222222222222222222222222',
				amountUsdt: '200.00',
				estimatedStartTime: 1_700_086_400,
				estimatedCompletionTime: 1_700_345_600,
				serviceId: 'service-123',
				serviceAddress: `30402:${'a'.repeat(64)}:service-123`,
				serviceTitle: 'Brand Identity Sprint',
				serviceDescription: 'Logo, color palette, and social avatar pack.',
				contextVersionRef: 'service-event-1',
				purchaseMode: 'instant_buy',
				instantOrderId: 'sib_123e4567e89b12d3',
				selectedTierId: undefined,
				pricingSnapshot: {
					serviceVersionRef: 'service-event-1',
					tierId: undefined
				},
					agreementSnapshot: {
						deliverables: 'Logo, color palette, and social avatar pack.',
						selectedTierId: undefined,
						priceSnapshotRef: '3c4f154d30c3b678787c2d8068e0a5784e4112c17450c6d54c00ab61916dc7ad',
						priceSnapshotLabel: '$200'
				}
			});
			await waitFor(() => {
				expect(mockShowSuccessToast).toHaveBeenCalledWith(
					'Instant-buy order confirmed. Opening your service contract.'
				);
			});
			await waitFor(() => {
				expect(mockGoto).toHaveBeenCalledWith(
					'/dashboard?tab=contracts&context=services&highlight=escrow-123'
				);
			});
		},
			35_000
		);

	it(
		'keeps prepare failures local to the instant-buy modal when the listing changed on the relay',
		async () => {
			mockFindServiceByUniqueId.mockResolvedValue({
				...baseService,
				id: 'service-event-2'
			});

			const { getByTestId, findByTestId } = renderView(baseService, baseService.uniqueId);

			await fireEvent.click(getByTestId('service-detail-buy-now'));

			expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
			expect((await findByTestId('service-instant-buy-error')).textContent).toContain(
				'This service was updated. Refresh the page to review the latest details before using Buy Now.'
			);
			expect(mockShowErrorToast).not.toHaveBeenCalled();
			expect(mockCreateServiceContract).not.toHaveBeenCalled();
		},
			20_000
		);

	it(
		'keeps the confirmation modal open when revalidation fails before create',
		async () => {
			mockFindServiceByUniqueId
				.mockResolvedValueOnce(baseService)
				.mockResolvedValueOnce({
					...baseService,
					id: 'service-event-2'
				});

			const { getByTestId, findByTestId } = renderView(baseService, baseService.uniqueId);

			await fireEvent.click(getByTestId('service-detail-buy-now'));
			expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
			await fireEvent.click(getByTestId('service-instant-buy-confirm'));

			expect(mockCreateServiceContract).not.toHaveBeenCalled();
			expect((await findByTestId('service-instant-buy-error')).textContent).toContain(
				'This service was updated. Refresh the page to review the latest details before using Buy Now.'
			);
		},
			20_000
		);

	it('shows an inline error when the provider wallet is unavailable', async () => {
		const serviceWithoutWallet = {
			...baseService,
			creator: {
				username: 'Designer',
				avatar: ''
			}
		} as Service & { instantBuyLeadHours: number };
		mockFindServiceByUniqueId.mockResolvedValue(serviceWithoutWallet);
		mockCreateServiceContract.mockResolvedValueOnce({
			success: false,
			error: 'Provider wallet is unavailable for instant buy.',
			errorCode: 'invalid_provider_wallet'
		});

		const { getByTestId, findByTestId } = renderView(
			serviceWithoutWallet,
			serviceWithoutWallet.uniqueId
		);

		await fireEvent.click(getByTestId('service-detail-buy-now'));
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		await fireEvent.click(getByTestId('service-instant-buy-confirm'));

		expect(mockCreateServiceContract).toHaveBeenCalledTimes(1);
		expect((await findByTestId('service-instant-buy-error')).textContent).toContain(
			'Provider wallet is unavailable for instant buy.'
		);
	});

	it('keeps the modal open on insufficient-funds preflight failures', async () => {
		mockCreateServiceContract.mockResolvedValueOnce({
			success: false,
			error: 'Insufficient RBTC balance.',
			errorCode: 'insufficient_funds'
		});

		const { getByTestId, findByTestId } = renderView(baseService, baseService.uniqueId);

		await fireEvent.click(getByTestId('service-detail-buy-now'));
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		await fireEvent.click(getByTestId('service-instant-buy-confirm'));

		expect((await findByTestId('service-instant-buy-error')).textContent).toContain(
			'Insufficient RBTC balance.'
		);
		expect((await findByTestId('service-instant-buy-error-hint')).textContent).toContain(
			'Add enough RBTC to cover the escrow amount and gas, then retry.'
		);
		expect(mockGoto).not.toHaveBeenCalledWith('/dashboard?tab=contracts&context=services');
	});

	it('shows a wallet connection recovery hint when preflight reports the wallet is disconnected', async () => {
		mockCreateServiceContract.mockResolvedValueOnce({
			success: false,
			error: 'Connect your wallet before continuing.',
			errorCode: 'wallet_not_connected'
		});

		const { getByTestId, findByTestId } = renderView(baseService, baseService.uniqueId);

		await fireEvent.click(getByTestId('service-detail-buy-now'));
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		await fireEvent.click(getByTestId('service-instant-buy-confirm'));

		expect((await findByTestId('service-instant-buy-error')).textContent).toContain(
			'Connect your wallet before continuing.'
		);
		expect((await findByTestId('service-instant-buy-error-hint')).textContent).toContain(
			'Connect your wallet, then retry the contract creation.'
		);
	});

	it('shows a network recovery hint when preflight reports the wrong Rootstock network', async () => {
		mockCreateServiceContract.mockResolvedValueOnce({
			success: false,
			error: 'Switch your wallet to Rootstock Testnet before continuing.',
			errorCode: 'wrong_network'
		});

		const { getByTestId, findByTestId } = renderView(baseService, baseService.uniqueId);

		await fireEvent.click(getByTestId('service-detail-buy-now'));
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		await fireEvent.click(getByTestId('service-instant-buy-confirm'));

		expect((await findByTestId('service-instant-buy-error')).textContent).toContain(
			'Switch your wallet to Rootstock Testnet before continuing.'
		);
		expect((await findByTestId('service-instant-buy-error-hint')).textContent).toContain(
			'Switch to the required Rootstock network in your wallet, then retry.'
		);
	});

	it('reuses the same instant order id when retrying after a create failure', async () => {
		mockCreateServiceContract
			.mockResolvedValueOnce({
				success: false,
				error: 'Insufficient RBTC balance.',
				errorCode: 'insufficient_funds'
			})
			.mockResolvedValueOnce({
				success: true,
				transactionHash: '0xtxhash'
			});

		const { getByTestId, findByTestId } = renderView(baseService, baseService.uniqueId);

		await fireEvent.click(getByTestId('service-detail-buy-now'));
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		await fireEvent.click(getByTestId('service-instant-buy-confirm'));
		expect((await findByTestId('service-instant-buy-error')).textContent).toContain(
			'Insufficient RBTC balance.'
		);

		await fireEvent.click(getByTestId('service-instant-buy-retry'));
		await fireEvent.click(getByTestId('service-instant-buy-confirm'));

		await waitFor(() => expect(mockCreateServiceContract).toHaveBeenCalledTimes(2));
		expect(mockCreateServiceContract.mock.calls[0]?.[0].instantOrderId).toBe(
			mockCreateServiceContract.mock.calls[1]?.[0].instantOrderId
		);
	});

	it('redirects unauthenticated buyers to login when they click Buy Now', async () => {
		authStateStore.set({ isAuthenticated: false });

		const { getByTestId } = renderView(baseService, baseService.uniqueId);

		await fireEvent.click(getByTestId('service-detail-buy-now'));

		expect(mockGoto).toHaveBeenCalledWith(
			'/auth/login?returnTo=%2Fservices%2Fservice-123'
		);
		expect(mockCreateServiceContract).not.toHaveBeenCalled();
	});

	it('falls back to the service contracts tab when contract confirmation is still syncing', async () => {
		mockWaitForContractCreation.mockRejectedValueOnce(
			new Error(
				'The escrow transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.'
			)
		);

		const { getByTestId, findByTestId } = renderView(baseService, baseService.uniqueId);

		await fireEvent.click(getByTestId('service-detail-buy-now'));
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		await fireEvent.click(getByTestId('service-instant-buy-confirm'));

		await waitFor(() =>
			expect(mockShowInfoToast).toHaveBeenCalledWith(
				'The escrow transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.'
			)
		);
		expect(mockWritePendingNavigation).toHaveBeenCalledWith(expect.anything(), '0xtxhash');
		expect(mockClearPendingNavigation).not.toHaveBeenCalled();
		expect(mockGoto).toHaveBeenCalledWith('/dashboard?tab=contracts&context=services');
	});
});
