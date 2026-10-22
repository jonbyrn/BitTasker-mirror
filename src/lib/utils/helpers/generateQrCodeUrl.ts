import QRCode from 'qrcode';

export interface QrColors {
	dark?: string;
	light?: string;
}

const LOGO_SRC = '/images/logos/bittasker-logomark.svg';
/** A missing logo must not hide the code. Some WebViews never fire the SVG load event. */
const LOGO_WAIT_MS = 400;

export default async function generateQrCodeUrl(data: string, colors?: QrColors): Promise<string> {
	const options = {
		errorCorrectionLevel: 'H' as const,
		margin: 4,
		width: 256,
		color: {
			dark: colors?.dark ?? '#000000',
			light: colors?.light ?? '#FFFFFF'
		}
	};

	if (typeof document === 'undefined') {
		return QRCode.toDataURL(data, options);
	}

	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) return QRCode.toDataURL(data, options);

	try {
		await QRCode.toCanvas(canvas, data, options);
	} catch (err) {
		console.error('Failed to generate QR code:', err);
		return QRCode.toDataURL(data, options);
	}

	return overlayLogo(canvas, ctx, canvas.toDataURL());
}

function overlayLogo(
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
	plain: string
): Promise<string> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (url: string) => {
			if (settled) return;
			settled = true;
			resolve(url);
		};
		const timer = setTimeout(() => finish(plain), LOGO_WAIT_MS);
		try {
			const logo = new Image();
			logo.crossOrigin = 'anonymous';
			logo.onload = () => {
				try {
					const logoSize = canvas.width * 0.2;
					const logoX = (canvas.width - logoSize) / 2;
					const logoY = (canvas.height - logoSize) / 2;
					const padding = 8;
					ctx.fillStyle = '#FFFFFF';
					ctx.beginPath();
					ctx.arc(canvas.width / 2, canvas.height / 2, (logoSize + padding) / 2, 0, 2 * Math.PI);
					ctx.fill();
					ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
					clearTimeout(timer);
					finish(canvas.toDataURL());
				} catch (err) {
					console.error('Failed to draw logo on QR code:', err);
					clearTimeout(timer);
					finish(plain);
				}
			};
			logo.onerror = () => {
				clearTimeout(timer);
				finish(plain);
			};
			logo.src = LOGO_SRC;
		} catch (err) {
			console.error('Failed to load logo, using QR code without logo', err);
			clearTimeout(timer);
			finish(plain);
		}
	});
}
