import { describe, expect, it } from 'vitest';
import {
	createServicesWorkspaceRedirectUrl,
	createServicesWorkspaceRedirectUrlFromLegacyDashboard,
	createServicesWorkspaceUrl,
	parseServicesWorkspaceRouteQuery,
	type ServicesWorkspaceRouteContext
} from '$lib/utils/service-quote/services-workspace-route';

const serviceAddress = `30402:${'a'.repeat(64)}:service-123`;

function createContext(
	overrides: Partial<ServicesWorkspaceRouteContext> = {}
): ServicesWorkspaceRouteContext {
	return {
		providerTimelinesByService: {},
		providerLoadedByService: {},
		providerLoadErrorByService: {},
		focusSync: {
			requestId: null,
			serviceAddress: null,
			expiresAt: null
		},
		...overrides
	};
}

describe('services workspace route helpers', () => {
	it('keeps service-requests routes without a service in all-services mode', () => {
		const parsed = parseServicesWorkspaceRouteQuery(
			new URLSearchParams('tab=service-requests&request=qr_valid123'),
			createContext()
		);

		expect(parsed.state).toEqual({
			tab: 'service-requests',
			serviceAddress: null,
			requestId: 'qr_valid123'
		});
		expect(parsed.changed).toBe(false);
		expect(parsed.searchParams.toString()).toBe('tab=service-requests&request=qr_valid123');
	});

	it('clears stale focused requests in all-services mode after provider timelines are loaded', () => {
		const parsed = parseServicesWorkspaceRouteQuery(
			new URLSearchParams('tab=service-requests&request=qr_valid123'),
			createContext({
				providerLoadedByService: {
					[serviceAddress]: true
				}
			})
		);

		expect(parsed.state).toEqual({
			tab: 'service-requests',
			serviceAddress: null,
			requestId: null
		});
		expect(parsed.messageCode).toBe('service_requests_request_not_found');
		expect(parsed.searchParams.toString()).toBe('tab=service-requests');
	});

	it('clears stale focused requests after provider timelines are loaded', () => {
		const parsed = parseServicesWorkspaceRouteQuery(
			new URLSearchParams(
				`tab=service-requests&service=${encodeURIComponent(serviceAddress)}&request=qr_valid123`
			),
			createContext({
				providerLoadedByService: {
					[serviceAddress]: true
				}
			})
		);

		expect(parsed.state).toEqual({
			tab: 'service-requests',
			serviceAddress,
			requestId: null
		});
		expect(parsed.messageCode).toBe('service_requests_request_not_found');
		expect(parsed.searchParams.toString()).toBe(
			`tab=service-requests&service=${encodeURIComponent(serviceAddress)}`
		);
	});

	it('preserves focused requests while provider quote loading is in an error state', () => {
		const parsed = parseServicesWorkspaceRouteQuery(
			new URLSearchParams(
				`tab=service-requests&service=${encodeURIComponent(serviceAddress)}&request=qr_valid123`
			),
			createContext({
				providerLoadedByService: {
					[serviceAddress]: true
				},
				providerLoadErrorByService: {
					[serviceAddress]: 'provider query failed'
				}
			})
		);

		expect(parsed.state).toEqual({
			tab: 'service-requests',
			serviceAddress,
			requestId: 'qr_valid123'
		});
		expect(parsed.messageCode).toBeNull();
		expect(parsed.changed).toBe(false);
	});

	it('builds services workspace URLs and redirects legacy dashboard provider links', () => {
		const allServicesWorkspaceUrl = createServicesWorkspaceUrl(
			new URL('https://bittasker.test/services/manage?tab=listings'),
			{
				tab: 'service-requests',
				serviceAddress: null,
				requestId: null
			}
		);

		expect(allServicesWorkspaceUrl.toString()).toBe('https://bittasker.test/earning?tab=requests');

		const workspaceUrl = createServicesWorkspaceUrl(
			new URL('https://bittasker.test/services/manage?tab=listings'),
			{
				tab: 'service-requests',
				serviceAddress,
				requestId: 'qr_valid123'
			}
		);

		expect(workspaceUrl.toString()).toBe(
			`https://bittasker.test/earning?tab=requests&service=${encodeURIComponent(
				serviceAddress
			)}&request=qr_valid123`
		);

		const redirected = createServicesWorkspaceRedirectUrlFromLegacyDashboard(
			new URL(
				`https://bittasker.test/dashboard?tab=my-services&view=service-requests&service=${encodeURIComponent(
					serviceAddress
				)}&request=qr_valid123`
			)
		);

		expect(redirected?.toString()).toBe(workspaceUrl.toString());
	});

	it('redirects the legacy services workspace route to earnings', () => {
		const redirected = createServicesWorkspaceRedirectUrl(
			new URL(
				`https://bittasker.test/services/manage?tab=service-requests&service=${encodeURIComponent(
					serviceAddress
				)}&request=qr_valid123`
			)
		);

		expect(redirected.toString()).toBe(
			`https://bittasker.test/earning?tab=requests&service=${encodeURIComponent(
				serviceAddress
			)}&request=qr_valid123`
		);
	});
});
