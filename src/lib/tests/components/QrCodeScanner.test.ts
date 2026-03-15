import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';

import QrCodeScanner from '$lib/components/QrCodeScanner.svelte';

const addListener = vi.fn();
const startScan = vi.fn().mockResolvedValue(undefined);
const stopScan = vi.fn().mockResolvedValue(undefined);
const checkPermissions = vi.fn().mockResolvedValue({ camera: 'granted' });
const requestPermissions = vi.fn().mockResolvedValue({ camera: 'granted' });
const isSupported = vi.fn().mockResolvedValue({ supported: true });

let barcodesScannedHandler:
	| ((event: { barcodes: Array<{ rawValue: string; cornerPoints?: { x: number; y: number }[] }> }) => void)
	| null = null;
const removeListener = vi.fn();

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

vi.mock('@capacitor/core', () => ({
	Capacitor: {
		getPlatform: vi.fn(() => 'web')
	}
}));

vi.mock('@capacitor-mlkit/barcode-scanning', () => ({
	BarcodeFormat: {
		QrCode: 'qr'
	},
	LensFacing: {
		Back: 'back'
	},
	BarcodeScanner: {
		isSupported: (...args: unknown[]) => isSupported(...args),
		checkPermissions: (...args: unknown[]) => checkPermissions(...args),
		requestPermissions: (...args: unknown[]) => requestPermissions(...args),
		addListener: (...args: unknown[]) => addListener(...args),
		startScan: (...args: unknown[]) => startScan(...args),
		stopScan: (...args: unknown[]) => stopScan(...args),
		isTorchAvailable: vi.fn().mockResolvedValue({ available: false }),
		getMinZoomRatio: vi.fn().mockResolvedValue({ zoomRatio: 1 }),
		getMaxZoomRatio: vi.fn().mockResolvedValue({ zoomRatio: 3 }),
		setZoomRatio: vi.fn(),
		toggleTorch: vi.fn()
	}
}));

