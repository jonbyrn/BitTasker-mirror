import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import type { Service } from '$lib/types/service.d';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

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
		allAssetsStore: createStore([
			{
				assetId: 'rbtc',
				usdValue: 250,
				balance: 0.005
			}
		]),
		totalBalancesStore: createStore({
			sats: 500_000,
			rbtc: 0.005
		}),
		walletStoreMock: createStore({
			isConnected: true,
			rsk: {
				connected: true,
				connecting: false,
				error: null,
				address: '0x1111111111111111111111111111111111111111',
				wallet: {},
				provider: {}
			}
		}),
		_mockInitializeWallet: vi.fn(),
		_mockLoadAssets: vi.fn(),
		mockPreflightServiceContractCreation: vi.fn(),
		mockGetCurrentPrice: vi.fn(),
		mockCreateServiceContract: vi.fn(),
		contractCreationStore: createStore(null),
		mockShowSuccessToast: vi.fn(),
		mockShowErrorToast: vi.fn(),
		mockShowInfoToast: vi.fn(),
		mockWaitForContractCreation: vi.fn(),
		mockWritePendingNavigation: vi.fn(),
		mockClearPendingNavigation: vi.fn(),
		mockRecoverBookNowContract: vi.fn(),
		mockGetExactServiceLocation: vi.fn()
	};
});

const {
	mockGoto,
	authStateStore,
	userStore,
	mockFindServiceByUniqueId,
	allAssetsStore,
	totalBalancesStore,
	walletStoreMock,
	_mockInitializeWallet,
	_mockLoadAssets,
	mockPreflightServiceContractCreation,
	mockGetCurrentPrice,
	mockCreateServiceContract,
	contractCreationStore,
	mockShowSuccessToast,
	mockShowErrorToast,
	mockShowInfoToast,
	mockWaitForContractCreation,
	mockWritePendingNavigation,
	mockClearPendingNavigation,
	mockRecoverBookNowContract,
	mockGetExactServiceLocation
} = hoisted;

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => {
			if (key === 'common.location.approximate_short') {
				return 'Approx.';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.balance_verified') {
				return 'Your available balance covers this service contract.';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.verifying_wallet') {
				return 'Checking your wallet balance for this contract...';
			}
			return key;
		}),
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
	allAssets: hoisted.allAssetsStore,
	totalBalances: hoisted.totalBalancesStore,
	formatSats: (value: number) => new Intl.NumberFormat('en-US').format(value),
	walletManager: {
		initialize: hoisted._mockInitializeWallet,
		loadAssets: hoisted._mockLoadAssets
	}
}));

