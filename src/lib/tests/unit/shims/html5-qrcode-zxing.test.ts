import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { zxingUmdToEsm } from '$lib/shims/html5-qrcode-zxing';

describe('html5-qrcode zxing bundle', () => {
	it('keeps BarcodeFormat.QR_CODE on the default export', async () => {
		const source = readFileSync(
			'node_modules/html5-qrcode/third_party/zxing-js.umd.js',
			'utf8'
		);
		const esm = zxingUmdToEsm(source);
		expect(esm?.startsWith('const __zxingExports = {}')).toBe(true);
		expect(esm?.includes('export default __zxingExports')).toBe(true);
		const loaded = (await import(
			`data:text/javascript,${encodeURIComponent(esm ?? '')}`
		)) as { default: { BarcodeFormat?: { QR_CODE?: number }; MultiFormatReader?: unknown } };
		expect(typeof loaded.default.BarcodeFormat?.QR_CODE).toBe('number');
		expect(typeof loaded.default.MultiFormatReader).toBe('function');
	});
});
