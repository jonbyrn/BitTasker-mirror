<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { fly, fade, scale } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	// Icon imports for unplugin-icons
	import IconSwapHorizontalCircleOutline from '~icons/mdi/swap-horizontal-circle-outline';
	import IconShieldCheck from '~icons/mdi/shield-check';
	import IconLightningBolt from '~icons/mdi/lightning-bolt';
	import IconLockClock from '~icons/mdi/lock-clock';
	import IconHelpCircle from '~icons/mdi/help-circle';

	const dispatch = createEventDispatcher();

	interface Props {
		onClose?: () => void;
		showButton?: boolean;
	}

	let { onClose, showButton = true }: Props = $props();

	let isOpen = $state(false);
	let openFaqIndex = $state<number>(-1);

	// Auto-open modal when showButton is false
	$effect(() => {
		if (!showButton) {
			isOpen = true;
		}
	});

	function openModal() {
		isOpen = true;
	}

	function closeModal() {
		isOpen = false;
		if (onClose) {
			onClose();
		}
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
{#if showButton}
	<button
		class="btn btn-ghost gap-2"
		onclick={openModal}
		title="Learn about your Bitcoin wallet"
		data-help-modal
	>
		<IconHelpCircle class="h-5 w-5" />
		Learn More
	</button>
{/if}

<!-- Modal -->
<input
	type="checkbox"
	class="modal-toggle"
	checked={isOpen}
	style="display:none"
	readonly
	aria-label={$t('common.components.wallet_help_modal.title')}
/>
{#if isOpen}
	<div class="modal modal-open" transition:fade={{ duration: 200 }}>
		<div class="modal-box max-w-4xl max-h-[75vh] flex flex-col p-0" transition:fly={{ y: 20, duration: 300 }}>
			<!-- Modal Header -->
			<div class="flex items-center justify-between bg-base-300 px-4 py-3 rounded-t-lg">
				<div class="flex items-center gap-3">
					<div class="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
						<img src="/images/chains/Bitcoin.svg" alt="Bitcoin" class="h-6 w-6" />
					</div>
					<h4 class="text-lg font-bold">{$t('common.components.wallet_help_modal.title')}</h4>
				</div>
				<button 
					class="btn btn-sm btn-circle btn-ghost hover:bg-white/20"
					onclick={closeModal}
					aria-label={$t('common.components.modal.close')}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Modal Content -->
			<div class="space-y-6 overflow-y-auto flex-1 p-6">
					<!-- Hero Section -->
					<div class="text-center">
					<div class="mb-4 flex justify-center">
						<div class="bg-primary/10 rounded-full p-4 bitcoin-pulse">
							<img src="/images/chains/Bitcoin.svg" alt="Bitcoin" class="h-16 w-16" />
						</div>
					</div>
						<h3 class="text-xl font-bold text-base-content mb-2">{$t('common.components.wallet_help_modal.hero_title')}</h3>
						<p class="text-base-content/70 text-lg">{$t('common.components.wallet_help_modal.hero_description')}</p>
					</div>

					<!-- Key Features -->
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div class="card bg-base-200 h-full">
							<div class="card-body p-4 flex flex-col h-full">
								<div class="flex items-center gap-3 mb-3 h-12">
									<IconSwapHorizontalCircleOutline class="h-8 w-8 text-primary" />
									<h4 class="card-title text-base">{$t('common.components.wallet_help_modal.multi_network_title')}</h4>
								</div>
								<div class="flex-1"></div>
								<p class="text-sm text-base-content/80">{$t('common.components.wallet_help_modal.multi_network_description')}</p>
							</div>
						</div>

						<div class="card bg-base-200 h-full">
							<div class="card-body p-4 flex flex-col h-full">
								<div class="flex items-center gap-3 mb-3 h-12">
									<IconShieldCheck class="h-8 w-8 text-primary" />
									<h4 class="card-title text-base">{$t('common.components.wallet_help_modal.security_title')}</h4>
								</div>
								<div class="flex-1"></div>
								<p class="text-sm text-base-content/80">{$t('common.components.wallet_help_modal.security_description')}</p>
							</div>
						</div>

						<div class="card bg-base-200 h-full">
							<div class="card-body p-4 flex flex-col h-full">
								<div class="flex items-center gap-3 mb-3 h-12">
									<IconLightningBolt class="h-8 w-8 text-primary" />
									<h4 class="card-title text-base">{$t('common.components.wallet_help_modal.lightning_title')}</h4>
								</div>
								<div class="flex-1"></div>
								<p class="text-sm text-base-content/80">{$t('common.components.wallet_help_modal.lightning_description')}</p>
							</div>
						</div>

						<div class="card bg-base-200 h-full">
							<div class="card-body p-4 flex flex-col h-full">
								<div class="flex items-center gap-3 mb-3 h-12">
									<IconLockClock class="h-8 w-8 text-primary" />
									<h4 class="card-title text-base">{$t('common.components.wallet_help_modal.escrow_title')}</h4>
								</div>
								<div class="flex-1"></div>
								<p class="text-sm text-base-content/80">{$t('common.components.wallet_help_modal.escrow_description')}</p>
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
								{$t('common.components.wallet_help_modal.how_it_works_title')}
							</h4>
							<div class="space-y-3">
								<div class="flex items-center gap-3">
									<div class="bg-primary text-primary-content flex h-6 w-6 min-h-6 min-w-6 items-center justify-center rounded-full text-xs font-medium">1</div>
									<div>
										<h5 class="font-medium text-sm">{$t('common.components.wallet_help_modal.step1_title')}</h5>
										<p class="text-xs text-base-content/70">{$t('common.components.wallet_help_modal.step1_description')}</p>
									</div>
								</div>
								<div class="flex items-center gap-3">
									<div class="bg-primary text-primary-content flex h-6 w-6 min-h-6 min-w-6 items-center justify-center rounded-full text-xs font-medium">2</div>
									<div>
										<h5 class="font-medium text-sm">{$t('common.components.wallet_help_modal.step2_title')}</h5>
										<p class="text-xs text-base-content/70">{$t('common.components.wallet_help_modal.step2_description')}</p>
									</div>
								</div>
								<div class="flex items-center gap-3">
									<div class="bg-primary text-primary-content flex h-6 w-6 min-h-6 min-w-6 items-center justify-center rounded-full text-xs font-medium">3</div>
									<div>
										<h5 class="font-medium text-sm">{$t('common.components.wallet_help_modal.step3_title')}</h5>
										<p class="text-xs text-base-content/70">{$t('common.components.wallet_help_modal.step3_description')}</p>
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
							<h4 class="font-bold text-base-content">{$t('common.components.wallet_help_modal.benefits_title')}</h4>
							<p class="text-sm">{$t('common.components.wallet_help_modal.benefits_description')}</p>
						</div>
					</div>

					<!-- FAQ Section -->
					<div class="card bg-base-200">
						<div class="card-body">
							<h4 class="card-title text-base mb-4">
								<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								{$t('common.components.wallet_help_modal.faq_title')}
							</h4>

							<div class="space-y-2">
								<!-- What is Rootstock Bitcoin? -->
								<div class="collapse-arrow collapse border border-base-300 rounded-lg" class:collapse-open={openFaqIndex === 0}>
									<button
										type="button"
										class="collapse-title text-left text-base font-medium"
										onclick={() => toggleFaq(0)}
									>
										{$t('common.components.wallet_help_modal.faq_rsk_title')}
									</button>
									<div class="collapse-content">
										<div class="space-y-3">
											<p class="text-sm text-base-content/80">
												{$t('common.components.wallet_help_modal.faq_rsk_description')}
											</p>
											<ul class="list-disc list-inside space-y-1 text-xs text-base-content/70">
												<li><strong>{$t('common.components.wallet_help_modal.faq_rsk_security')}</strong> {$t('common.components.wallet_help_modal.faq_rsk_security_desc')}</li>
												<li><strong>{$t('common.components.wallet_help_modal.faq_rsk_contracts')}</strong> {$t('common.components.wallet_help_modal.faq_rsk_contracts_desc')}</li>
												<li><strong>{$t('common.components.wallet_help_modal.faq_rsk_settlement')}</strong> {$t('common.components.wallet_help_modal.faq_rsk_settlement_desc')}</li>
												<li><strong>{$t('common.components.wallet_help_modal.faq_rsk_fees')}</strong> {$t('common.components.wallet_help_modal.faq_rsk_fees_desc')}</li>
												<li><strong>{$t('common.components.wallet_help_modal.faq_rsk_peg')}</strong> {$t('common.components.wallet_help_modal.faq_rsk_peg_desc')}</li>
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
										{$t('common.components.wallet_help_modal.faq_liquid_title')}
									</button>
									<div class="collapse-content">
										<div class="space-y-3">
											<p class="text-sm text-base-content/80">
												{$t('common.components.wallet_help_modal.faq_liquid_description')}
											</p>
											<ul class="list-disc list-inside space-y-1 text-xs text-base-content/70">
												<li><strong>{$t('common.components.wallet_help_modal.faq_liquid_settlement')}</strong> {$t('common.components.wallet_help_modal.faq_liquid_settlement_desc')}</li>
												<li><strong>{$t('common.components.wallet_help_modal.faq_liquid_scripting')}</strong> {$t('common.components.wallet_help_modal.faq_liquid_scripting_desc')}</li>
												<li><strong>{$t('common.components.wallet_help_modal.faq_liquid_assets')}</strong> {$t('common.components.wallet_help_modal.faq_liquid_assets_desc')}</li>
												<li><strong>{$t('common.components.wallet_help_modal.faq_liquid_peg')}</strong> {$t('common.components.wallet_help_modal.faq_liquid_peg_desc')}</li>
												<li><strong>{$t('common.components.wallet_help_modal.faq_liquid_fees')}</strong> {$t('common.components.wallet_help_modal.faq_liquid_fees_desc')}</li>
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
										{$t('common.components.wallet_help_modal.faq_lightning_title')}
									</button>
									<div class="collapse-content">
										<div class="space-y-3">
											<p class="text-sm text-base-content/80">
												{$t('common.components.wallet_help_modal.faq_lightning_description')}
											</p>
											<ul class="list-disc list-inside space-y-1 text-xs text-base-content/70">
												<li><strong>{$t('common.components.wallet_help_modal.faq_lightning_deposits')}</strong> {$t('common.components.wallet_help_modal.faq_lightning_deposits_desc')}</li>
												<li><strong>{$t('common.components.wallet_help_modal.faq_lightning_fees')}</strong> {$t('common.components.wallet_help_modal.faq_lightning_fees_desc')}</li>
												<li><strong>{$t('common.components.wallet_help_modal.faq_lightning_conversion')}</strong> {$t('common.components.wallet_help_modal.faq_lightning_conversion_desc')}</li>
												<li><strong>{$t('common.components.wallet_help_modal.faq_lightning_withdrawals')}</strong> {$t('common.components.wallet_help_modal.faq_lightning_withdrawals_desc')}</li>
												<li><strong>{$t('common.components.wallet_help_modal.faq_lightning_adoption')}</strong> {$t('common.components.wallet_help_modal.faq_lightning_adoption_desc')}</li>
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
										{$t('common.components.wallet_help_modal.faq_escrow_title')}
									</button>
									<div class="collapse-content">
										<div class="space-y-3">
											<p class="text-sm text-base-content/80">
												{$t('common.components.wallet_help_modal.faq_escrow_description')}
											</p>
											<ul class="list-disc list-inside space-y-1 text-xs text-base-content/70">
												<li><strong>{$t('common.components.wallet_help_modal.faq_escrow_channels')}</strong> {$t('common.components.wallet_help_modal.faq_escrow_channels_desc')}</li>
												<li><strong>{$t('common.components.wallet_help_modal.faq_escrow_time')}</strong> {$t('common.components.wallet_help_modal.faq_escrow_time_desc')}</li>
												<li><strong>{$t('common.components.wallet_help_modal.faq_escrow_contracts')}</strong> {$t('common.components.wallet_help_modal.faq_escrow_contracts_desc')}</li>
												<li><strong>{$t('common.components.wallet_help_modal.faq_escrow_multisig')}</strong> {$t('common.components.wallet_help_modal.faq_escrow_multisig_desc')}</li>
												<li><strong>{$t('common.components.wallet_help_modal.faq_escrow_risks')}</strong> {$t('common.components.wallet_help_modal.faq_escrow_risks_desc')}</li>
											</ul>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

			<!-- Action Buttons - Fixed at bottom -->
			<div class="border-t border-base-300 bg-base-100 flex gap-3 p-4 flex-shrink-0">
				<button
					type="button"
					class="btn btn-primary flex-1"
					onclick={closeModal}
				>
					<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					{$t('common.components.wallet_help_modal.start_using_button')}
				</button>
			</div>
		</div>
		<button class="modal-backdrop" onclick={closeModal} aria-label="Close modal"></button>
	</div>
{/if}

<style>
	.bitcoin-pulse {
		animation: bitcoin-pulse 2s ease-in-out infinite;
	}

	@keyframes bitcoin-pulse {
		0%, 100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.05);
		}
	}
</style>
