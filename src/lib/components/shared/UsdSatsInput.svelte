<script lang="ts">
	import { SATS_PER_BTC, formatNumberForInput } from '$lib/utils/helpers/crypto';

	export interface UsdInputChangeDetail {
		input: string;
		usdAmount: number;
		sats: number | null;
	}

	export interface SatsInputChangeDetail {
		input: string;
		sats: number;
		usdAmount: number | null;
	}

	const {
		usdAmount = 0,
		btcPrice = 0,
		disabled = false,
		error = null,
		showFieldLabels = true,
		showBtcPrice = true,
		usdOnly = false,
		usdLabel = 'USD',
		satsLabel = 'Sats',
		btcPriceLabel = 'BTC Price',
		usdPlaceholder = '0',
		satsPlaceholder = '0',
		usdInputId = 'usd-sats-input-usd',
		satsInputId = 'usd-sats-input-sats',
		errorClassName = 'label-text-alt mt-1 block text-error',
		btcPriceClassName = 'label-text-alt mt-1 block text-base-content/70',
		class: className = '',
		onUsdChange,
		onSatsChange
	} = $props<{
		usdAmount?: number;
		btcPrice?: number;
		disabled?: boolean;
		error?: string | null;
		showFieldLabels?: boolean;
		showBtcPrice?: boolean;
		usdOnly?: boolean;
		usdLabel?: string;
		satsLabel?: string;
		btcPriceLabel?: string;
		usdPlaceholder?: string;
		satsPlaceholder?: string;
		usdInputId?: string;
		satsInputId?: string;
		errorClassName?: string;
		btcPriceClassName?: string;
		class?: string;
		onUsdChange?: (detail: UsdInputChangeDetail) => void;
		onSatsChange?: (detail: SatsInputChangeDetail) => void;
	}>();

	function sanitizeUsdInput(value: string): string {
		let sanitized = value.replace(/[^0-9.,]/g, '').replace(/,/g, '');
		const decimalIndex = sanitized.indexOf('.');
		if (decimalIndex !== -1) {
			sanitized =
				sanitized.slice(0, decimalIndex + 1) + sanitized.slice(decimalIndex + 1).replace(/\./g, '');
		}

		if (!sanitized) {
			return '';
		}

		if (sanitized.startsWith('.')) {
			sanitized = `0${sanitized}`;
		}

		if (sanitized.includes('.')) {
			const [wholePart, fractionalPart = ''] = sanitized.split('.', 2);
			const normalizedWholePart = normalizeLeadingZeros(wholePart, true);
			return fractionalPart.length > 0
				? `${normalizedWholePart}.${fractionalPart}`
				: `${normalizedWholePart}.`;
		}

		return normalizeLeadingZeros(sanitized, true);
	}

	function sanitizeSatsInput(value: string): string {
		const sanitized = value.replace(/\D/g, '');
		if (!sanitized) {
			return '';
		}

		return normalizeLeadingZeros(sanitized, false);
	}

	function normalizeLeadingZeros(value: string, allowDecimalPrefix: boolean): string {
		if (!value) {
			return '';
		}

		if (/^0+$/.test(value)) {
			return '0';
		}

		const normalized = value.replace(/^0+(?=\d)/, '');
		if (allowDecimalPrefix && normalized === '') {
			return '0';
		}

		return normalized || '0';
	}

	function deriveSats(nextUsdAmount: number, nextBtcPrice: number): number | null {
		if (!(nextBtcPrice > 0)) {
			return nextUsdAmount === 0 ? 0 : null;
		}

		return Math.round((nextUsdAmount / nextBtcPrice) * SATS_PER_BTC);
	}

	function deriveUsd(nextSats: number, nextBtcPrice: number): number | null {
		if (!(nextBtcPrice > 0)) {
			return nextSats === 0 ? 0 : null;
		}

		return parseFloat(((nextSats / SATS_PER_BTC) * nextBtcPrice).toFixed(3));
	}

	function toDisplayUsd(value: number): string {
		return formatNumberForInput(Number.isFinite(value) ? Math.max(value, 0) : 0);
	}

	function toDisplaySats(value: number, nextBtcPrice: number): string {
		if (!(nextBtcPrice > 0)) {
			return value === 0 ? '0' : '';
		}

		return formatNumberForInput(Math.round((value / nextBtcPrice) * SATS_PER_BTC));
	}

	function handleUsdInput(event: Event) {
		const rawValue = (event.target as HTMLInputElement).value;
		const normalizedInput = sanitizeUsdInput(rawValue);
		const parsedUsdAmount = parseFloat(normalizedInput);
		const nextUsdAmount = Number.isFinite(parsedUsdAmount) ? parsedUsdAmount : 0;

		onUsdChange?.({
			input: normalizedInput,
			usdAmount: nextUsdAmount,
			sats: deriveSats(nextUsdAmount, btcPrice)
		});
	}

	function handleSatsInput(event: Event) {
		const rawValue = (event.target as HTMLInputElement).value;
		const normalizedInput = sanitizeSatsInput(rawValue);
		const parsedSats = parseInt(normalizedInput, 10);
		const nextSats = Number.isFinite(parsedSats) ? parsedSats : 0;

		onSatsChange?.({
			input: normalizedInput,
			sats: nextSats,
			usdAmount: deriveUsd(nextSats, btcPrice)
		});
	}

	const normalizedUsdAmount = $derived(Number.isFinite(usdAmount) ? Math.max(usdAmount, 0) : 0);
	const usdDisplayValue = $derived(toDisplayUsd(normalizedUsdAmount));
	const satsDisplayValue = $derived(toDisplaySats(normalizedUsdAmount, btcPrice));
	const hasError = $derived(Boolean(error));
	const adornmentTopClass = $derived(showFieldLabels ? 'top-[3.15rem]' : 'top-1/2');
	const normalizedBtcPriceLabel = $derived(btcPriceLabel.replace(/^current\s+/i, ''));
	const btcPriceCopy = $derived(
		btcPrice > 0
			? `${normalizedBtcPriceLabel} $${Math.round(btcPrice).toLocaleString()}`
			: `${normalizedBtcPriceLabel} unavailable`
	);
