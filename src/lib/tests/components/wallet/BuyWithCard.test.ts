import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';

const MAINNET = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

vi.mock('$lib/services/feature-flags', () => ({
	isChangellyFiatEnabled: () => true
}));

vi.mock('$lib/stores/wallet/wallet-init', () => ({
	getUtexoWallet: () => ({
		getAddress: async () => MAINNET
	})
}));

import BuyWithCard from '$lib/components/wallet/BuyWithCard.svelte';

describe('Buy with card', () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('quotes a card purchase and opens the provider page for the wallet address', async () => {
		const open = vi.fn();
		window.open = open;
		const fetchMock = vi.fn(async (url: string) => {
			if (String(url).endsWith('/status')) {
				return new Response(JSON.stringify({ configured: true }), { status: 200 });
			}
			if (String(url).endsWith('/countries')) {
				return new Response(
					JSON.stringify({
						countries: [
							{ code: 'US', name: 'United States' },
							{ code: 'SV', name: 'El Salvador' },
							{ code: 'AR', name: 'Argentina' },
							{ code: 'BO', name: 'Bolivia' },
							{ code: 'CO', name: 'Colombia' },
							{ code: 'CR', name: 'Costa Rica' },
							{ code: 'GT', name: 'Guatemala' },
							{ code: 'HN', name: 'Honduras' }
						]
					}),
					{ status: 200 }
				);
			}
			if (url.endsWith('/offers')) {
				return new Response(
					JSON.stringify({
						offers: [
							{
								providerCode: 'moonpay',
								rate: '1',
								invertedRate: '1',
								fee: '2.00',
								amountFrom: '50',
								amountExpectedTo: '0.001',
								paymentMethodOffer: [
									{
										method: 'card',
										methodName: 'Card',
										amountExpectedTo: '0.001',
										fee: '2.00',
										rate: '1',
										invertedRate: '1'
									}
								]
							}
						]
					}),
					{ status: 200 }
				);
			}
			return new Response(
				JSON.stringify({
					orderId: 'order-1',
					redirectUrl: 'https://buy.moonpay.com/test',
					walletAddress: MAINNET,
					providerCode: 'moonpay',
					currencyTo: 'BTC',
					amountFrom: '50'
				}),
				{ status: 200 }
			);
		});
		vi.stubGlobal('fetch', fetchMock);

		const { findByTestId, getByTestId } = render(BuyWithCard);
		expect(await findByTestId('usdt-ramp-note')).toHaveTextContent('RGB');
		expect(await findByTestId('payout-address')).toHaveTextContent(MAINNET);
		expect(await findByTestId('buy-country')).toHaveTextContent('El Salvador');
		await fireEvent.change(getByTestId('buy-country'), { target: { value: 'US' } });
		await fireEvent.input(getByTestId('buy-state'), { target: { value: 'CA' } });
		await fireEvent.click(getByTestId('buy-quote'));
		await waitFor(() => expect(getByTestId('buy-offer')).toBeInTheDocument());
		await fireEvent.click(getByTestId('buy-offer'));
		await waitFor(() =>
			expect(open).toHaveBeenCalledWith(
				'https://buy.moonpay.com/test',
				'_blank',
				'noopener,noreferrer'
			)
		);
		const orderCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/orders'));
		expect(orderCall).toBeTruthy();
		const body = JSON.parse(String((orderCall as [string, RequestInit])[1].body));
		expect(body.walletAddress).toBe(MAINNET);
		expect(body.currencyTo).toBe('BTC');
		expect(body.paymentMethod).toBe('card');
	});

	it('hides See offers and the raw configuration error when the provider is not set up', async () => {
		const fetchMock = vi.fn(async () => {
			return new Response(JSON.stringify({ configured: false }), { status: 200 });
		});
		vi.stubGlobal('fetch', fetchMock);
		const { findByTestId, queryByTestId } = render(BuyWithCard);
		expect(await findByTestId('buy-unconfigured')).toHaveTextContent('Card purchases');
		expect(queryByTestId('buy-quote')).toBeNull();
		expect(queryByTestId('buy-error')).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('closes back to the wallet', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ configured: false }), { status: 200 }))
		);
		const onClose = vi.fn();
		const { findByTestId } = render(BuyWithCard, { props: { onClose } });
		await fireEvent.click(await findByTestId('buy-back'));
		expect(onClose).toHaveBeenCalled();
	});
});
