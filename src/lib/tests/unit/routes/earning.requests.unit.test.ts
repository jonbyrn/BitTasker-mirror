import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import ContractsPanelStub from './fixtures/EarningContractsPanelStub.svelte';
import RequestsPanelStub from './fixtures/EarningRequestsPanelStub.svelte';
import SimplePanelStub from './fixtures/EarningSimplePanelStub.svelte';
import TabsStub from './fixtures/EarningTabsStub.svelte';

const serviceAddress = `30402:${'a'.repeat(64)}:svc-1`;

const hoisted = vi.hoisted(() => {
	let currentUrl = new URL('https://example.test/earning?tab=requests');
	let storeValue = {
		nonBlockingMessageCode: null as string | null
	};
	const storeSubscribers = new Set<(value: typeof storeValue) => void>();

	const serviceQuoteUiStore = {
		subscribe(run: (value: typeof storeValue) => void) {
			run(storeValue);
			storeSubscribers.add(run);
			return () => storeSubscribers.delete(run);
		},
		setNonBlockingMessage(messageCode: string | null) {
			storeValue = {
				...storeValue,
				nonBlockingMessageCode: messageCode
			};
			storeSubscribers.forEach((run) => run(storeValue));
		},
		reset() {
			storeValue = {
				nonBlockingMessageCode: null
			};
			storeSubscribers.forEach((run) => run(storeValue));
		}
	};

	return {
		get currentUrl() {
			return currentUrl;
		},
		setCurrentUrl(url: string) {
			currentUrl = new URL(url);
		},
		mockGoto: vi.fn(),
		serviceQuoteUiStore
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'dashboard.tabs.bids': 'Bids',
		'dashboard.tabs.requests': 'Requests',
		'dashboard.tabs.contracts': 'Contracts',
		'dashboard.tabs.my_services': 'My Services',
		'dashboard.tabs.saved_searches': 'Alerts',
		'dashboard.find_task': 'Find Tasks',
		'dashboard.services.my_services.create_service': 'Create Service',
		'dashboard.earning.title': 'Earning',
		'dashboard.earning.messages.service_requests_request_not_found':
			'The selected service quote thread could not be found.',
		'dashboard.earning.messages.contracts_highlight_not_found':
			'The requested contract highlight could not be found.',
		'dashboard.page.search_icon_alt': 'Search',
		'dashboard.page.wallet_icon_alt': 'Wallet',
		'dashboard.page.plus_icon_alt': 'Create'
	};

	return {
		t: readable((key: string) => translations[key] ?? key)
	};
});

vi.mock('$app/environment', async () => {
	const actual = await vi.importActual<typeof import('$app/environment')>('$app/environment');
	return {
		...actual,
		browser: true,
		dev: false,
		building: false
	};
});

vi.mock('$app/navigation', () => ({
	goto: (...args: Parameters<typeof hoisted.mockGoto>) => hoisted.mockGoto(...args)
}));

vi.mock('$app/state', () => ({
	get page() {
		return {
			url: hoisted.currentUrl
		};
	}
}));

vi.mock('$lib/stores/service-quote-ui.store', () => ({
	buildServiceAddress: (service: { npub: string; uniqueId?: string; id: string }) =>
		`30402:${service.npub}:${service.uniqueId ?? service.id}`,
	serviceQuoteUiStore: hoisted.serviceQuoteUiStore
}));

vi.mock('$lib/components/Tabs.svelte', () => ({ default: TabsStub }));
vi.mock('$lib/components/bidding/DashboardBidsPanel.svelte', () => ({
	default: SimplePanelStub
}));
vi.mock('$lib/components/contracts/DashboardContractsPanel.svelte', () => ({
	default: ContractsPanelStub
}));
vi.mock('$lib/components/task/DashboardSavedSearchesPanel.svelte', () => ({
	default: SimplePanelStub
}));
vi.mock('$lib/components/service/DashboardMyServicesPanel.svelte', () => ({
	default: SimplePanelStub
}));
vi.mock('$lib/components/service/DashboardServiceRequestsPanel.svelte', () => ({
	default: RequestsPanelStub
}));

async function renderEarningPage() {
	const { default: EarningPage } = await import(
		'../../../../routes/(protected)/earning/+page.svelte'
	);
	return render(EarningPage);
}