</script>

<div class={`w-full ${className}`} data-testid="usd-sats-input">
	{#if showFieldLabels}
		<div class="mb-2 grid grid-cols-2 gap-2">
			<label for={usdInputId} class="label py-0">
				<span class="label-text">{usdLabel}</span>
			</label>
			<div class="flex min-w-0 items-center justify-between gap-2">
				<label for={satsInputId} class="label min-w-0 py-0">
					<span class="label-text">{satsLabel}</span>
				</label>
				{#if showBtcPrice}
					<span
						class={`${btcPriceClassName} mt-0 ml-auto min-w-0 text-right`.trim()}
						data-testid="usd-sats-input-btc-price"
					>
						{btcPriceCopy}
					</span>
				{/if}
			</div>
		</div>
	{/if}

	<div class="flex gap-2">
		{#if usdOnly}
			<div class="relative flex-1">
				<span
					class={`text-base-content/70 absolute left-3 z-10 -translate-y-1/2 ${adornmentTopClass}`.trim()}
				>
					$
				</span>
				<input
					type="text"
					id={usdInputId}
					value={usdDisplayValue}
					oninput={handleUsdInput}
					class={`input input-bordered w-full pl-7 ${hasError ? 'input-error' : ''}`}
					placeholder={usdPlaceholder}
					{disabled}
					inputmode="decimal"
					data-testid="usd-sats-input-usd"
				/>
			</div>
		{:else}
			<div class="relative flex-1">
				<span
					class={`text-base-content/70 absolute left-3 z-10 -translate-y-1/2 ${adornmentTopClass}`.trim()}
				>
					$
				</span>
				<input
					type="text"
					id={usdInputId}
					value={usdDisplayValue}
					oninput={handleUsdInput}
					class={`input input-bordered w-full pl-7 ${hasError ? 'input-error' : ''}`}
					placeholder={usdPlaceholder}
					{disabled}
					inputmode="decimal"
					data-testid="usd-sats-input-usd"
				/>
			</div>

			<div class="relative flex-1">
				<span
					class={`text-base-content/70 absolute right-3 z-10 -translate-y-1/2 ${adornmentTopClass}`.trim()}
				>
					{satsLabel}
				</span>
				<input
					type="text"
					id={satsInputId}
					value={satsDisplayValue}
					oninput={handleSatsInput}
					class={`input input-bordered w-full pr-16 ${hasError ? 'input-error' : ''}`}
					placeholder={satsPlaceholder}
					{disabled}
					inputmode="numeric"
					data-testid="usd-sats-input-sats"
				/>
			</div>
		{/if}
	</div>

	{#if error}
		<span class={errorClassName} data-testid="usd-sats-input-error">
			{error}
		</span>
	{/if}

	{#if !usdOnly && !showFieldLabels && showBtcPrice}
		<span class={btcPriceClassName} data-testid="usd-sats-input-btc-price">
			{btcPriceCopy}
		</span>
	{/if}
</div>