vi.mock('$lib/utils/serviceDisplayTranslation', () => ({
	getServiceDisplayTitle: vi.fn((service: Service) => service.title),
	getServiceDisplayDescription: vi.fn((service: Service) => service.description),
	getServiceDisplayTiers: vi.fn((service: Service) => service.pricing?.tiers ?? []),
	getServiceDisplayAddOns: vi.fn((service: Service) => service.pricing?.addOns ?? []),
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

vi.mock('$lib/components/user/UserInfoDisplay.svelte', async () => ({
	default: (await import('$lib/tests/fixtures/UserInfoDisplayStub.svelte')).default
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

vi.mock('$lib/nostr/exact-location', () => ({
	getExactServiceLocation: (...args: Parameters<typeof hoisted.mockGetExactServiceLocation>) =>
		hoisted.mockGetExactServiceLocation(...args)
}));

vi.mock('$lib/utils/service-contract/create', () => ({
	createServiceContract: (...args: Parameters<typeof hoisted.mockCreateServiceContract>) =>
		hoisted.mockCreateServiceContract(...args)
}));

vi.mock('$lib/utils/service-contract/preflight', () => ({
	preflightServiceContractCreation: (
		...args: Parameters<typeof hoisted.mockPreflightServiceContractCreation>
	) => hoisted.mockPreflightServiceContractCreation(...args)
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: (...args: Parameters<typeof hoisted.mockGetCurrentPrice>) =>
			hoisted.mockGetCurrentPrice(...args)
	}
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

vi.mock('$lib/utils/service-contract/recover', () => ({
	recoverBookNowContract: (...args: Parameters<typeof hoisted.mockRecoverBookNowContract>) =>
		hoisted.mockRecoverBookNowContract(...args)
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
			registerPendingContractByTxHash: vi.fn(),
			getContractCreationStore: () => hoisted.contractCreationStore
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
		avatar: ''
	},
	providerWalletAddress: '0x45aFd3dAdc7CeFcc6c4B6bAf66299da085583361',
	instantBuyLeadHours: 24
} as Service & { instantBuyLeadHours: number };

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

	async function openBookNowDrawer(getByTestId: (id: string) => HTMLElement) {
		await fireEvent.click(getByTestId('service-detail-buy-now'));
	}

	async function confirmBookNowEscrow(
		getByTestId: (id: string) => HTMLElement,
		findByText: (text: string) => Promise<HTMLElement>
	) {
		await waitFor(() => {
			expect(getByTestId('service-instant-buy-confirm')).not.toBeDisabled();
		});
		await fireEvent.click(getByTestId('service-instant-buy-confirm'));
		expect(await findByText('dashboard.services.detail.book_now_confirm_modal.title')).toBeTruthy();
		await fireEvent.click(
			await findByText('dashboard.services.detail.book_now_confirm_modal.confirm')
		);
	}

	async function openBookNowConfirmation(
		getByTestId: (id: string) => HTMLElement,
		findByText: (text: string) => Promise<HTMLElement>
	) {
		await waitFor(() => {
			expect(getByTestId('service-instant-buy-confirm')).not.toBeDisabled();
		});
		await fireEvent.click(getByTestId('service-instant-buy-confirm'));
		return await findByText('dashboard.services.detail.book_now_confirm_modal.title');
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
		vi.spyOn(console, 'debug').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		window.history.replaceState({}, '', `/services/${baseService.uniqueId}`);
		setNavigatorOnline(true);
		authStateStore.set({ isAuthenticated: true });
		userStore.set({ npub: 'buyer-npub' });
		allAssetsStore.set([
			{
				assetId: 'rbtc',
				usdValue: 250,
				balance: 0.005
			}
		]);
		totalBalancesStore.set({
			sats: 500_000,
			rbtc: 0.005
		});
		walletStoreMock.set({
			isConnected: true,
			rsk: {
				connected: true,
				connecting: false,
				error: null,
				address: '0x1111111111111111111111111111111111111111',
				wallet: {},
				provider: {}
			}
		});
		_mockLoadAssets.mockResolvedValue(undefined);
		mockGetCurrentPrice.mockResolvedValue(50_000);
		mockPreflightServiceContractCreation.mockResolvedValue({
			ok: true,
			amount: '0.00400000',
			gasCost: '0.00001000',
			totalRequired: '0.00411000',
			walletAddress: '0x1111111111111111111111111111111111111111'
		});
		mockCreateServiceContract.mockResolvedValue({
			success: true,
			state: 'funding_submitted',
			transactionHash: '0xtxhash',
			amount: '0.00400000'
		});
		mockRecoverBookNowContract.mockResolvedValue({
			status: 'contract_sync_pending',
			transactionHash: '0xtxhash'
		});
		mockGetExactServiceLocation.mockResolvedValue(null);
		contractCreationStore.set(null);
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
		window.localStorage.clear();
		window.sessionStorage.clear();
	});

	afterEach(() => {
		cleanup();
		window.history.replaceState({}, '', '/services');
		setNavigatorOnline(true);
	});

	it('proactively initializes the wallet on mount when authenticated', async () => {
		walletStoreMock.set({
			isConnected: false,
			rsk: {
				connected: false,
				connecting: false,
				error: null,
				address: null
			}
		} as unknown);
		const { findByText } = renderView(baseService, baseService.uniqueId);
		await findByText(baseService.title);
		expect(_mockInitializeWallet).toHaveBeenCalled();
	});

	it('shows Buy Now and Request Quote together for eligible fixed-price services', async () => {
		const { getByTestId, getByText, queryByText } = renderView(baseService, baseService.uniqueId);

		expect(getByTestId('service-detail-buy-now')).toBeTruthy();
		expect(getByText('dashboard.services.detail.request_quote')).toBeTruthy();
		expect(queryByText('dashboard.services.detail.instant_buy.not_eligible')).toBeNull();
	}, 40_000);

	it('hides buyer-side actions when viewing your own service listing', async () => {
		userStore.set({ npub: baseService.npub });

		const { getByText, queryByTestId, queryByText } = renderView(baseService, baseService.uniqueId);

		expect(getByText('dashboard.services.detail.you_are_provider')).toBeTruthy();
		expect(queryByTestId('service-detail-buy-now')).toBeNull();
		expect(queryByText('dashboard.services.detail.request_quote')).toBeNull();
		expect(queryByText('dashboard.services.detail.contact_taskee')).toBeNull();
	});

	it('shows a confirmation modal when the drawer Book Now button is clicked', async () => {
		const { getByTestId, findByTestId, findByText, queryByText } = renderView(
			baseService,
			baseService.uniqueId
		);

		await openBookNowDrawer(getByTestId);
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();

		expect(await openBookNowConfirmation(getByTestId, findByText)).toBeTruthy();
		await fireEvent.click(
			await findByText('dashboard.services.detail.book_now_confirm_modal.cancel')
		);
		expect(queryByText('dashboard.services.detail.book_now_confirm_modal.title')).toBeNull();
		expect(mockCreateServiceContract).not.toHaveBeenCalled();
	});

	it('switches the drawer into contract-creation progress after Book Now is confirmed', async () => {
		mockWaitForContractCreation.mockImplementation(() => new Promise(() => {}));

		const { getByTestId, findByTestId, findByText, queryByTestId } = renderView(
			baseService,
			baseService.uniqueId
		);

		await openBookNowDrawer(getByTestId);
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		expect(await openBookNowConfirmation(getByTestId, findByText)).toBeTruthy();
		await fireEvent.click(
			await findByText('dashboard.services.detail.book_now_confirm_modal.confirm')
		);

		expect(await findByTestId('service-contract-creation-progress')).toBeTruthy();
		expect((await findByTestId('service-contract-creation-status')).textContent).toContain(
			'dashboard.services.detail.book_now_drawer.creating_contract'
		);
		expect(queryByTestId('service-instant-buy-confirm')).toBeNull();
	});

	it('allows closing the drawer while the contract is being created and finishes in the background', async () => {
		let resolveContractCreation:
			| ((value: { escrowId: string; transactionHash: string; contractEventId: string }) => void)
			| null = null;
		mockWaitForContractCreation.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveContractCreation = resolve;
				})
		);

		const { getByLabelText, getByTestId, findByTestId, findByText, queryByTestId } = renderView(
			baseService,
			baseService.uniqueId
		);

		await openBookNowDrawer(getByTestId);
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		await confirmBookNowEscrow(getByTestId, findByText);

		expect(await findByTestId('service-contract-creation-progress')).toBeTruthy();
		await fireEvent.click(getByLabelText('common.components.drawer.close'));
		await waitFor(() => expect(queryByTestId('service-instant-buy-modal')).toBeNull());

		resolveContractCreation?.({
			escrowId: 'escrow-123',
			transactionHash: '0xtxhash',
			contractEventId: 'contract-escrow-123'
		});

		await waitFor(() => {
			expect(mockShowSuccessToast).toHaveBeenCalledWith(
				'Book Now order confirmed. Your service contract is ready in Contracts.'
			);
		});
		expect(mockGoto).not.toHaveBeenCalled();
	});

	it('allows dismissing the progress drawer by clicking outside while Book Now continues in the background', async () => {
		let resolveContractCreation:
			| ((value: { escrowId: string; transactionHash: string; contractEventId: string }) => void)
			| null = null;
		mockWaitForContractCreation.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveContractCreation = resolve;
				})
		);

		const { container, getByTestId, findByTestId, findByText, queryByTestId } = renderView(
			baseService,
			baseService.uniqueId
		);

		await openBookNowDrawer(getByTestId);
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		await confirmBookNowEscrow(getByTestId, findByText);

		expect(await findByTestId('service-contract-creation-progress')).toBeTruthy();
		const overlay = container.querySelector('[role="presentation"]');
		expect(overlay).toBeTruthy();
		await fireEvent.click(overlay as Element);
		await waitFor(() => expect(queryByTestId('service-instant-buy-modal')).toBeNull());

		resolveContractCreation?.({
			escrowId: 'escrow-123',
			transactionHash: '0xtxhash',
			contractEventId: 'contract-escrow-123'
		});

		await waitFor(() => {
			expect(mockShowSuccessToast).toHaveBeenCalledWith(
				'Book Now order confirmed. Your service contract is ready in Contracts.'
			);
		});
		expect(mockGoto).not.toHaveBeenCalled();
	});

	it('shows Buy Now when fixed-price services rely on instantBuyDeliveryHours instead of pricing.deliveryTime', async () => {
		const instantBuyDeliveryHoursService = {
			...baseService,
			pricing: {
				type: ServicePricingTypeEnum.FIXED,
				currency: 'USDt',
				amount: 200
			},
			instantBuyDeliveryHours: 48
		} as Service;

		mockFindServiceByUniqueId.mockResolvedValue(instantBuyDeliveryHoursService);

		const { getByTestId, getByText } = renderView(
			instantBuyDeliveryHoursService,
			instantBuyDeliveryHoursService.uniqueId
		);

		expect(getByTestId('service-detail-buy-now')).toBeTruthy();
		expect(getByText('dashboard.services.detail.request_quote')).toBeTruthy();
	});

	it('keeps Book Now available for fixed-price services that offer add-ons', async () => {
		const addOnEligibleService = {
			...baseService,
			pricing: {
				type: ServicePricingTypeEnum.FIXED,
				currency: 'USDt',
				amount: 200,
				addOns: [
					{
						id: 'source-files',
						name: 'Source files',
						price: 25,
						description: 'Editable export package.'
					}
				]
			},
			instantBuyDeliveryHours: 48
		} as Service;

		mockFindServiceByUniqueId.mockResolvedValue(addOnEligibleService);

		const { getByTestId, getByText } = renderView(
			addOnEligibleService,
			addOnEligibleService.uniqueId
		);

		expect(getByTestId('service-detail-buy-now')).toBeTruthy();
		expect(getByText('dashboard.services.detail.request_quote')).toBeTruthy();
	});

	it('falls back to Request Quote only when a saved fixed-price service is missing both delivery fields', async () => {
		const missingDeliveryTimeService = {
			...baseService,
			pricing: {
				type: ServicePricingTypeEnum.FIXED,
				currency: 'USDt',
				amount: 200
			},
			instantBuyDeliveryHours: undefined
		} as Service;

		mockFindServiceByUniqueId.mockResolvedValue(missingDeliveryTimeService);

		const { queryByTestId, getByText } = renderView(
			missingDeliveryTimeService,
			missingDeliveryTimeService.uniqueId
		);

		expect(queryByTestId('service-detail-buy-now')).toBeNull();
		expect(getByText('dashboard.services.detail.request_quote')).toBeTruthy();
	});

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
			expect(
				(getByText('dashboard.services.detail.request_quote') as HTMLButtonElement).disabled
			).toBe(true);
		});

		setNavigatorOnline(true);
		window.dispatchEvent(new Event('online'));

		await waitFor(() => {
			expect(getByTestId('service-detail-reconnect-alert')).toBeTruthy();
		});
	});

	it('keeps the instant-buy modal open with offline guidance if the browser disconnects after review opens', async () => {
		const { getByTestId, findByTestId } = renderView(baseService, baseService.uniqueId);

		await openBookNowDrawer(getByTestId);
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();

		setNavigatorOnline(false);
		window.dispatchEvent(new Event('offline'));

		await waitFor(() => {
			expect(getByTestId('service-instant-buy-offline-alert')).toBeTruthy();
			expect((getByTestId('service-instant-buy-confirm') as HTMLButtonElement).disabled).toBe(true);
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
			providerWalletAddress: string;
		};

		mockFindServiceByUniqueId.mockResolvedValue(tieredService);

		const { getByTestId, getByText, findByTestId, findByText } = renderView(
			tieredService,
			tieredService.uniqueId
		);

		const buyNowButton = getByTestId('service-detail-buy-now') as HTMLButtonElement;
		expect(buyNowButton.disabled).toBe(true);
		expect(getByText('dashboard.services.detail.instant_buy.select_tier_required')).toBeTruthy();
		expect(getByText('dashboard.services.detail.request_quote')).toBeTruthy();

		await fireEvent.click(getByText('Premium'));

		expect(buyNowButton.disabled).toBe(false);
		await openBookNowDrawer(getByTestId);

		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		expect((await findByTestId('service-agreement-tier')).textContent).toContain('Premium');
		expect((await findByTestId('service-agreement-scope')).textContent).toContain(
			'Three logo concepts plus brand guide.'
		);

		await confirmBookNowEscrow(getByTestId, findByText);

		await waitFor(() => expect(mockCreateServiceContract).toHaveBeenCalledTimes(1));
		expect(mockCreateServiceContract).toHaveBeenCalledWith(
			expect.objectContaining({
				selectedTierId: 'premium',
				pricingSnapshot: expect.objectContaining({
					tierId: 'premium'
				}),
				agreementSnapshot: expect.objectContaining({
					selectedTierId: 'premium',
					selectedTierLabel: 'Premium'
				})
			})
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
			providerWalletAddress: string;
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

	it('waits for escrow confirmation and opens the exact service contract', async () => {
		const { getByTestId, findByTestId, findByText } = renderView(baseService, baseService.uniqueId);

		await openBookNowDrawer(getByTestId);
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		expect((await findByTestId('service-agreement-provider')).textContent).toContain('Designer');
		expect((await findByTestId('service-agreement-scope')).textContent).toContain(
			'Logo, color palette, and social avatar pack.'
		);
		expect(await findByTestId('service-instant-buy-confirm')).toBeTruthy();

		await confirmBookNowEscrow(getByTestId, findByText);

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
			freelancerAddress: '0x45aFD3daDc7CEfCC6C4B6bAF66299da085583361',
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
				tierId: undefined,
				selectedAddOns: undefined
			},
			agreementSnapshot: {
				deliverables: 'Logo, color palette, and social avatar pack.',
				selectedTierId: undefined,
				selectedTierLabel: undefined,
				selectedAddOns: undefined,
				priceSnapshotRef: '3c4f154d30c3b678787c2d8068e0a5784e4112c17450c6d54c00ab61916dc7ad',
				priceSnapshotLabel: '$200'
			}
		});
		await waitFor(() => {
			expect(mockShowSuccessToast).toHaveBeenCalledWith(
				'Book Now order confirmed. Opening your service contract.'
			);
		});
		await waitFor(() => {
			expect(mockGoto).toHaveBeenCalledWith(
				'/dashboard?tab=contracts&context=services&highlight=escrow-123'
			);
		});
	}, 35_000);

	it('includes selected add-ons in the Book Now total and contract snapshots', async () => {
		const addOnService = {
			...baseService,
			pricing: {
				type: ServicePricingTypeEnum.FIXED,
				currency: 'USDt',
				amount: 200,
				addOns: [
					{
						id: 'source-files',
						name: 'Source files',
						price: 25,
						description: 'Editable export package.'
					}
				]
			},
			instantBuyDeliveryHours: 48
		} as Service;

		mockFindServiceByUniqueId.mockResolvedValue(addOnService);

		const { getByLabelText, getByTestId, findByTestId, findByText } = renderView(
			addOnService,
			addOnService.uniqueId
		);

		await fireEvent.click(getByLabelText('Source files'));
		await openBookNowDrawer(getByTestId);

		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		expect((await findByTestId('service-agreement-base-amount')).textContent).toContain('$225.00');
		expect((await findByTestId('service-agreement-platform-fee')).textContent).toContain('$5.63');
		expect((await findByTestId('service-agreement-gas-fee')).textContent).toContain('$0.50');
		expect((await findByTestId('service-agreement-price')).textContent).toContain('$231.13');

		await confirmBookNowEscrow(getByTestId, findByText);

		await waitFor(() => expect(mockCreateServiceContract).toHaveBeenCalledTimes(1));
		expect(mockCreateServiceContract).toHaveBeenCalledWith({
			freelancerPubkey: 'a'.repeat(64),
			freelancerAddress: '0x45aFD3daDc7CEfCC6C4B6bAF66299da085583361',
			amountUsdt: '225.00',
			estimatedStartTime: 1_700_086_400,
			estimatedCompletionTime: 1_700_259_200,
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
				tierId: undefined,
				selectedAddOns: ['source-files']
			},
			agreementSnapshot: {
				deliverables: 'Logo, color palette, and social avatar pack.',
				selectedTierId: undefined,
				selectedTierLabel: undefined,
				selectedAddOns: ['Source files'],
				priceSnapshotRef: '3c4f154d30c3b678787c2d8068e0a5784e4112c17450c6d54c00ab61916dc7ad',
				priceSnapshotLabel: '$225'
			}
		});
	});

	it('uses the public service location snapshot in the Book Now contract when the exact companion is self-encrypted to the provider', async () => {
		const physicalService = {
			...baseService,
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					useGlobalLocation: false,
					locationDisplayName: 'San Salvador, El Salvador',
					serviceLocation: {
						displayName: 'San Salvador, El Salvador',
						formattedAddress: undefined,
						latitude: 13.6949,
						longitude: -89.2142,
						locationLoaded: true
					}
				}
			}
		} as Service & { instantBuyLeadHours: number };

		mockFindServiceByUniqueId.mockResolvedValue(physicalService);

		const { getByTestId, findByTestId, findByText } = renderView(
			physicalService,
			physicalService.uniqueId
		);

		await openBookNowDrawer(getByTestId);
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();

		await confirmBookNowEscrow(getByTestId, findByText);

		await waitFor(() => expect(mockCreateServiceContract).toHaveBeenCalledTimes(1));
		expect(mockGetExactServiceLocation).not.toHaveBeenCalled();
		expect(mockCreateServiceContract).toHaveBeenCalledWith(
			expect.objectContaining({
				agreementSnapshot: expect.objectContaining({
					serviceLocation: expect.objectContaining({
						mode: 'taskee_location',
						label: 'San Salvador, El Salvador',
						location: expect.objectContaining({
							formattedAddress: undefined,
							latitude: 13.6949,
							longitude: -89.2142
						})
					})
				})
			})
		);
	});

	it('shows the approximate area label and radius for range-based services on the public detail view', () => {
		const rangeService = {
			...baseService,
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					locationDisplayName: 'Denver, CO, US',
					serviceRadius: 5,
					serviceLocation: {
						displayName: 'Denver, CO, US',
						locationLoaded: true,
						zipCode: ''
					}
				}
			}
		} as Service;

		const { getByText } = renderView(rangeService, rangeService.uniqueId);

		expect(getByText('Denver, CO, US')).toBeInTheDocument();
		expect(getByText(/\(Approx\.\)/)).toBeInTheDocument();
		expect(getByText('5 km')).toBeInTheDocument();
	});

	it('verifies wallet balance before enabling Book Now confirmation', async () => {
		const { getByTestId, findByTestId } = renderView(baseService, baseService.uniqueId);

		await openBookNowDrawer(getByTestId);

		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		await waitFor(() => expect(mockPreflightServiceContractCreation).toHaveBeenCalledTimes(1));
		expect(await findByTestId('service-instant-buy-confirm')).not.toBeDisabled();
	});

	it('keeps prepare failures local to the instant-buy modal when the listing changed on the relay', async () => {
		mockFindServiceByUniqueId.mockResolvedValue({
			...baseService,
			id: 'service-event-2'
		});

		const { getByTestId, findByTestId } = renderView(baseService, baseService.uniqueId);

		await openBookNowDrawer(getByTestId);

		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		expect((await findByTestId('service-instant-buy-error')).textContent).toContain(
			'This service was updated. Refresh the page to review the latest details before using Book Now.'
		);
		expect(mockShowErrorToast).not.toHaveBeenCalled();
		expect(mockCreateServiceContract).not.toHaveBeenCalled();
	}, 20_000);

	it('keeps the confirmation modal open when revalidation fails before create', async () => {
		mockFindServiceByUniqueId.mockResolvedValueOnce(baseService).mockResolvedValueOnce({
			...baseService,
			id: 'service-event-2'
		});

		const { getByTestId, findByTestId, findByText } = renderView(baseService, baseService.uniqueId);

		await openBookNowDrawer(getByTestId);
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		await confirmBookNowEscrow(getByTestId, findByText);

		expect(mockCreateServiceContract).not.toHaveBeenCalled();
		expect((await findByTestId('service-instant-buy-error')).textContent).toContain(
			'This service was updated. Refresh the page to review the latest details before using Book Now.'
		);
	}, 20_000);

	it('hides Book Now when the provider wallet is unavailable on the listing', async () => {
		const serviceWithoutWallet = {
			...baseService,
			providerWalletAddress: undefined,
			creator: {
				username: 'Designer',
				avatar: ''
			}
		} as Service & { instantBuyLeadHours: number };
		mockFindServiceByUniqueId.mockResolvedValue(serviceWithoutWallet);

		const { queryByTestId, getByText } = renderView(
			serviceWithoutWallet,
			serviceWithoutWallet.uniqueId
		);

		expect(queryByTestId('service-detail-buy-now')).toBeNull();
		expect(getByText('dashboard.services.detail.request_quote')).toBeTruthy();
		expect(mockPreflightServiceContractCreation).not.toHaveBeenCalled();
		expect(mockCreateServiceContract).not.toHaveBeenCalled();
	});

	it('keeps the modal open on insufficient-funds preflight failures', async () => {
		mockPreflightServiceContractCreation.mockResolvedValueOnce({
			ok: false,
			error: 'Insufficient RBTC balance.',
			errorCode: 'insufficient_funds'
		});

		const { getByTestId, findByTestId } = renderView(baseService, baseService.uniqueId);

		await openBookNowDrawer(getByTestId);
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();

		expect(await findByTestId('service-instant-buy-confirm')).toBeDisabled();
		expect(mockCreateServiceContract).not.toHaveBeenCalled();
		expect((await findByTestId('service-instant-buy-error')).textContent).toContain(
			'Insufficient RBTC balance.'
		);
		expect(mockGoto).not.toHaveBeenCalledWith('/dashboard?tab=contracts&context=services');
	});

	it('shows a wallet connection recovery hint when preflight reports the wallet is disconnected', async () => {
		mockPreflightServiceContractCreation.mockResolvedValueOnce({
			ok: false,
			error: 'Connect your wallet before continuing.',
			errorCode: 'wallet_not_connected'
		});

		const { getByTestId, findByTestId } = renderView(baseService, baseService.uniqueId);

		await openBookNowDrawer(getByTestId);
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();

		expect(await findByTestId('service-instant-buy-confirm')).toBeDisabled();
		expect((await findByTestId('service-instant-buy-error')).textContent).toContain(
			'Connect your wallet before continuing.'
		);
	});

	it('shows a network recovery hint when preflight reports the wrong Rootstock network', async () => {
		mockPreflightServiceContractCreation.mockResolvedValueOnce({
			ok: false,
			error: 'Switch your wallet to Rootstock Testnet before continuing.',
			errorCode: 'wrong_network'
		});

		const { getByTestId, findByTestId } = renderView(baseService, baseService.uniqueId);

		await openBookNowDrawer(getByTestId);
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();

		expect(await findByTestId('service-instant-buy-confirm')).toBeDisabled();
		expect((await findByTestId('service-instant-buy-error')).textContent).toContain(
			'Switch your wallet to Rootstock Testnet before continuing.'
		);
	});

	it('reuses the same instant order id when retrying after a create failure', async () => {
		mockCreateServiceContract
			.mockResolvedValueOnce({
				success: false,
				state: 'funding_failed',
				error: 'Insufficient RBTC balance.',
				errorCode: 'insufficient_funds'
			})
			.mockResolvedValueOnce({
				success: true,
				state: 'funding_submitted',
				transactionHash: '0xtxhash'
			});

		const { getByTestId, findByTestId, findByText } = renderView(baseService, baseService.uniqueId);

		await openBookNowDrawer(getByTestId);
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		await confirmBookNowEscrow(getByTestId, findByText);
		expect((await findByTestId('service-instant-buy-error')).textContent).toContain(
			'Insufficient RBTC balance.'
		);

		await fireEvent.click(getByTestId('service-instant-buy-retry'));
		await confirmBookNowEscrow(getByTestId, findByText);

		await waitFor(() => expect(mockCreateServiceContract).toHaveBeenCalledTimes(2));
		expect(mockCreateServiceContract.mock.calls[0]?.[0].instantOrderId).toBe(
			mockCreateServiceContract.mock.calls[1]?.[0].instantOrderId
		);
	});

	it('redirects unauthenticated buyers to login when they click Buy Now', async () => {
		authStateStore.set({ isAuthenticated: false });

		const { getByTestId } = renderView(baseService, baseService.uniqueId);

		await fireEvent.click(getByTestId('service-detail-buy-now'));

		expect(mockGoto).toHaveBeenCalledWith('/auth/login?returnTo=%2Fservices%2Fservice-123');
		expect(mockCreateServiceContract).not.toHaveBeenCalled();
	});

	it('falls back to the service contracts tab when contract confirmation is still syncing', async () => {
		mockWaitForContractCreation.mockRejectedValueOnce(
			new Error(
				'The secure payment contract transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.'
			)
		);
		mockRecoverBookNowContract.mockResolvedValueOnce({
			status: 'contract_sync_pending',
			transactionHash: '0xtxhash',
			escrowId: 'escrow-123'
		});

		const { getByTestId, findByTestId, findByText } = renderView(baseService, baseService.uniqueId);

		await openBookNowDrawer(getByTestId);
		expect(await findByTestId('service-instant-buy-modal')).toBeTruthy();
		await confirmBookNowEscrow(getByTestId, findByText);

		await waitFor(() =>
			expect(mockShowInfoToast).toHaveBeenCalledWith(
				'The secure payment contract transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.'
			)
		);
		expect(mockRecoverBookNowContract).toHaveBeenCalledWith(
			expect.objectContaining({
				transactionHash: '0xtxhash',
				instantOrderId: 'sib_123e4567e89b12d3',
				amountRbtc: '0.00400000'
			})
		);
		expect(mockWritePendingNavigation).toHaveBeenCalledWith(expect.anything(), '0xtxhash');
		expect(mockClearPendingNavigation).not.toHaveBeenCalled();
		expect(mockGoto).toHaveBeenCalledWith('/dashboard?tab=contracts&context=services');
	});
});
