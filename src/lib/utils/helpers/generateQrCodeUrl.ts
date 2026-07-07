import QRCode from 'qrcode';

export interface QrColors {
	dark?: string;
	light?: string;
}

export default async function generateQrCodeUrl(data: string, colors?: QrColors): Promise<string> {
	try {
		let qrCodeDataUrl = '';

		// Create canvas for custom QR code with logo
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');

		if (!ctx) {
			console.error('Failed to get canvas context');
			throw new Error('Failed to get canvas context');
		}

		// Generate QR code with higher error correction for logo overlay
		await QRCode.toCanvas(canvas, data, {
			errorCorrectionLevel: 'H', // High error correction for logo overlay
			margin: 4, // Quiet zone (4 modules) for better scanning reliability
			width: 256,
			color: {
				dark: colors?.dark ?? '#000000',
				light: colors?.light ?? '#FFFFFF'
			}
		});

		// Load BitTasker logo
		const logo = new Image();
		logo.crossOrigin = 'anonymous';

		return new Promise<string>((resolve) => {
			logo.onload = () => {
				try {
					// Calculate logo size (about 20% of QR code)
					const logoSize = canvas.width * 0.2;
					const logoX = (canvas.width - logoSize) / 2;
					const logoY = (canvas.height - logoSize) / 2;

					// Draw white background circle for logo
					const padding = 8;
					ctx.fillStyle = '#FFFFFF';
					ctx.beginPath();
					ctx.arc(canvas.width / 2, canvas.height / 2, (logoSize + padding) / 2, 0, 2 * Math.PI);
					ctx.fill();

					// Draw logo
					ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);

					// Convert to data URL
					qrCodeDataUrl = canvas.toDataURL();
					resolve(qrCodeDataUrl);
				} catch (err) {
					console.error('Failed to draw logo on QR code:', err);
					// Fallback to QR code without logo
					qrCodeDataUrl = canvas.toDataURL();
					resolve(qrCodeDataUrl);
				}
			};

			logo.onerror = () => {
				console.error('Failed to load logo, using QR code without logo');
				qrCodeDataUrl = canvas.toDataURL();
				resolve(qrCodeDataUrl);
			};

			// Load the logo
			logo.src = '/images/logos/bittasker-logomark.svg';
		});
	} catch (err) {
		console.error('Failed to generate QR code:', err);
		throw new Error(err instanceof Error ? err.message : 'Failed to generate QR code');
	}
}