describe('earning requests route', () => {
	beforeEach(() => {
		cleanup();
		hoisted.mockGoto.mockReset();
		hoisted.serviceQuoteUiStore.reset();
		hoisted.setCurrentUrl('https://example.test/earning?tab=requests');
	});

	it('passes selected service and request route state into the requests panel', async () => {
		hoisted.setCurrentUrl(
			`https://example.test/earning?tab=requests&service=${encodeURIComponent(serviceAddress)}&request=qr_valid_42`
		);

		const { getByTestId } = await renderEarningPage();

		expect(getByTestId('requests-panel-service').textContent).toBe(serviceAddress);
		expect(getByTestId('requests-panel-request').textContent).toBe('qr_valid_42');
	}, 15_000);

	it('clears a focused request without surfacing the missing-request alert', async () => {
		hoisted.setCurrentUrl(
			`https://example.test/earning?tab=requests&service=${encodeURIComponent(serviceAddress)}&request=qr_valid_42`
		);

		const { getByRole, queryByText } = await renderEarningPage();
		await fireEvent.click(getByRole('button', { name: 'Clear request' }));

		await waitFor(() => {
			expect(hoisted.mockGoto).toHaveBeenCalledWith(
				expect.stringContaining(
					`/earning?tab=requests&service=${encodeURIComponent(serviceAddress)}`
				),
				expect.objectContaining({
					replaceState: true,
					keepFocus: true,
					noScroll: true
				})
			);
		});
		expect(hoisted.mockGoto.mock.calls.at(-1)?.[0]).not.toContain('request=');
		expect(queryByText('The selected service quote thread could not be found.')).toBeNull();
	}, 15_000);

	it('shows the missing-request alert and clears only the request parameter', async () => {
		hoisted.setCurrentUrl(
			`https://example.test/earning?tab=requests&service=${encodeURIComponent(serviceAddress)}&request=qr_valid_42`
		);

		const { getByRole, getByText } = await renderEarningPage();
		await fireEvent.click(getByRole('button', { name: 'Report missing request' }));

		await waitFor(() => {
			expect(getByText('The selected service quote thread could not be found.')).toBeTruthy();
		});
		expect(hoisted.mockGoto).toHaveBeenCalledWith(
			expect.stringContaining(
				`/earning?tab=requests&service=${encodeURIComponent(serviceAddress)}`
			),
			expect.objectContaining({
				replaceState: true,
				keepFocus: true,
				noScroll: true
			})
		);
		expect(hoisted.mockGoto.mock.calls.at(-1)?.[0]).not.toContain('request=');
	}, 15_000);

	it('canonicalizes malformed request and service params without surfacing the missing-request alert', async () => {
		hoisted.setCurrentUrl('https://example.test/earning?tab=requests&service=bad&request=bad!');

		const { queryByText } = await renderEarningPage();

		await waitFor(() => {
			expect(hoisted.mockGoto).toHaveBeenCalledWith(
				'https://example.test/earning?tab=requests',
				expect.objectContaining({
					replaceState: true,
					keepFocus: true,
					noScroll: true
				})
			);
		});
		expect(queryByText('The selected service quote thread could not be found.')).toBeNull();
	}, 15_000);

	it('renders the contracts highlight missing alert at the page level', async () => {
		hoisted.setCurrentUrl(
			`https://example.test/earning?tab=contracts&context=services&service=${encodeURIComponent(serviceAddress)}&highlight=escrow-missing`
		);

		const { getByRole, getByText } = await renderEarningPage();
		await fireEvent.click(getByRole('button', { name: 'Report missing contract highlight' }));

		await waitFor(() => {
			expect(getByText('The requested contract highlight could not be found.')).toBeTruthy();
		});
	}, 15_000);

	it('preserves the selected service and clears the request when switching to the Requests tab', async () => {
		hoisted.setCurrentUrl(
			`https://example.test/earning?tab=contracts&context=services&service=${encodeURIComponent(serviceAddress)}&request=qr_valid_42`
		);

		const { getByRole } = await renderEarningPage();
		await fireEvent.click(getByRole('tab', { name: 'Requests' }));

		const lastCall = hoisted.mockGoto.mock.calls.at(-1);
		expect(lastCall).toBeTruthy();
		expect(lastCall?.[0]).toContain(
			`/earning?tab=requests&service=${encodeURIComponent(serviceAddress)}`
		);
		expect(lastCall?.[0]).not.toContain('request=');
		expect(lastCall?.[1]).toEqual(
			expect.objectContaining({
				replaceState: true,
				keepFocus: true,
				noScroll: true
			})
		);
	}, 15_000);
});
