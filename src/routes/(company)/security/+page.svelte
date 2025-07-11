<script lang="ts">
	import { darkMode } from '$lib/stores/theme.store';
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

<div class="container mx-auto px-4 py-8 md:px-8">
	<!-- Hero Section -->
	<div class="hero bg-base-200 py-8">
		<div class="hero-content text-center flex-col">
			<img
			src={$darkMode
				? '/images/Bittasker-logo-tagline-dark.svg'
				: '/images/Bittasker-logo-tagline-light.svg'}
			alt="BitTasker Logo"
			class="mx-auto mb-8 block w-full max-w-lg"
			/>
			<div class="max-w-3xl">
				<h1 class="text-5xl font-bold">Security First</h1>
				<p class="py-6 text-lg">
					At BitTasker, security isn't an afterthought—it's built into our foundation. Learn how we protect your 
					identity, data, and funds through advanced cryptography and user-controlled security.
				</p>
			</div>
		</div>
	</div>

	<!-- Security Overview -->
	<div class="mx-auto max-w-4xl py-8">
		<div class="text-center mb-12">
			<h2 class="text-4xl font-bold">Our Security Approach</h2>
			<p class="mt-4 text-lg text-base-content/80">
				BitTasker takes a fundamentally different approach to security compared to traditional platforms. 
				Instead of asking you to trust us with your sensitive information, we've built systems where 
				you maintain control of your own security.
			</p>
		</div>

		<!-- Security Features -->
		<div class="grid gap-8 md:grid-cols-2 mt-8">
			<!-- Passkeys -->
			<div class="card bg-base-100 shadow-lg border border-base-300">
				<div class="card-body">
					<h3 class="card-title text-2xl">
						<span class="badge badge-primary mr-2">1</span>Passkeys, Not Passwords
					</h3>
					<p>
						We've replaced traditional passwords with more secure passkeys, which provide stronger 
						protection against phishing and data breaches. Passkeys use public-key cryptography to 
						create unique authentication credentials that never leave your device.
					</p>
					<ul class="list-disc ml-5 mt-2">
						<li>Immune to password-based attacks</li>
						<li>No shared secrets stored on our servers</li>
						<li>Biometric verification on your device for enhanced security</li>
						<li>FIDO2 standard compliance for maximum compatibility</li>
					</ul>
				</div>
			</div>

			<!-- Account Recovery -->
			<div class="card bg-base-100 shadow-lg border border-base-300">
				<div class="card-body">
					<h3 class="card-title text-2xl">
						<span class="badge badge-primary mr-2">2</span>Secure Account Recovery
					</h3>
					<p>
						We understand that sometimes passkeys can be lost due to device changes or other circumstances. 
						Our email-based recovery system allows you to regain access to your account without compromising security.
					</p>
					<ul class="list-disc ml-5 mt-2">
						<li>Email verification with additional recovery password</li>
						<li>Multi-factor authentication during recovery process</li>
						<li>Recovery process designed to prevent unauthorized access</li>
						<li>Time-limited recovery windows to prevent abuse</li>
					</ul>
				</div>
			</div>

			<!-- Encrypted Keys -->
			<div class="card bg-base-100 shadow-lg border border-base-300">
				<div class="card-body">
					<h3 class="card-title text-2xl">
						<span class="badge badge-primary mr-2">3</span>Client-Side Encryption
					</h3>
					<p>
						Your Bitcoin wallet and Nostr private keys are encrypted directly on your device 
						using your passkey. This encryption happens before any data is synchronized with our servers.
					</p>
					<ul class="list-disc ml-5 mt-2">
						<li>Keys are never stored in plaintext</li>
						<li>Even BitTasker cannot access your private keys</li>
						<li>End-to-end encryption for all sensitive data</li>
						<li>Advanced AES-256 encryption standards</li>
					</ul>
				</div>
			</div>

			<!-- Wallet Security -->
			<div class="card bg-base-100 shadow-lg border border-base-300">
				<div class="card-body">
					<h3 class="card-title text-2xl">
						<span class="badge badge-primary mr-2">4</span>Bitcoin Wallet Security
					</h3>
					<p>
						BitTasker provides a hot wallet for convenience in transacting on the platform. This wallet is designed 
						for active use rather than long-term storage of large amounts of Bitcoin.
					</p>
					<ul class="list-disc ml-5 mt-2">
						<li>Full control to withdraw your Bitcoin at any time</li>
						<li>No withdrawal limitations or lockup periods</li>
						<li>Transaction signing occurs on your device</li>
						<li>We recommend transferring larger amounts to cold storage</li>
					</ul>
				</div>
			</div>
		</div>

		<!-- Additional Security Measures -->
		<div class="mt-16">
			<h2 class="text-3xl font-bold text-center mb-8">Additional Security Measures</h2>
			
			<div class="card bg-base-100 shadow-lg border border-base-300 mb-8">
				<div class="card-body">
					<h3 class="card-title text-2xl">Decentralized Identity</h3>
					<p>
						BitTasker leverages the Nostr protocol for decentralized identity management. Your identity 
						isn't stored in a central database that could be compromised—it exists as a cryptographic key pair 
						that you control.
					</p>
					<div class="card shadow-lg mt-4 bg-info/10 border-l-4 border-info">
						<div class="card-body py-4">
							<div class="flex items-center">
								<i class="fa-solid fa-circle-info text-info text-xl mr-4"></i>
								<div>
									<p class="m-0">Your identity can be portable across applications that support the Nostr protocol, giving you true data sovereignty.</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
			
			<div class="card bg-base-100 shadow-lg border border-base-300 mb-8">
				<div class="card-body">
					<h3 class="card-title text-2xl">Secure Escrow System</h3>
					<p>
						Our Bitcoin escrow system uses 2-of-2 multisignature technology to ensure that neither party can 
						access funds unilaterally. This provides security for both clients and taskers without requiring 
						BitTasker to hold your funds.
					</p>
					<div class="card shadow-lg mt-4 bg-info/10 border-l-4 border-info">
						<div class="card-body py-4">
							<div class="flex items-center">
								<i class="fa-solid fa-circle-info text-info text-xl mr-4"></i>
								<div>
									<p class="m-0">Timelock mechanisms ensure that disputes have clear resolution paths without requiring trusted third parties.</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
			
			<div class="card bg-base-100 shadow-lg border border-base-300">
				<div class="card-body">
					<h3 class="card-title text-2xl">Privacy By Design</h3>
					<p>
						BitTasker is built with privacy as a core principle. End-to-end encryption is used for all private 
						messages between users, meaning that not even BitTasker can read your conversations.
					</p>
				</div>
			</div>
		</div>

		<!-- Security Best Practices -->
		<div class="mt-16">
			<h2 class="text-3xl font-bold text-center mb-8">Security Best Practices</h2>
			
			<div class="card shadow-lg mb-8 bg-warning/10 border-l-4 border-warning">
				<div class="card-body py-4">
					<div class="flex items-center">
						<i class="fa-solid fa-shield text-warning text-xl mr-4"></i>
						<div>
							<p class="m-0"><strong>Your security is in your hands.</strong> While BitTasker implements strong platform security, following these best practices will help keep your account and funds safe.</p>
						</div>
					</div>
				</div>
			</div>
			
			<div class="collapse collapse-arrow bg-base-100 shadow border border-base-300 mb-4" class:collapse-open={openPractice === 0}>
				<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => togglePractice(0)}>
					Keep Your Recovery Information Secure
				</button>
				<div class="collapse-content"> 
					<p>Store your recovery password in a secure password manager and ensure your recovery email account is protected with strong security measures, including two-factor authentication if possible.</p>
				</div>
			</div>
			
			<div class="collapse collapse-arrow bg-base-100 shadow border border-base-300 mb-4" class:collapse-open={openPractice === 1}>
				<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => togglePractice(1)}>
					Use Cold Storage for Large Bitcoin Holdings
				</button>
				<div class="collapse-content"> 
					<p>While BitTasker's wallet is secure for platform transactions, we recommend transferring larger Bitcoin amounts to hardware wallets or other cold storage solutions when not actively using them.</p>
				</div>
			</div>
			
			<div class="collapse collapse-arrow bg-base-100 shadow border border-base-300 mb-4" class:collapse-open={openPractice === 2}>
				<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => togglePractice(2)}>
					Verify Transaction Details Carefully
				</button>
				<div class="collapse-content"> 
					<p>Always double-check Bitcoin addresses before sending transactions. Once confirmed on the blockchain, transactions cannot be reversed.</p>
				</div>
			</div>
			
			<div class="collapse collapse-arrow bg-base-100 shadow border border-base-300" class:collapse-open={openPractice === 3}>
				<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => togglePractice(3)}>
					Keep Your Devices Secure
				</button>
				<div class="collapse-content"> 
					<p>Since BitTasker relies on client-side security, keeping your devices free from malware and updated with the latest security patches is essential for maintaining the security of your account and wallet.</p>
				</div>
			</div>
		</div>
		
		<!-- Security Commitment -->
		<div class="mt-16 text-center">
			<h2 class="text-3xl font-bold mb-4">Our Security Commitment</h2>
			<p class="text-lg max-w-2xl mx-auto">
				BitTasker is committed to continually improving our security practices as technology evolves.
			</p>
			<div class="card bg-base-100 shadow-lg border border-base-300 mt-8 max-w-lg mx-auto">
				<div class="card-body items-center text-center">
					<h3 class="card-title">Have a security question?</h3>
					<p>We're always here to help with any security concerns or questions.</p>
					<div class="card-actions">
						<a href={mailtoHref} class="btn btn-primary btn-wide mt-4">
                            <i class="fa-solid fa-envelope fa-xl"></i>
                            Send Us An Email
                        </a>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>