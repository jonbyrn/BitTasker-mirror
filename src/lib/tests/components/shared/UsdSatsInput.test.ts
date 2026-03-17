import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import UsdSatsInput from '$lib/components/shared/UsdSatsInput.svelte';

describe('UsdSatsInput', () => {
	it('renders paired USD and sats inputs with BTC price and derived sats display', () => {
		render(UsdSatsInput, {
			usdAmount: 125,
			btcPrice: 50_000
		});

		expect(screen.getByLabelText('USD')).toHaveValue('125');
		expect(screen.getByLabelText('Sats')).toHaveValue('250,000');
		expect(screen.getByTestId('usd-sats-input-btc-price')).toHaveTextContent(
			'BTC Price $50,000'
		);
	});

	it('sanitizes USD input, normalizes leading zeros, and emits the derived sats callback payload', async () => {
		const onUsdChange = vi.fn();

		render(UsdSatsInput, {
			usdAmount: 0,
			btcPrice: 50_000,
			onUsdChange
		});

		await fireEvent.input(screen.getByLabelText('USD'), {
			target: { value: '$00012abc.3400' }
		});

		expect(onUsdChange).toHaveBeenCalledWith({
			input: '12.3400',
			usdAmount: 12.34,
			sats: 24_680
		});
	});

	it('sanitizes sats input, normalizes leading zeros, and emits the derived USD callback payload', async () => {
		const onSatsChange = vi.fn();

		render(UsdSatsInput, {
			usdAmount: 0,
			btcPrice: 50_000,
			onSatsChange
		});

		await fireEvent.input(screen.getByLabelText('Sats'), {
			target: { value: '00,0123abc.45' }
		});

		expect(onSatsChange).toHaveBeenCalledWith({
			input: '12345',
			sats: 12_345,
			usdAmount: 6.172
		});
	});

	it('fails closed on positive sats conversion when BTC price is unavailable but still allows zero', async () => {
		const onSatsChange = vi.fn();

		render(UsdSatsInput, {
			usdAmount: 5,
			btcPrice: 0,
			onSatsChange
		});

		expect(screen.getByTestId('usd-sats-input-btc-price')).toHaveTextContent(
			'BTC Price unavailable'
		);
		expect(screen.getByLabelText('Sats')).toHaveValue('');

		await fireEvent.input(screen.getByLabelText('Sats'), {
			target: { value: '0002500' }
		});
		expect(onSatsChange).toHaveBeenLastCalledWith({
			input: '2500',
			sats: 2_500,
			usdAmount: null
		});

		await fireEvent.input(screen.getByLabelText('Sats'), {
			target: { value: '0000' }
		});
		expect(onSatsChange).toHaveBeenLastCalledWith({
			input: '0',
			sats: 0,
			usdAmount: 0
		});
	});

	it('supports disabled and error presentation without losing current formatted values', () => {
		render(UsdSatsInput, {
			usdAmount: 99.5,
			btcPrice: 40_000,
			disabled: true,
			error: 'Amount is required.'
		});

		expect(screen.getByLabelText('USD')).toBeDisabled();
		expect(screen.getByLabelText('Sats')).toBeDisabled();
		expect(screen.getByLabelText('USD')).toHaveClass('input-error');
		expect(screen.getByLabelText('Sats')).toHaveClass('input-error');
		expect(screen.getByTestId('usd-sats-input-error')).toHaveTextContent(
			'Amount is required.'
		);
		expect(screen.getByLabelText('USD')).toHaveValue('99.5');
		expect(screen.getByLabelText('Sats')).toHaveValue('248,750');
	});
});
