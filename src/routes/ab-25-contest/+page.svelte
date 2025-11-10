<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';

	let { data } = $props();
	const seo = data.seo;

	// QR code states
	let appQrCode = $state('');
	let primalQrCode = $state('');
	let xQrCode = $state('');

	// Social media URLs
	const primalUrl = 'https://primal.net/p/BitTasker';
	const xUrl = 'https://x.com/BitTaskerDotCom';
	const appUrl = 'https://bittasker.com';

	// Generate QR codes on mount
	onMount(async () => {
		if (typeof window === 'undefined') return;
		try {
			// Generate app QR code with Bitcoin logo
			const appCanvas = document.createElement('canvas');
			await QRCode.toCanvas(appCanvas, appUrl, {
				errorCorrectionLevel: 'H',
				margin: 1,
				width: 300,
				color: {
					dark: '#000000',
					light: '#FFFFFF'
				}
			});

			// Add Bitcoin logo to center of app QR code
			const ctx = appCanvas.getContext('2d');
			if (ctx) {
				const logo = new Image();
				logo.crossOrigin = 'anonymous';
				logo.onload = () => {
					const logoSize = appCanvas.width * 0.2;
					const logoX = (appCanvas.width - logoSize) / 2;
					const logoY = (appCanvas.height - logoSize) / 2;

					// White background circle
					ctx.fillStyle = '#FFFFFF';
					ctx.beginPath();
					ctx.arc(
						appCanvas.width / 2,
						appCanvas.height / 2,
						(logoSize + 8) / 2,
						0,
						2 * Math.PI
					);
					ctx.fill();

					ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
					appQrCode = appCanvas.toDataURL();
				};
				logo.onerror = () => {
					appQrCode = appCanvas.toDataURL();
				};
				logo.src = '/images/Logos/BitTasker-square-logo.svg';
			} else {
				appQrCode = appCanvas.toDataURL();
			}

			// Generate Primal QR code
			const primalCanvas = document.createElement('canvas');
			await QRCode.toCanvas(primalCanvas, primalUrl, {
				errorCorrectionLevel: 'H',
				margin: 1,
				width: 256,
				color: {
					dark: '#000000',
					light: '#FFFFFF'
				}
			});
			primalQrCode = primalCanvas.toDataURL();

			// Generate X QR code
			const xCanvas = document.createElement('canvas');
			await QRCode.toCanvas(xCanvas, xUrl, {
				errorCorrectionLevel: 'H',
				margin: 1,
				width: 256,
				color: {
					dark: '#000000',
					light: '#FFFFFF'
				}
			});
			xQrCode = xCanvas.toDataURL();
		} catch (error) {
			console.error('Failed to generate QR codes:', error);
		}
	});
</script>

