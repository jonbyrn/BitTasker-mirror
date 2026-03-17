import { parseServiceAddress } from '$lib/utils/service-quote/protocol';

const IDENTIFIER_RE = /^[A-Za-z0-9_-]{1,128}$/;

export interface ServiceQuoteReentryState {
	openRequestQuote: boolean;
	tierId?: string;
	selectedAddOnIds: string[];
}

function normalizeIdentifier(value: string | null | undefined): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmedValue = value.trim();
	if (!trimmedValue || !IDENTIFIER_RE.test(trimmedValue)) {
		return null;
	}

	return trimmedValue;
}

function normalizeIdentifiers(values: Iterable<string>): string[] {
	return Array.from(
		new Set(
			Array.from(values)
				.map((value) => normalizeIdentifier(value))
				.filter((value): value is string => value !== null)
		)
	);
}

export function buildServiceQuoteReentryUrl(
	serviceAddress: string,
	state: Partial<ServiceQuoteReentryState> = {}
): string {
	const { dTag } = parseServiceAddress(serviceAddress);
	const url = new URL(`/services/${encodeURIComponent(dTag)}`, 'https://bittasker.test');

	if (state.openRequestQuote !== false) {
		url.searchParams.set('quote', 'request');
	}

	const tierId = normalizeIdentifier(state.tierId);
	if (tierId) {
		url.searchParams.set('tier', tierId);
	}

	const selectedAddOnIds = normalizeIdentifiers(state.selectedAddOnIds ?? []);
	if (selectedAddOnIds.length > 0) {
		url.searchParams.set('addons', selectedAddOnIds.join(','));
	}

	return `${url.pathname}${url.search}`;
}

export function parseServiceQuoteReentryState(input: URL): ServiceQuoteReentryState {
	const tierId = normalizeIdentifier(input.searchParams.get('tier') ?? undefined) ?? undefined;
	const selectedAddOnIds = normalizeIdentifiers(
		(input.searchParams.get('addons') ?? '')
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean)
	);

	return {
		openRequestQuote: input.searchParams.get('quote') === 'request',
		tierId,
		selectedAddOnIds
	};
}

export function clearServiceQuoteReentryState(input: URL): URL {
	const nextUrl = new URL(input.toString());
	nextUrl.searchParams.delete('quote');
	nextUrl.searchParams.delete('tier');
	nextUrl.searchParams.delete('addons');
	return nextUrl;
}
