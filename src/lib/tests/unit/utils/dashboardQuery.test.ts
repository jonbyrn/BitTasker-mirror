import { describe, expect, it } from 'vitest';
import {
	buildEarningQueryUrl,
	parseDashboardQuery,
	parseEarningQuery
} from '$lib/utils/dashboardQuery';

const serviceAddress = `30402:${'a'.repeat(64)}:service-123`;

describe('dashboard query helpers', () => {
	it('keeps dashboard task tabs as the default route state', () => {
		const parsed = parseDashboardQuery(new URL('https://bittasker.test/dashboard'));

		expect(parsed).toEqual({
			tab: 'tasks'
		});
	});

	it('defaults the earning route to bids', () => {
		const parsed = parseEarningQuery(new URL('https://bittasker.test/earning'));

		expect(parsed).toEqual({
			tab: 'bids'
		});
	});

	it('maps legacy my-services quote inbox links to the earning requests tab', () => {
		const parsed = parseEarningQuery(
			new URL(
				`https://bittasker.test/earning?tab=my-services&view=quotes&service=${encodeURIComponent(
					serviceAddress
				)}&request=qr_valid123`
			)
		);

		expect(parsed).toEqual({
			tab: 'requests',
			service: serviceAddress,
			request: 'qr_valid123'
		});
	});

	it('builds canonical earning request URLs without legacy view params', () => {
		const url = buildEarningQueryUrl(new URL('https://bittasker.test/earning'), {
			tab: 'requests',
			service: serviceAddress,
			request: 'qr_valid123'
		});

		expect(url).toBe(
			`https://bittasker.test/earning?tab=requests&service=${encodeURIComponent(
				serviceAddress
			)}&request=qr_valid123`
		);
	});

	it('preserves the selected service when clearing a focused earning request', () => {
		const url = buildEarningQueryUrl(
			new URL(
				`https://bittasker.test/earning?tab=requests&service=${encodeURIComponent(
					serviceAddress
				)}&request=qr_valid123`
			),
			{
				tab: 'requests',
				service: serviceAddress,
				request: null
			}
		);

		expect(url).toBe(
			`https://bittasker.test/earning?tab=requests&service=${encodeURIComponent(serviceAddress)}`
		);
	});

	it('parses service-filtered earning contracts routes', () => {
		const parsed = parseEarningQuery(
			new URL(
				`https://bittasker.test/earning?tab=contracts&context=services&service=${encodeURIComponent(
					serviceAddress
				)}&highlight=escrow-123`
			)
		);

		expect(parsed).toEqual({
			tab: 'contracts',
			context: 'services',
			service: serviceAddress,
			highlight: 'escrow-123'
		});
	});

	it('drops malformed service and request params from earning request routes', () => {
		const parsed = parseEarningQuery(
			new URL('https://bittasker.test/earning?tab=requests&service=bad&request=bad!')
		);

		expect(parsed).toEqual({
			tab: 'requests',
			service: null,
			request: null
		});
	});

	it('drops malformed earning request service and request params during parsing', () => {
		const parsed = parseEarningQuery(
			new URL(
				'https://bittasker.test/earning?tab=requests&service=not-a-service-address&request=bad'
			)
		);

		expect(parsed).toEqual({
			tab: 'requests',
			service: null,
			request: null
		});
	});

	it('drops malformed earning contracts service params during parsing', () => {
		const parsed = parseEarningQuery(
			new URL(
				'https://bittasker.test/earning?tab=contracts&context=services&service=not-a-service-address&highlight=escrow-123'
			)
		);

		expect(parsed).toEqual({
			tab: 'contracts',
			context: 'services',
			service: null,
			highlight: 'escrow-123'
		});
	});

	it('builds canonical earning contracts URLs with a selected service filter', () => {
		const url = buildEarningQueryUrl(new URL('https://bittasker.test/earning'), {
			tab: 'contracts',
			context: 'services',
			service: serviceAddress,
			highlight: 'escrow-123'
		});

		expect(url).toBe(
			`https://bittasker.test/earning?tab=contracts&context=services&highlight=escrow-123&service=${encodeURIComponent(
				serviceAddress
			)}`
		);
	});
});