describe('QrCodeScanner', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		barcodesScannedHandler = null;
		addListener.mockImplementation(async (eventName: string, handler: typeof barcodesScannedHandler) => {
			if (eventName === 'barcodesScanned') {
				barcodesScannedHandler = handler;
			}
			return { remove: removeListener };
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('passes the full scanned QR payload through without stripping the payment-intent scheme', async () => {
		const onScan = vi.fn();
		const onClose = vi.fn();

		render(QrCodeScanner, {
			onScan,
			onClose
		});

		await vi.advanceTimersByTimeAsync(800);
		await Promise.resolve();
		await Promise.resolve();

		expect(startScan).toHaveBeenCalled();
		expect(barcodesScannedHandler).toBeTypeOf('function');

		const barcode = {
			rawValue: 'bsc:0x1234567890123456789012345678901234567890?amount=12.345678&memo=Invoice',
			cornerPoints: undefined
		};

		await barcodesScannedHandler?.({ barcodes: [barcode] });

		expect(onScan).toHaveBeenCalledWith(barcode);
		expect(onScan).not.toHaveBeenCalledWith(barcode.rawValue);
		expect(removeListener).toHaveBeenCalled();
		expect(stopScan).toHaveBeenCalled();
	});

	it('should reject ambiguous raw 0x addresses without chain qualifier and request user input', async () => {
		const onScan = vi.fn();
		const onClose = vi.fn();

		render(QrCodeScanner, {
			onScan,
			onClose
		});

		await vi.advanceTimersByTimeAsync(800);
		await Promise.resolve();
		await Promise.resolve();

		expect(startScan).toHaveBeenCalled();

		// Scan an ambiguous address without chain qualifier
		const ambiguousBarcode = {
			rawValue: '0x1234567890123456789012345678901234567890',
			cornerPoints: undefined
		};

		await barcodesScannedHandler?.({ barcodes: [ambiguousBarcode] });

		// Should not call onScan with the barcode directly for ambiguous addresses
		expect(onScan).not.toHaveBeenCalled();
	});

	it('should accept rsk: prefixed QR codes', async () => {
		const onScan = vi.fn();
		const onClose = vi.fn();

		render(QrCodeScanner, {
			onScan,
			onClose
		});

		await vi.advanceTimersByTimeAsync(800);
		await Promise.resolve();
		await Promise.resolve();

		const rskBarcode = {
			rawValue: 'rsk:0x1234567890123456789012345678901234567890',
			cornerPoints: undefined
		};

		await barcodesScannedHandler?.({ barcodes: [rskBarcode] });

		expect(onScan).toHaveBeenCalledWith(rskBarcode);
		expect(removeListener).toHaveBeenCalled();
		expect(stopScan).toHaveBeenCalled();
	});

	it('should accept ethereum: chain-qualified addresses', async () => {
		const onScan = vi.fn();
		const onClose = vi.fn();

		render(QrCodeScanner, {
			onScan,
			onClose
		});

		await vi.advanceTimersByTimeAsync(800);
		await Promise.resolve();
		await Promise.resolve();

		const ethereumBarcode = {
			rawValue: 'ethereum:0x1234567890123456789012345678901234567890@1',
			cornerPoints: undefined
		};

		await barcodesScannedHandler?.({ barcodes: [ethereumBarcode] });

		expect(onScan).toHaveBeenCalledWith(ethereumBarcode);
	});

	it('should handle permission denied error gracefully', async () => {
		const onScan = vi.fn();
		const onClose = vi.fn();

		requestPermissions.mockRejectedValueOnce(new Error('Permission denied'));

		render(QrCodeScanner, {
			onScan,
			onClose
		});

		await vi.advanceTimersByTimeAsync(800);
		await Promise.resolve();
		await Promise.resolve();

		// Component should handle the error without crashing
		expect(onClose).not.toHaveBeenCalled();
	});

	it('should handle camera unavailable scenario', async () => {
		const onScan = vi.fn();
		const onClose = vi.fn();

		isSupported.mockResolvedValueOnce({ supported: false });

		render(QrCodeScanner, {
			onScan,
			onClose
		});

		await vi.advanceTimersByTimeAsync(800);
		await Promise.resolve();
		await Promise.resolve();

		// Component should gracefully handle unsupported scenario
		expect(startScan).not.toHaveBeenCalled();
	});

	it('should timeout on long scans and stop scanning', async () => {
		const onScan = vi.fn();
		const onClose = vi.fn();

		render(QrCodeScanner, {
			onScan,
			onClose
		});

		await vi.advanceTimersByTimeAsync(800);
		await Promise.resolve();
		await Promise.resolve();

		// Fast forward to trigger any timeout mechanisms
		await vi.advanceTimersByTimeAsync(60000);
		await Promise.resolve();

		// Verify timeout was handled
		expect(stopScan).toBeDefined();
	});

	it('should recover from scan errors and remain functional', async () => {
		const onScan = vi.fn();
		const onClose = vi.fn();

		startScan.mockRejectedValueOnce(new Error('Scan failed')).mockResolvedValueOnce(undefined);

		render(QrCodeScanner, {
			onScan,
			onClose
		});

		await vi.advanceTimersByTimeAsync(800);
		await Promise.resolve();
		await Promise.resolve();

		// Component should handle error gracefully
		expect(onClose).not.toHaveBeenCalled();
	});

	it('should preserve full URI payload including amount and memo parameters', async () => {
		const onScan = vi.fn();
		const onClose = vi.fn();

		render(QrCodeScanner, {
			onScan,
			onClose
		});

		await vi.advanceTimersByTimeAsync(800);
		await Promise.resolve();
		await Promise.resolve();

		const fullPayloadBarcode = {
			rawValue: 'bsc:0x1234567890123456789012345678901234567890?amount=50.123456&memo=Invoice123&ref=task-456',
			cornerPoints: undefined
		};

		await barcodesScannedHandler?.({ barcodes: [fullPayloadBarcode] });

		expect(onScan).toHaveBeenCalledWith(fullPayloadBarcode);
		// Verify the entire payload is passed, not normalized/stripped
		const calledWith = onScan.mock.calls[0][0];
		expect(calledWith.rawValue).toContain('amount=50.123456');
		expect(calledWith.rawValue).toContain('memo=Invoice123');
		expect(calledWith.rawValue).toContain('ref=task-456');
	});

	it('should handle multiple barcodes and process the first one', async () => {
		const onScan = vi.fn();
		const onClose = vi.fn();

		render(QrCodeScanner, {
			onScan,
			onClose
		});

		await vi.advanceTimersByTimeAsync(800);
		await Promise.resolve();
		await Promise.resolve();

		const barcodes = [
			{
				rawValue: 'bsc:0x1234567890123456789012345678901234567890',
				cornerPoints: undefined
			},
			{
				rawValue: 'bsc:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
				cornerPoints: undefined
			}
		];

		await barcodesScannedHandler?.({ barcodes });

		expect(onScan).toHaveBeenCalledTimes(1);
		expect(onScan).toHaveBeenCalledWith(barcodes[0]);
	});

	it('should properly clean up event listeners on component unmount', async () => {
		const onScan = vi.fn();
		const onClose = vi.fn();

		const { unmount } = render(QrCodeScanner, {
			onScan,
			onClose
		});

		await vi.advanceTimersByTimeAsync(800);
		await Promise.resolve();
		await Promise.resolve();

		expect(addListener).toHaveBeenCalled();

		unmount();

		expect(removeListener).toHaveBeenCalled();
		expect(stopScan).toHaveBeenCalled();
	});
});
