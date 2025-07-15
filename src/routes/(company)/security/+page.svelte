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
			class="mx-auto mb-4 block md:min-w-[500px]"
			/>
			<div class="max-w-3xl">
				<h1 class="text-5xl font-bold">Security First</h1>
				<p class="mx-auto mt-4 max-w-3xl text-lg text-base-content/80">
					How we secure your account, protect your data, and keep both taskers and taskees safe on our platform.
				</p>
			</div>
		</div>
	</div>

	<!-- Security Overview -->
	<div class="prose mx-auto max-w-4xl py-8">
		<div class="text-center mb-12">
			<h2 class="text-4xl font-bold">Our Security Approach</h2>
			<p class="mt-4 text-lg text-base-content/80">
				BitTasker takes a fundamentally different approach to security compared to traditional platforms. 
				Instead of asking you to trust us with your sensitive information, we've built systems where 
				you maintain control of your own security.
			</p>
			
			<div class="alert alert-warning alert-outline mt-8">
				<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
				</svg>
				<div>
					<p class="font-semibold">Important Security Disclaimer</p>
					<p class="text-sm">While we implement industry-standard security measures, no system is completely immune to security risks. Users are responsible for following security best practices and maintaining the security of their own devices and accounts. BitTasker cannot guarantee absolute security and is not liable for security breaches resulting from user negligence or third-party vulnerabilities.</p>
				</div>
			</div>
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
						We've implemented passkey authentication, which provides enhanced security compared to traditional passwords. Passkeys use public-key cryptography to 
						create unique authentication credentials that remain on your device.
					</p>
					<ul class="list-disc ml-5 mt-2">
						<li>Designed to resist password-based attacks</li>
						<li>No shared secrets stored on our servers</li>
						<li>Biometric verification on supported devices</li>
						<li>FIDO2 standard compliance where supported</li>
					</ul>
					<div class="alert alert-info alert-outline mt-4">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
						</svg>
						<span class="text-sm"><strong>User Responsibility:</strong> Passkey security depends on your device's security. Keep your device updated and secure to maintain the effectiveness of this authentication method.</span>
					</div>
				</div>
			</div>

			<!-- Account Recovery -->
			<div class="card bg-base-100 shadow-lg border border-base-300">
				<div class="card-body">
					<h3 class="card-title text-2xl">
						<span class="badge badge-primary mr-2">2</span>Account Recovery System
					</h3>
					<p>
						We provide email-based recovery options for situations where passkeys become inaccessible. 
						Our recovery system is designed to balance security with accessibility.
					</p>
					<ul class="list-disc ml-5 mt-2">
						<li>Email verification with recovery authentication</li>
						<li>Multi-factor authentication during recovery</li>
						<li>Time-limited recovery processes</li>
						<li>Security monitoring during recovery attempts</li>
					</ul>
					<div class="alert alert-info alert-outline mt-4">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
						</svg>
						<span class="text-sm"><strong>User Responsibility:</strong> Account recovery security depends on your email security. Use strong email security practices and two-factor authentication on your recovery email account.</span>
					</div>
				</div>
			</div>

			<!-- Encrypted Keys -->
			<div class="card bg-base-100 shadow-lg border border-base-300">
				<div class="card-body">
					<h3 class="card-title text-2xl">
						<span class="badge badge-primary mr-2">3</span>Client-Side Encryption
					</h3>
					<p>
						Your Bitcoin wallet and Nostr private keys are encrypted on your device 
						using your authentication credentials before synchronization with our servers.
					</p>
					<ul class="list-disc ml-5 mt-2">
						<li>Keys are stored in encrypted format</li>
						<li>BitTasker does not have access to your private keys</li>
						<li>Encryption occurs on your device</li>
						<li>Industry-standard encryption protocols</li>
					</ul>
					<div class="alert alert-info alert-outline mt-4">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
						</svg>
						<span class="text-sm"><strong>User Responsibility:</strong> If you lose access to your authentication credentials, we cannot recover your encrypted keys. Maintain secure backups of your recovery information.</span>
					</div>
				</div>
			</div>

			<!-- Wallet Security -->
			<div class="card bg-base-100 shadow-lg border border-base-300">
				<div class="card-body">
					<h3 class="card-title text-2xl">
						<span class="badge badge-primary mr-2">4</span>Bitcoin Wallet Security
					</h3>
					<p>
						BitTasker provides an integrated wallet designed for platform transactions. This wallet is intended 
						for active use rather than long-term storage of significant Bitcoin amounts.
					</p>
					<ul class="list-disc ml-5 mt-2">
						<li>Withdrawal capabilities maintained for user control</li>
						<li>No imposed withdrawal limitations under normal operation</li>
						<li>Transaction signing occurs on your device</li>
						<li>Designed for convenience in platform transactions</li>
					</ul>
					<div class="alert alert-warning alert-outline mt-4">
						<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
						</svg>
						<span class="text-sm"><strong>Security Recommendation:</strong> As with any hot wallet, we recommend transferring larger Bitcoin amounts to cold storage solutions when not actively using them. Hot wallets are inherently less secure than cold storage.</span>
					</div>
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
						is based on cryptographic key pairs that you control, rather than being stored in a central database.
					</p>
					<div class="alert alert-info alert-outline mt-4">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
						</svg>
						<span>Your identity can be portable across applications that support the Nostr protocol. However, the security and reliability of this system depends on the broader Nostr network and relay infrastructure.</span>
					</div>
				</div>
			</div>
			
			<div class="card bg-base-100 shadow-lg border border-base-300 mb-8">
				<div class="card-body">
					<h3 class="card-title text-2xl">Escrow System Security</h3>
					<p>
						Our Bitcoin escrow system uses 2-of-2 multisignature technology designed to ensure that neither party can 
						access funds unilaterally. This system aims to provide security for both taskers and taskees.
					</p>
					<div class="alert alert-info alert-outline mt-4">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
						</svg>
						<span>While our escrow system is designed with security in mind, users should understand that Bitcoin transactions are irreversible and dispute resolution follows predetermined timelock mechanisms.</span>
					</div>
				</div>
			</div>
			
			<div class="card bg-base-100 shadow-lg border border-base-300">
				<div class="card-body">
					<h3 class="card-title text-2xl">Privacy-Focused Communication</h3>
					<p>
						BitTasker implements end-to-end encryption for private messages between users, designed so that 
						BitTasker cannot read your conversations.
					</p>
					<div class="alert alert-info alert-outline mt-4">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
						</svg>
						<span>Message security depends on the proper implementation of encryption protocols and the security of the devices used for communication.</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Security Best Practices -->
		<div class="mt-16">
			<h2 class="text-3xl font-bold text-center mb-8">Security Best Practices</h2>
			
			<div class="alert alert-warning alert-outline mb-8">
				<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
				</svg>
				<span><strong>Your security is primarily your responsibility.</strong> While BitTasker implements security measures, following these best practices is essential for protecting your account and funds. BitTasker cannot be held responsible for losses resulting from failure to follow security best practices.</span>
			</div>
			
			<div class="collapse collapse-arrow bg-base-100 shadow border border-base-300 mb-4" class:collapse-open={openPractice === 0}>
				<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => togglePractice(0)}>
					Keep Your Recovery Information Secure
				</button>
				<div class="collapse-content"> 
					<p>Store your recovery information in a secure password manager and ensure your recovery email account is protected with strong security measures. You are solely responsible for maintaining access to your recovery information.</p>
				</div>
			</div>
			
			<div class="collapse collapse-arrow bg-base-100 shadow border border-base-300 mb-4" class:collapse-open={openPractice === 1}>
				<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => togglePractice(1)}>
					Use Cold Storage for Large Bitcoin Holdings
				</button>
				<div class="collapse-content"> 
					<p>While BitTasker's wallet implements security measures for platform transactions, we strongly recommend transferring larger Bitcoin amounts to hardware wallets or other cold storage solutions when not actively using them. Hot wallets are inherently less secure than cold storage.</p>
				</div>
			</div>
			
			<div class="collapse collapse-arrow bg-base-100 shadow border border-base-300 mb-4" class:collapse-open={openPractice === 2}>
				<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => togglePractice(2)}>
					Verify Transaction Details Carefully
				</button>
				<div class="collapse-content"> 
					<p>Always double-check Bitcoin addresses and transaction amounts before confirming. Bitcoin transactions are irreversible, and BitTasker cannot recover funds sent to incorrect addresses or reverse confirmed transactions.</p>
				</div>
			</div>
			
			<div class="collapse collapse-arrow bg-base-100 shadow border border-base-300" class:collapse-open={openPractice === 3}>
				<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => togglePractice(3)}>
					Keep Your Devices Secure
				</button>
				<div class="collapse-content"> 
					<p>Since BitTasker relies on client-side security, keeping your devices free from malware and updated with the latest security patches is essential. Use reputable antivirus software and avoid accessing your account from public or compromised devices.</p>
				</div>
			</div>
		</div>
		
		<!-- Security Commitment -->
		<div class="mt-16 text-center">
			<h2 class="text-3xl font-bold mb-4">Our Security Commitment</h2>
			<p class="text-lg max-w-2xl mx-auto">
				BitTasker is committed to implementing and maintaining reasonable security practices as technology evolves. 
				However, we cannot guarantee absolute security and users must take responsibility for their own security practices.
			</p>
			
			<div class="alert alert-warning alert-outline mt-8 max-w-2xl mx-auto">
				<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
				</svg>
				<span class="text-sm"><strong>Security Limitations:</strong> No security system is perfect. BitTasker disclaims liability for security breaches caused by factors beyond our reasonable control, including but not limited to user negligence, third-party vulnerabilities, or sophisticated attacks.</span>
			</div>
			
			<div class="card bg-base-100 shadow-lg border border-base-300 mt-8 max-w-lg mx-auto">
				<div class="card-body items-center text-center">
					<h3 class="card-title">Have a security question?</h3>
					<p>We're here to help with security concerns and questions about our platform.</p>
					<div class="card-actions">
						<a href={mailtoHref} class="btn btn-primary btn-wide mt-4">
                            <i class="fa-solid fa-envelope fa-xl"></i>
                            Get in touch
                        </a>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>