<svelte:head>
	<title>{seo.title}</title>
	<meta name="description" content={seo.description} />
	<meta name="keywords" content={seo.keywords} />
	<meta name="author" content="BitTasker" />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href={seo.canonical} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content={seo.canonical} />
	<meta property="og:title" content={seo.ogTitle} />
	<meta property="og:description" content={seo.ogDescription} />
	<meta property="og:image" content={seo.image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="BitTasker Adopting Bitcoin 2025 Contest" />
	<meta property="og:site_name" content="BitTasker" />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={seo.canonical} />
	<meta property="twitter:title" content={seo.twitterTitle} />
	<meta property="twitter:description" content={seo.twitterDescription} />
	<meta property="twitter:image" content={seo.image} />
	<meta property="twitter:image:alt" content="BitTasker Logo" />
	<meta property="twitter:site" content="@BitTaskerDotCom" />
	<meta property="twitter:creator" content="@BitTaskerDotCom" />

	<!-- Structured Data -->
	{@html `<script type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>`}
</svelte:head>

<div class="min-h-screen bg-[#363636] text-white">
	<div class="container mx-auto px-4 py-8 max-w-4xl">
		<!-- Logo and Tagline -->
		<div class="text-center mb-8">
			<Logo class="max-w-xs mx-auto mb-4" />
			<p class="text-primary text-lg font-light">The Decentralized Workforce</p>
		</div>

		<!-- Contest Title -->
		<div class="text-center mb-8">
			<h1 class="text-5xl md:text-6xl font-serif italic mb-2">Who Wants to Be a Millionaire!</h1>
			<p class="text-2xl md:text-3xl text-primary">(in Sats)</p>
		</div>

		<!-- Contest Description -->
		<div class="mb-12 text-center space-y-4">
			<p class="text-lg md:text-xl leading-relaxed">
				That's right, we're giving away <strong class="text-primary">1 Million Sats</strong> to
				whoever completes the most tasks on BitTasker by the end of Adopting Bitcoin!
			</p>
			<p class="text-lg md:text-xl leading-relaxed">
				Create your own Bitcoin circular economy here at Adopting Bitcoin for a chance to win
				<strong class="text-primary">One Million Sats</strong>, delivered directly to your
				non-custodial BitTasker wallet.
			</p>
		</div>

		<!-- Get the App Section -->
		<div class="text-center mb-12">
			<h2 class="text-3xl md:text-4xl font-bold mb-6">Get the App to Play!</h2>
			{#if appQrCode}
				<div class="flex justify-center mb-4">
					<img src={appQrCode} alt="BitTasker App QR Code" class="w-64 h-64" />
				</div>
			{:else}
				<div class="flex justify-center">
					<span class="loading loading-spinner loading-lg"></span>
				</div>
			{/if}
		</div>

		<!-- To Qualify Section -->
		<div class="mb-12">
			<h2 class="text-2xl md:text-3xl font-bold mb-4">To Qualify:</h2>
			<ul class="space-y-3 text-lg">
				<li class="flex items-start">
					<span class="text-primary mr-3">•</span>
					<span>Follow BitTasker on X or Nostr</span>
				</li>
				<li class="flex items-start">
					<span class="text-primary mr-3">•</span>
					<span
						>Post at least <strong>ONE</strong> picture/video of yourself and anyone with a
						BitTasker shirt on X or Nostr</span
					>
				</li>
				<li class="flex items-start">
					<span class="text-primary mr-3">•</span>
					<span>Tag BitTasker in your post</span>
				</li>
			</ul>
		</div>

		<!-- Rules Section -->
		<div class="mb-12">
			<h2 class="text-2xl md:text-3xl font-bold mb-4">Rules:</h2>
			<ul class="space-y-3 text-lg">
				<li class="flex items-start">
					<span class="text-primary mr-3">•</span>
					<span>The person who completes the most tasks on BitTasker wins.</span>
				</li>
				<li class="flex items-start">
					<span class="text-primary mr-3">•</span>
					<span>Both hiring as the Tasker, and being hired as the Taskee, count.</span>
				</li>
				<li class="flex items-start">
					<span class="text-primary mr-3">•</span>
					<span>The tasks must be completed, not in progress.</span>
				</li>
				<li class="flex items-start">
					<span class="text-primary mr-3">•</span>
					<span
						>All tasks must be completed before the After Party, where the winner will be
						determined.</span
					>
				</li>
				<li class="flex items-start">
					<span class="text-primary mr-3">•</span>
					<span
						>In the event of a tie, the person who posted the most BitTasker posts on social
						media wins.</span
					>
				</li>
				<li class="flex items-start">
					<span class="text-primary mr-3">•</span>
					<span>You must be at the After party to receive the prize</span>
				</li>
			</ul>
		</div>

		<!-- Task Ideas Section -->
		<div class="mb-12">
			<h2 class="text-2xl md:text-3xl font-bold mb-4">Task ideas:</h2>
			<ul class="space-y-3 text-lg">
				<li class="flex items-start">
					<span class="text-primary mr-3">•</span>
					<span>Get me a coffee/food/drink</span>
				</li>
				<li class="flex items-start">
					<span class="text-primary mr-3">•</span>
					<span>Take notes/pictures in a session</span>
				</li>
				<li class="flex items-start">
					<span class="text-primary mr-3">•</span>
					<span>Ask a question in a session I can't attend</span>
				</li>
				<li class="flex items-start">
					<span class="text-primary mr-3">•</span>
					<span>Bring a Salvadorian to the event</span>
				</li>
				<li class="flex items-start">
					<span class="text-primary mr-3">•</span>
					<span>Get supplies for a booth or farmers market vendor</span>
				</li>
				<li class="flex items-start">
					<span class="text-primary mr-3">•</span>
					<span>etc</span>
				</li>
			</ul>
		</div>

		<!-- Runner Up Prize Section -->
		<div class="mb-12 text-center">
			<div class="flex justify-center mb-6">
				<img
					src="/images/contest/bitcoin-ring.png"
					alt="Custom-made Gold Bitcoin Ring"
					class="max-w-md w-full rounded-lg shadow-xl"
				/>
			</div>
			<p class="text-xl md:text-2xl font-serif leading-relaxed">
				Runner up prize: A Custom-made Gold Bitcoin Ring! Show Your Love of Freedom with Some
				Bling!
			</p>
		</div>

		<!-- Social Media Follow Sections -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
			<!-- Primal.net -->
			<div class="text-center">
				<p class="text-lg mb-4">Follow @BitTasker on Primal.net:</p>
				{#if primalQrCode}
					<div class="flex justify-center">
						<img src={primalQrCode} alt="Primal.net QR Code" class="w-48 h-48" />
					</div>
				{:else}
					<div class="flex justify-center">
						<span class="loading loading-spinner"></span>
					</div>
				{/if}
			</div>

			<!-- X (Twitter) -->
			<div class="text-center">
				<p class="text-lg mb-4">Follow @BitTaskerDotCom on X:</p>
				{#if xQrCode}
					<div class="flex justify-center">
						<img src={xQrCode} alt="X QR Code" class="w-48 h-48" />
					</div>
				{:else}
					<div class="flex justify-center">
						<span class="loading loading-spinner"></span>
					</div>
				{/if}
			</div>
		</div>

		<!-- Website URL -->
		<div class="text-center">
			<a
				href="https://bittasker.com"
				target="_blank"
				rel="noopener noreferrer"
				class="text-primary text-lg hover:underline"
			>
				https://bittasker.com
			</a>
		</div>
	</div>
</div>

