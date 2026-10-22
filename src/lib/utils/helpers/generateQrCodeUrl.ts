import QRCode from 'qrcode';

export interface QrColors {
	dark?: string;
	light?: string;
}

const LOGO_WAIT_MS = 400;

/**
 * QR pixels come from toDataURL. The SVG logo is drawn only if it loads
 * before LOGO_WAIT_MS. An SVG Image often never fires load or error, which
 * used to leave the share dialog on "Generating QR code…".
 */
export default async function generateQrCodeUrl(data: string, colors?: QrColors): Promise<string> {
	const plain = await QRCode.toDataURL(data, {
		errorCorrectionLevel: 'H',
		margin: 4,
		width: 256,
		color: {
			dark: colors?.dark ?? '#000000',
			light: colors?.light ?? '#FFFFFF'
		}
	});
	if (typeof document === 'undefined') return plain;
	return Promise.race([
		overlayLogo(plain),
		new Promise<string>((resolve) => {
			setTimeout(() => resolve(plain), LOGO_WAIT_MS);
		})
	]);
}

function overlayLogo(dataUrl: string): Promise<string> {
	return new Promise((resolve) => {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			resolve(dataUrl);
			return;
		}
		const qr = new Image();
		qr.onload = () => {
			canvas.width = qr.naturalWidth || qr.width;
			canvas.height = qr.naturalHeight || qr.height;
			ctx.drawImage(qr, 0, 0);
			const logo = new Image();
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
					resolve(canvas.toDataURL());
				} catch {
					resolve(canvas.toDataURL() || dataUrl);
				}
			};
			logo.onerror = () => resolve(canvas.toDataURL() || dataUrl);
			logo.src = '/images/logos/bittasker-logomark.svg';
		};
		qr.onerror = () => resolve(dataUrl);
		qr.src = dataUrl;
	});
}
