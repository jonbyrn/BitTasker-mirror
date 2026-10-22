<script lang="ts">
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { t } from 'svelte-i18n';
	import IconEmailOutline from '~icons/mdi/email-outline';

	let { data: seo } = $props();

	const user = 'hello';
	const domain = 'bittasker.com';
	const mailtoHref = `mailto:${user}@${domain}`;

	// State to track which security best practice is open
	let openPractice = $state(-1);

	function togglePractice(index: number) {
		if (openPractice === index) {
			openPractice = -1; // Close if already open
		} else {
			openPractice = index; // Open the new one
		}
	}
</script>

<svelte:head>
	<DocumentTitle fallback={seo.title} />
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

	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Security & Safety - BitTasker" />
	<meta property="og:site_name" content="BitTasker" />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={seo.canonical} />
	<meta property="twitter:title" content={seo.twitterTitle} />
	<meta property="twitter:description" content={seo.twitterDescription} />

	<meta property="twitter:image:alt" content="BitTasker Logo" />
	<meta property="twitter:site" content="@BitTaskerdotcom" />
	<meta property="twitter:creator" content="@BitTaskerdotcom" />

	<!-- Structured Data -->
	{@html `<script type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>`}
</svelte:head>

<div class="w-full">
	<section class="hero bg-base-100 text-base-content min-h-[60vh] pb-12">
		<div class="hero-content flex-col text-center">
			<Logo />
			<div class="max-w-3xl">
				<h1>{$t('about.security.title')}</h1>
				<p class="text-base-content/80 py-6 text-lg">
					{$t('about.security.description')}
				</p>
			</div>
		</div>
	</section>

	<!-- Security Overview -->
	<div class="prose mx-auto max-w-6xl my-16 px-8">
		<div class="mb-8 text-center">
			<h3>{$t('about.security_approach.title')}</h3>
			<p class="text-base-content/80 py-6 text-lg">
				{$t('about.security_approach.description')}
			</p>

			<div class="alert alert-warning alert-outline mt-8">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z"
					></path>
				</svg>
				<div>
					<p class="font-medium">{$t('about.security_approach.alert_title')}</p>
					<p class="text-sm">
						{$t('about.security_approach.alert_text')}
					</p>
				</div>
			</div>
		</div>

		<!-- Security Features -->
		<div class="mt-6 grid gap-6 md:grid-cols-2">
			<!-- Passkeys -->
			<div class="card bg-base-100 border-base-300 border shadow-lg">
				<div class="card-body p-6 pb-6">
					<h3 class="card-title mt-2">
						{$t('about.security_passkeys.title')}
					</h3>
					<p>
						{$t('about.security_passkeys.description')}
					</p>
					<ul class="mt-2 ml-5 list-disc">
						<li>{$t('about.security_passkeys.point_1')}</li>
						<li>{$t('about.security_passkeys.point_2')}</li>
						<li>{$t('about.security_passkeys.point_3')}</li>
						<li>{$t('about.security_passkeys.point_4')}</li>
					</ul>
					<div class="alert alert-info alert-outline mt-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							class="h-6 w-6 shrink-0 stroke-current"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							></path>
						</svg>
						<span class="text-sm">
							<strong>{$t('about.security_passkeys.alert_title')}:</strong>
							{$t('about.security_passkeys.alert_text')}
						</span>
					</div>
				</div>
			</div>

			<!-- Account Recovery -->
			<div class="card bg-base-100 border-base-300 border shadow-lg">
				<div class="card-body p-6 pb-6">
					<h3 class="card-title mt-2">
						{$t('about.security_recovery.title')}
					</h3>
					<p>{$t('about.security_recovery.description')}</p>
					<ul class="mt-2 ml-5 list-disc">
						<li>{$t('about.security_recovery.point_1')}</li>
						<li>{$t('about.security_recovery.point_2')}</li>
						<li>{$t('about.security_recovery.point_3')}</li>
						<li>{$t('about.security_recovery.point_4')}</li>
					</ul>
					<div class="alert alert-info alert-outline mt-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							class="h-6 w-6 shrink-0 stroke-current"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span class="text-sm"
							><strong>{$t('about.security_recovery.alert_title')}:</strong>
							{$t('about.security_recovery.alert_text')}</span
						>
					</div>
				</div>
			</div>

			<!-- Client-Side Encryption -->
			<div class="card bg-base-100 border-base-300 border shadow-lg">
				<div class="card-body p-6 pb-6">
					<h3 class="card-title mt-2">
						{$t('about.security_encryption.title')}
					</h3>
					<p>{$t('about.security_encryption.description')}</p>
					<ul class="mt-2 ml-5 list-disc">
						<li>{$t('about.security_encryption.point_1')}</li>
						<li>{$t('about.security_encryption.point_2')}</li>
						<li>{$t('about.security_encryption.point_3')}</li>
						<li>{$t('about.security_encryption.point_4')}</li>
					</ul>
					<div class="alert alert-info alert-outline mt-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							class="h-6 w-6 shrink-0 stroke-current"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span class="text-sm"
							><strong>{$t('about.security_encryption.alert_title')}:</strong>
							{$t('about.security_encryption.alert_text')}</span
						>
					</div>
				</div>
			</div>

			<!-- Bitcoin Wallet Security -->
			<div class="card bg-base-100 border-base-300 border shadow-lg">
				<div class="card-body p-6 pb-6">
					<h3 class="card-title mt-2">
						{$t('about.security_wallet.title')}
					</h3>
					<p>{$t('about.security_wallet.description')}</p>
					<ul class="mt-2 ml-5 list-disc">
						<li>{$t('about.security_wallet.point_1')}</li>
						<li>{$t('about.security_wallet.point_2')}</li>
						<li>{$t('about.security_wallet.point_3')}</li>
						<li>{$t('about.security_wallet.point_4')}</li>
					</ul>
					<div class="alert alert-warning alert-outline mt-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z"
							/>
						</svg>
						<span class="text-sm"
							><strong>{$t('about.security_wallet.alert_title')}:</strong>
							{$t('about.security_wallet.alert_text')}</span
						>
					</div>
				</div>
			</div>
		</div>

		<!-- Additional Security Measures -->
		<div class="mt-12">
			<h3 class="mb-6 text-center">{$t('about.additional_security.title')}</h3>

			<!-- Decentralized Identity -->
			<div class="card bg-base-100 border-base-300 mb-6 border shadow-lg">
				<div class="card-body p-6 pb-6">
					<h3 class="card-title mt-2">{$t('about.additional_security.identity_title')}</h3>
					<p>{$t('about.additional_security.identity_description')}</p>
					<div class="alert alert-info alert-outline mt-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							class="h-6 w-6 shrink-0 stroke-current"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{$t('about.additional_security.identity_alert')}</span>
					</div>
				</div>
			</div>

			<!-- Escrow System Security -->
			<div class="card bg-base-100 border-base-300 mb-6 border shadow-lg">
				<div class="card-body p-6 pb-6">
					<h3 class="card-title mt-2">{$t('about.additional_security.escrow_title')}</h3>
					<p>{$t('about.additional_security.escrow_description')}</p>
					<div class="alert alert-info alert-outline mt-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							class="h-6 w-6 shrink-0 stroke-current"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{$t('about.additional_security.escrow_alert')}</span>
					</div>
				</div>
			</div>

			<!-- Privacy-Focused Communication -->
			<div class="card bg-base-100 border-base-300 border shadow-lg">
				<div class="card-body p-6 pb-6">
					<h3 class="card-title mt-2">{$t('about.additional_security.privacy_title')}</h3>
					<p>{$t('about.additional_security.privacy_description')}</p>
					<div class="alert alert-info alert-outline mt-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							class="h-6 w-6 shrink-0 stroke-current"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{$t('about.additional_security.privacy_alert')}</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Security Best Practices -->
		<div class="mt-12">
			<h3 class="mb-6 text-center">{$t('about.security_practices.title')}</h3>

			<div class="alert alert-warning alert-outline mb-8">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z"
					/>
				</svg>
				<span
					><strong>{$t('about.security_practices.alert.title')}</strong>
					{$t('about.security_practices.alert.description')}</span
				>
			</div>

			<!-- Practice 1 -->
			<div
				class="collapse-arrow bg-base-100 border-base-300 collapse mb-4 border shadow"
				class:collapse-open={openPractice === 0}
			>
				<button
					type="button"
					class="collapse-title text-left text-xl font-medium"
					onclick={() => togglePractice(0)}
				>
					{$t('about.security_practices.recovery.title')}
				</button>
				<div class="collapse-content">
					<p>{$t('about.security_practices.recovery.description')}</p>
				</div>
			</div>

			<!-- Practice 2 -->
			<div
				class="collapse-arrow bg-base-100 border-base-300 collapse mb-4 border shadow"
				class:collapse-open={openPractice === 1}
			>
				<button
					type="button"
					class="collapse-title text-left text-xl font-medium"
					onclick={() => togglePractice(1)}
				>
					{$t('about.security_practices.cold_storage.title')}
				</button>
				<div class="collapse-content">
					<p>{$t('about.security_practices.cold_storage.description')}</p>
				</div>
			</div>

			<!-- Practice 3 -->
			<div
				class="collapse-arrow bg-base-100 border-base-300 collapse mb-4 border shadow"
				class:collapse-open={openPractice === 2}
			>
				<button
					type="button"
					class="collapse-title text-left text-xl font-medium"
					onclick={() => togglePractice(2)}
				>
					{$t('about.security_practices.transaction_verification.title')}
				</button>
				<div class="collapse-content">
					<p>{$t('about.security_practices.transaction_verification.description')}</p>
				</div>
			</div>

			<!-- Practice 4 -->
			<div
				class="collapse-arrow bg-base-100 border-base-300 collapse border shadow"
				class:collapse-open={openPractice === 3}
			>
				<button
					type="button"
					class="collapse-title text-left text-xl font-medium"
					onclick={() => togglePractice(3)}
				>
					{$t('about.security_practices.device_security.title')}
				</button>
				<div class="collapse-content">
					<p>{$t('about.security_practices.device_security.description')}</p>
				</div>
			</div>
		</div>

		<!-- Security Commitment -->
		<div class="mt-12 text-center max-w-6xl mx-auto prose">
			<h3 class="mb-4">{$t('about.security_practices.commitment.title')}</h3>
			<p class="mx-auto text-lg">
				{$t('about.security_practices.commitment.description')}
			</p>

			<div class="alert alert-warning alert-outline mx-auto mt-8">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z"
					/>
				</svg>
				<span class="text-sm">
					<strong>{$t('about.security_practices.commitment.warning_title')}</strong>
					{$t('about.security_practices.commitment.warning_text')}
				</span>
			</div>

			<div class="card bg-base-100 border-base-300 mx-auto mt-8 max-w-lg border shadow-lg">
				<div class="card-body items-center text-center">
					<h3 class="card-title">{$t('about.security_practices.commitment.question_title')}</h3>
					<p>{$t('about.security_practices.commitment.question_description')}</p>
					<div class="card-actions">
						<a href={mailtoHref} class="btn btn-primary btn-wide mt-4">
							<IconEmailOutline class="text-xl" />
							{$t('about.security_practices.commitment.contact')}
						</a>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
