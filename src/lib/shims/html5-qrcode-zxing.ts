import type { Plugin } from 'vite';

/**
 * html5-qrcode ships ZXing as a UMD file. Vite's production commonjs pass can
 * rewrite `factory(exports)` onto a throwaway object, so `BarcodeFormat` is
 * missing and `new Html5Qrcode()` throws "reading 'QR_CODE'". Turn that file
 * into a plain default export before the commonjs pass sees it.
 */
export function zxingUmdToEsm(code: string): string | null {
	const start = code.indexOf("(function (exports) { 'use strict';");
	const end = code.lastIndexOf('})));');
	if (start < 0 || end < start) return null;
	// The UMD tail is `})));`. Keep the `}` and the `)` that closes `(function (exports)`.
	return `const __zxingExports = {};\n${code.slice(start, end + 2)}(__zxingExports);\nexport default __zxingExports;\n`;
}

export function html5QrcodeZxingEsm(): Plugin {
	return {
		name: 'html5-qrcode-zxing-esm',
		enforce: 'pre',
		transform(code, id) {
			const file = id.replaceAll('\\', '/').split('?')[0];
			if (file.endsWith('/html5-qrcode/third_party/zxing-js.umd.js')) {
				const next = zxingUmdToEsm(code);
				return next ? { code: next, map: null } : null;
			}
			if (file.endsWith('/html5-qrcode/esm/zxing-html5-qrcode-decoder.js')) {
				const needle = 'import * as ZXing from "../third_party/zxing-js.umd"';
				if (!code.includes(needle)) return null;
				return {
					code: code.replace(needle, 'import ZXing from "../third_party/zxing-js.umd"'),
					map: null
				};
			}
			return null;
		}
	};
}
