<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	// Icon imports for unplugin-icons
	import IconCurrencyUsd from '~icons/mdi/currency-usd';
	import IconShieldCheck from '~icons/mdi/shield-check';
	import IconLightningBolt from '~icons/mdi/lightning-bolt';
	import IconClockOutline from '~icons/mdi/clock-outline';

	const dispatch = createEventDispatcher();

	let isOpen = $state(false);
	let openFaqIndex = $state<number>(-1);

	function openModal() {
		isOpen = true;
	}

	function closeModal() {
		isOpen = false;
	}

	function toggleFaq(index: number) {
		if (openFaqIndex === index) {
			openFaqIndex = -1; // Close if already open
		} else {
			openFaqIndex = index; // Open the new one
		}
	}

	function handleBackdropClick(event: MouseEvent | KeyboardEvent) {
		if (event.target === event.currentTarget) {
			closeModal();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeModal();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Help Button -->
<button
	class="btn btn-ghost btn-sm gap-2"
	onclick={openModal}
	title="Learn about your Bitcoin wallet"
	data-help-modal
>
	<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
	</svg>
	Learn More
</button>

<!-- Modal -->
{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
		onclick={handleBackdropClick}
		onkeydown={(e) => e.key === 'Enter' && handleBackdropClick(e)}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		tabindex="-1"
		transition:fade={{ duration: 200 }}
	>
		<div
			class="bg-base-100 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg shadow-xl"
			role="document"
			transition:fly={{ y: 20, duration: 300 }}
		>
			<!-- Modal Header -->
			<div class="border-b border-base-300 bg-base-200 px-6 py-4">
				<div class="flex items-center justify-between">
					<h2 id="modal-title" class="text-xl font-bold text-base-content">
						Your Bitcoin Wallet
					</h2>
					<button
						class="btn btn-ghost btn-sm btn-circle"
						onclick={closeModal}
						aria-label="Close modal"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			<!-- Modal Content -->
			<div class="px-6 py-6">
				<div class="space-y-6">
					<!-- Hero Section -->
					<div class="text-center">
						<div class="mb-4 flex justify-center">
							<div class="bg-primary/10 rounded-full p-4">
								<img src="/images/chains/Bitcoin.svg" alt="Bitcoin" class="h-16 w-16" />
							</div>
						</div>
						<h3 class="text-xl font-bold text-base-content mb-2">Your Bitcoin-Powered Wallet</h3>
						<p class="text-base-content/70 text-lg">Send, receive, and manage Bitcoin across multiple networks with complete control of your funds.</p>
					</div>

					<!-- Key Features -->
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div class="card bg-base-200 h-full">
							<div class="card-body p-4 flex flex-col h-full">
								<div class="flex items-center gap-3 mb-3">
									<IconCurrencyUsd class="h-6 w-6 text-primary" />
									<h4 class="card-title text-base">Multi-Network Support</h4>
								</div>
								<div class="flex-1"></div>
								<p class="text-sm text-base-content/80">Pay and receive with Bitcoin, Lightning, Liquid, Rootstock, and USDT - all in one wallet.</p>
							</div>
						</div>

						<div class="card bg-base-200 h-full">
							<div class="card-body p-4 flex flex-col h-full">
								<div class="flex items-center gap-3 mb-3">
									<IconShieldCheck class="h-6 w-6 text-primary" />
									<h4 class="card-title text-base">Non-Custodial Security</h4>
								</div>
								<div class="flex-1"></div>
								<p class="text-sm text-base-content/80">You control your keys. Your funds are never held by BitTasker - only you can move your Bitcoin.</p>
							</div>
						</div>

						<div class="card bg-base-200 h-full">
							<div class="card-body p-4 flex flex-col h-full">
								<div class="flex items-center gap-3 mb-3">
									<IconLightningBolt class="h-6 w-6 text-primary" />
									<h4 class="card-title text-base">Lightning-Fast Payments</h4>
								</div>
								<div class="flex-1"></div>
								<p class="text-sm text-base-content/80">Instant Bitcoin payments with Lightning Network. No waiting, no delays, just peer-to-peer speed.</p>
							</div>
						</div>

						<div class="card bg-base-200 h-full">
							<div class="card-body p-4 flex flex-col h-full">
								<div class="flex items-center gap-3 mb-3">
									<IconClockOutline class="h-6 w-6 text-primary" />
									<h4 class="card-title text-base">Smart Escrow</h4>
								</div>
								<div class="flex-1"></div>
								<p class="text-sm text-base-content/80">Automatic fund protection with time-locks. Get paid when work is done, refund if it's not.</p>
							</div>
						</div>
					</div>

					<!-- How It Works -->
					<div class="card bg-base-200">
						<div class="card-body">
							<h4 class="card-title text-base mb-4">
								<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
								</svg>
								How Your Wallet Works
							</h4>
							<div class="space-y-3">
								<div class="flex items-center gap-3">
									<div class="bg-primary text-primary-content flex h-6 w-6 min-h-6 min-w-6 items-center justify-center rounded-full text-xs font-medium">1</div>
									<div>
										<h5 class="font-medium text-sm">Automatic Network Conversion</h5>
										<p class="text-xs text-base-content/70">Pay your way using atomic swaps and your preferred network.</p>
									</div>
								</div>
								<div class="flex items-center gap-3">
									<div class="bg-primary text-primary-content flex h-6 w-6 min-h-6 min-w-6 items-center justify-center rounded-full text-xs font-medium">2</div>
									<div>
										<h5 class="font-medium text-sm">Secure Non-Custodial Payments</h5>
										<p class="text-xs text-base-content/70">Your funds are protected by advanced cryptography. Only you and the other party can release payments.</p>
									</div>
								</div>
								<div class="flex items-center gap-3">
									<div class="bg-primary text-primary-content flex h-6 w-6 min-h-6 min-w-6 items-center justify-center rounded-full text-xs font-medium">3</div>
									<div>
										<h5 class="font-medium text-sm">Instant Cash-Out Options</h5>
										<p class="text-xs text-base-content/70">Convert your earnings to any supported format - Lightning, Bitcoin, Liquid, or USDT - whenever you want.</p>
									</div>
								</div>
							</div>
						</div>
					</div>

					<!-- Benefits -->
					<div class="alert alert-success alert-outline">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
						</svg>
						<div>
							<h4 class="font-bold text-base-content">Why This Matters</h4>
							<p class="text-sm">Traditional platforms hold your money and take fees. BitTasker puts you in control with Bitcoin's security and Lightning's speed.</p>
						</div>
					</div>

					<!-- FAQ Section -->
					<div class="card bg-base-200">
						<div class="card-body">
							<h4 class="card-title text-base mb-4">
								<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								Frequently Asked Questions
							</h4>

							<div class="space-y-2">
								<!-- What is Rootstock Bitcoin? -->
								<div class="collapse-arrow collapse border border-base-300 rounded-lg" class:collapse-open={openFaqIndex === 0}>
									<button
										type="button"
										class="collapse-title text-left text-base font-medium"
										onclick={() => toggleFaq(0)}
									>
										What is Rootstock Bitcoin?
									</button>
									<div class="collapse-content">
										<div class="space-y-3">
											<p class="text-sm text-base-content/80">
												Rootstock Bitcoin (rBTC) is a Bitcoin sidechain that maintains a 1:1 peg with Bitcoin while enabling smart contracts and faster transactions. It's secured by Bitcoin miners through merge-mining, making it one of the most secure Bitcoin sidechains available.
											</p>
											<ul class="list-disc list-inside space-y-1 text-xs text-base-content/70">
												<li><strong>Bitcoin Security:</strong> Secured by Bitcoin miners through merge-mining</li>
												<li><strong>Smart Contracts:</strong> Full EVM compatibility for programmable escrow</li>
												<li><strong>Fast Settlement:</strong> ~30-second block times for quick confirmations</li>
												<li><strong>Low Fees:</strong> Predictable, low-cost transaction fees</li>
												<li><strong>Bitcoin Peg:</strong> 1:1 rBTC to BTC ratio maintained through a Proof of Work Peg</li>
											</ul>
										</div>
									</div>
								</div>

								<!-- What is Liquid Bitcoin? -->
								<div class="collapse-arrow collapse border border-base-300 rounded-lg" class:collapse-open={openFaqIndex === 1}>
									<button
										type="button"
										class="collapse-title text-left text-base font-medium"
										onclick={() => toggleFaq(1)}
									>
										What is Liquid Bitcoin?
									</button>
									<div class="collapse-content">
										<div class="space-y-3">
											<p class="text-sm text-base-content/80">
												Liquid Bitcoin (L-BTC) is a Bitcoin sidechain designed for fast settlements and enhanced functionality. It provides faster transaction confirmations and additional features while maintaining Bitcoin's security model through federation.
											</p>
											<ul class="list-disc list-inside space-y-1 text-xs text-base-content/70">
												<li><strong>Fast Settlement:</strong> 1-minute block times for quick transaction confirmations</li>
												<li><strong>Enhanced Scripting:</strong> Advanced Bitcoin script capabilities for complex escrow</li>
												<li><strong>Multi-Asset Support:</strong> Native support for multiple digital assets</li>
												<li><strong>Bitcoin Peg:</strong> 1:1 L-BTC to BTC ratio through federated peg</li>
												<li><strong>Low Fees:</strong> Predictable transaction costs for all job sizes</li>
											</ul>
										</div>
									</div>
								</div>

								<!-- Can I use Lightning Bitcoin? -->
								<div class="collapse-arrow collapse border border-base-300 rounded-lg" class:collapse-open={openFaqIndex === 2}>
									<button
										type="button"
										class="collapse-title text-left text-base font-medium"
										onclick={() => toggleFaq(2)}
									>
										Can I use Lightning Bitcoin?
									</button>
									<div class="collapse-content">
										<div class="space-y-3">
											<p class="text-sm text-base-content/80">
												Yes! You can deposit and withdraw using Lightning Bitcoin for instant, low-cost payments. However, for escrow purposes, we automatically convert Lightning payments to Liquid or Rootstock to ensure secure, non-custodial fund protection.
											</p>
											<ul class="list-disc list-inside space-y-1 text-xs text-base-content/70">
												<li><strong>Instant Deposits:</strong> Send Lightning payments that are instantly available</li>
												<li><strong>Low Fees:</strong> Pay minimal fees for Lightning transactions</li>
												<li><strong>Automatic Conversion:</strong> Lightning funds are swapped to L-BTC or rBTC for escrow</li>
												<li><strong>Instant Withdrawals:</strong> Convert escrow funds back to Lightning any time</li>
												<li><strong>Wide Adoption:</strong> Lightning is one of the most widely adopted Bitcoin sidechains</li>
											</ul>
										</div>
									</div>
								</div>

								<!-- Why doesn't BitTasker just use Lightning for escrow? -->
								<div class="collapse-arrow collapse border border-base-300 rounded-lg" class:collapse-open={openFaqIndex === 3}>
									<button
										type="button"
										class="collapse-title text-left text-base font-medium"
										onclick={() => toggleFaq(3)}
									>
										Why doesn't BitTasker just use Lightning for escrow?
									</button>
									<div class="collapse-content">
										<div class="space-y-3">
											<p class="text-sm text-base-content/80">
												While Lightning excels at instant payments, creating user-friendly, non-custodial escrow on Lightning is still technically complex. We use Liquid and Rootstock for escrow because they provide the security, privacy, and reliability needed for protecting your funds.
											</p>
											<ul class="list-disc list-inside space-y-1 text-xs text-base-content/70">
												<li><strong>Channel Limitations:</strong> Limited number of open channels per node for escrow contracts</li>
												<li><strong>Time Constraints:</strong> Escrow contracts limited to hours, not days or weeks</li>
												<li><strong>No Smart Contracts:</strong> Lightning lacks programmable escrow functionality</li>
												<li><strong>No Multisig Support:</strong> Cannot implement secure multi-signature escrow</li>
												<li><strong>Node Risks:</strong> Risk of fund loss if Lightning nodes close or go offline</li>
											</ul>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Modal Footer -->
			<div class="border-t border-base-300 bg-base-200 px-6 py-4">
				<div class="flex justify-end">
					<button class="btn btn-primary" onclick={closeModal}>
						Start Using Wallet
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
