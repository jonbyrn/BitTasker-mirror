<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	import IconSwapHorizontalCircleOutline from '~icons/mdi/swap-horizontal-circle-outline';
	import IconShieldCheck from '~icons/mdi/shield-check';
	import IconLightningBolt from '~icons/mdi/lightning-bolt';
	import IconLockClock from '~icons/mdi/lock-clock';
	import IconClose from '~icons/mdi/close';
	import IconCogOutline from '~icons/mdi/cog-outline';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconCheck from '~icons/mdi/check';
	import IconHelpCircleOutline from '~icons/mdi/help-circle-outline';
	import { helpModal, closeHelpModal as close } from '$lib/runes/helpModal.svelte';

	interface Props {
		onClose?: () => void;
		showButton?: boolean;
	}

	let { onClose, showButton = true }: Props = $props();

	let openFaqIndex = $state<number>(-1);

	// Auto-open when showButton is false (used by PasskeySetup, ErrorAlertWithModal)
	$effect(() => {
		if (!showButton) {
			helpModal.isOpen = true;
		}
	});

	// FAQ data array — replaces 6 copy-pasted accordion blocks
	interface FaqItem {
		strongKey: string;
		textKey: string;
	}

	interface FaqEntry {
		titleKey: string;
		descKey: string;
		useHtml?: boolean;
		hasFooter?: boolean;
		items: FaqItem[];
	}

	const faqs: FaqEntry[] = [
		{
			titleKey: 'common.components.wallet_help_modal.faq_rsk_title',
			descKey: 'common.components.wallet_help_modal.faq_rsk_description',
			items: [
				{
					strongKey: 'common.components.wallet_help_modal.faq_rsk_security',
					textKey: 'common.components.wallet_help_modal.faq_rsk_security_desc'
				},
				{
					strongKey: 'common.components.wallet_help_modal.faq_rsk_contracts',
					textKey: 'common.components.wallet_help_modal.faq_rsk_contracts_desc'
				},
				{
					strongKey: 'common.components.wallet_help_modal.faq_rsk_settlement',
					textKey: 'common.components.wallet_help_modal.faq_rsk_settlement_desc'
				},
				{
					strongKey: 'common.components.wallet_help_modal.faq_rsk_fees',
					textKey: 'common.components.wallet_help_modal.faq_rsk_fees_desc'
				},
				{
					strongKey: 'common.components.wallet_help_modal.faq_rsk_peg',
					textKey: 'common.components.wallet_help_modal.faq_rsk_peg_desc'
				}
			]
		},
		{
			titleKey: 'common.components.wallet_help_modal.faq_liquid_title',
			descKey: 'common.components.wallet_help_modal.faq_liquid_description',
			items: [
				{
					strongKey: 'common.components.wallet_help_modal.faq_liquid_settlement',
					textKey: 'common.components.wallet_help_modal.faq_liquid_settlement_desc'
				},
				{
					strongKey: 'common.components.wallet_help_modal.faq_liquid_scripting',
					textKey: 'common.components.wallet_help_modal.faq_liquid_scripting_desc'
				},
				{
					strongKey: 'common.components.wallet_help_modal.faq_liquid_assets',
					textKey: 'common.components.wallet_help_modal.faq_liquid_assets_desc'
				},
				{
					strongKey: 'common.components.wallet_help_modal.faq_liquid_peg',
					textKey: 'common.components.wallet_help_modal.faq_liquid_peg_desc'
				},
				{
					strongKey: 'common.components.wallet_help_modal.faq_liquid_fees',
					textKey: 'common.components.wallet_help_modal.faq_liquid_fees_desc'
				}
			]
		},
		{
			titleKey: 'common.components.wallet_help_modal.faq_lightning_title',
			descKey: 'common.components.wallet_help_modal.faq_lightning_description',
			items: [
				{
					strongKey: 'common.components.wallet_help_modal.faq_lightning_deposits',
					textKey: 'common.components.wallet_help_modal.faq_lightning_deposits_desc'
				},
				{
					strongKey: 'common.components.wallet_help_modal.faq_lightning_fees',
					textKey: 'common.components.wallet_help_modal.faq_lightning_fees_desc'
				},
				{
					strongKey: 'common.components.wallet_help_modal.faq_lightning_conversion',
					textKey: 'common.components.wallet_help_modal.faq_lightning_conversion_desc'
				},
				{
					strongKey: 'common.components.wallet_help_modal.faq_lightning_withdrawals',
					textKey: 'common.components.wallet_help_modal.faq_lightning_withdrawals_desc'
				},
				{
					strongKey: 'common.components.wallet_help_modal.faq_lightning_adoption',
					textKey: 'common.components.wallet_help_modal.faq_lightning_adoption_desc'
				}
			]
		},
		{
			titleKey: 'common.components.wallet_help_modal.faq_escrow_title',
			descKey: 'common.components.wallet_help_modal.faq_escrow_description',
			items: [
				{
					strongKey: 'common.components.wallet_help_modal.faq_escrow_channels',
					textKey: 'common.components.wallet_help_modal.faq_escrow_channels_desc'
				},
				{
					strongKey: 'common.components.wallet_help_modal.faq_escrow_time',
					textKey: 'common.components.wallet_help_modal.faq_escrow_time_desc'
				},
				{
					strongKey: 'common.components.wallet_help_modal.faq_escrow_contracts',
					textKey: 'common.components.wallet_help_modal.faq_escrow_contracts_desc'
				},
				{
					strongKey: 'common.components.wallet_help_modal.faq_escrow_multisig',
					textKey: 'common.components.wallet_help_modal.faq_escrow_multisig_desc'
				},
				{
					strongKey: 'common.components.wallet_help_modal.faq_escrow_risks',
					textKey: 'common.components.wallet_help_modal.faq_escrow_risks_desc'
				}
			]
		},
		{
			titleKey: 'wallet.information.faq_usdt_title',
			descKey: 'wallet.information.faq_usdt_body',
			useHtml: true,
			items: [
				{ strongKey: '', textKey: 'wallet.information.faq_usdt_bullet_1' },
				{ strongKey: '', textKey: 'wallet.information.faq_usdt_bullet_2' },
				{ strongKey: '', textKey: 'wallet.information.faq_usdt_bullet_3' }
			]
		},
		{
			titleKey: 'wallet.information.faq_ownwallet_title',
			descKey: 'wallet.information.faq_ownwallet_body',
			useHtml: true,
			hasFooter: true,
			items: [
				{ strongKey: '', textKey: 'wallet.information.faq_ownwallet_bullet_1' },
				{ strongKey: '', textKey: 'wallet.information.faq_ownwallet_bullet_2' },
				{ strongKey: '', textKey: 'wallet.information.faq_ownwallet_bullet_3' }
			]
		}
	];

	function toggleFaq(index: number) {
		openFaqIndex = openFaqIndex === index ? -1 : index;
	}

	function closeModal() {
		close();
		onClose?.();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeModal();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Modal -->
{#if helpModal.isOpen}
	<div class="modal modal-open" transition:fade={{ duration: 200 }}>
		<div
			class="modal-box flex max-h-[75vh] max-w-4xl flex-col p-0"
			transition:fly={{ y: 20, duration: 300 }}
		>
			<!-- Modal Header -->
			<div
				class="bg-base-300 flex items-center justify-between rounded-t-lg px-3 py-2 sm:px-4 sm:py-3"
			>
				<div class="flex items-center gap-2 sm:gap-3">
					<div
						class="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full sm:h-10 sm:w-10"
					>
						<img src="/images/chains/Bitcoin.svg" alt="Bitcoin" class="h-5 w-5 sm:h-6 sm:w-6" />
					</div>
					<h4 class="text-base-content text-base font-bold sm:text-lg">
						{$t('common.components.wallet_help_modal.title')}
					</h4>
				</div>
				<button
					class="btn btn-sm btn-circle btn-ghost hover:bg-white/20"
					onclick={closeModal}
					aria-label={$t('common.components.modal.close')}
				>
					<IconClose class="h-4 w-4 sm:h-5 sm:w-5" />
				</button>
			</div>

			<!-- Modal Content -->
			<div class="flex-1 space-y-4 overflow-y-auto p-3 sm:space-y-6 sm:p-6">
				<!-- Hero Section -->
				<div class="text-center">
					<div class="mb-3 flex justify-center sm:mb-4">
						<div class="bg-primary/10 bitcoin-pulse rounded-full p-3 sm:p-4">
							<img
								src="/images/chains/Bitcoin.svg"
								alt="Bitcoin"
								class="h-12 w-12 sm:h-16 sm:w-16"
							/>
						</div>
					</div>
					<h3 class="text-base-content mb-1.5 text-lg font-bold sm:mb-2 sm:text-xl">
						{$t('common.components.wallet_help_modal.hero_title')}
					</h3>
					<p class="text-base-content/70 text-base sm:text-lg">
						{$t('common.components.wallet_help_modal.hero_description')}
					</p>
				</div>

				<!-- Key Features -->
				<div class="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
					{#each [{ icon: IconSwapHorizontalCircleOutline, titleKey: 'common.components.wallet_help_modal.multi_network_title', descKey: 'common.components.wallet_help_modal.multi_network_description' }, { icon: IconShieldCheck, titleKey: 'common.components.wallet_help_modal.security_title', descKey: 'common.components.wallet_help_modal.security_description' }, { icon: IconLightningBolt, titleKey: 'common.components.wallet_help_modal.lightning_title', descKey: 'common.components.wallet_help_modal.lightning_description' }, { icon: IconLockClock, titleKey: 'common.components.wallet_help_modal.escrow_title', descKey: 'common.components.wallet_help_modal.escrow_description' }] as feature (feature.titleKey)}
						<div class="card bg-base-200 h-full">
							<div class="card-body flex h-full flex-col p-3 sm:p-4">
								<div class="mb-2 flex h-10 items-center gap-2 sm:mb-3 sm:h-12 sm:gap-3">
									<feature.icon class="text-primary h-6 w-6 sm:h-8 sm:w-8" />
									<h4 class="card-title text-base-content text-sm sm:text-base">
										{$t(feature.titleKey)}
									</h4>
								</div>
								<div class="flex-1"></div>
								<p class="text-base-content/80 text-xs sm:text-sm">
									{$t(feature.descKey)}
								</p>
							</div>
						</div>
					{/each}
				</div>

				<!-- How It Works -->
				<div class="card bg-base-200">
					<div class="card-body p-3 sm:p-4">
						<h4 class="card-title text-base-content mb-3 text-sm sm:mb-4 sm:text-base">
							<IconCogOutline class="h-4 w-4 sm:h-5 sm:w-5" />
							{$t('common.components.wallet_help_modal.how_it_works_title')}
						</h4>
						<div class="space-y-2 sm:space-y-3">
							{#each [1, 2, 3] as step (step)}
								<div class="flex items-center gap-2 sm:gap-3">
									<div
										class="bg-primary text-primary-content flex h-5 min-h-5 w-5 min-w-5 items-center justify-center rounded-full text-xs font-medium sm:h-6 sm:min-h-6 sm:w-6 sm:min-w-6"
									>
										{step}
									</div>
									<div>
										<h5 class="text-base-content text-xs font-medium sm:text-sm">
											{$t(`common.components.wallet_help_modal.step${step}_title`)}
										</h5>
										<p class="text-base-content/70 text-xs">
											{$t(`common.components.wallet_help_modal.step${step}_description`)}
										</p>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>

				<!-- Benefits -->
				<div class="alert alert-success alert-outline">
					<IconCheckCircle class="h-6 w-6 shrink-0 stroke-current" />
					<div>
						<h4 class="text-base-content font-bold">
							{$t('common.components.wallet_help_modal.benefits_title')}
						</h4>
						<p class="text-sm">{$t('common.components.wallet_help_modal.benefits_description')}</p>
					</div>
				</div>

				<!-- FAQ Section -->
				<div class="card bg-base-200">
					<div class="card-body p-3 sm:p-4">
						<h4 class="card-title text-base-content mb-3 text-sm sm:mb-4 sm:text-base">
							<IconHelpCircleOutline class="h-4 w-4 sm:h-5 sm:w-5" />
							{$t('common.components.wallet_help_modal.faq_title')}
						</h4>

						<div class="space-y-1.5 sm:space-y-2">
							{#each faqs as faq, i (faq.titleKey)}
								<div
									class="collapse-arrow border-base-300 collapse rounded-lg border"
									class:collapse-open={openFaqIndex === i}
								>
									<button
										type="button"
										class="collapse-title text-base-content py-2 text-left text-sm font-medium sm:py-3 sm:text-base"
										onclick={() => toggleFaq(i)}
									>
										{$t(faq.titleKey)}
									</button>
									<div class="collapse-content">
										<div class="space-y-2 sm:space-y-3">
											{#if faq.useHtml}
												<p class="text-base-content/80 text-xs sm:text-sm">
													<!-- eslint-disable-next-line svelte/no-at-html-tags -->
													{@html $t(faq.descKey)}
												</p>
												<ul
													class="text-base-content/70 list-inside list-disc space-y-0.5 text-xs sm:space-y-1"
												>
													{#each faq.items as item (item.textKey)}
														<li>
															<!-- eslint-disable-next-line svelte/no-at-html-tags -->
															{@html $t(item.textKey)}
														</li>
													{/each}
												</ul>
												{#if faq.hasFooter}
													<p class="text-base-content/80 text-xs sm:text-sm">
														{$t('wallet.information.faq_ownwallet_footer')}
													</p>
												{/if}
											{:else}
												<p class="text-base-content/80 text-xs sm:text-sm">
													{$t(faq.descKey)}
												</p>
												<ul
													class="text-base-content/70 list-inside list-disc space-y-0.5 text-xs sm:space-y-1"
												>
													{#each faq.items as item (item.textKey)}
														<li>
															<strong>{$t(item.strongKey)}</strong>
															{$t(item.textKey)}
														</li>
													{/each}
												</ul>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>

			<!-- Action Buttons - Fixed at bottom -->
			<div class="border-base-300 bg-base-100 flex shrink-0 gap-2 border-t p-3 sm:gap-3 sm:p-4">
				<button
					type="button"
					class="btn btn-primary min-h-[44px] flex-1 text-sm sm:text-base"
					onclick={closeModal}
				>
					<IconCheck class="mr-1 h-4 w-4 sm:mr-2" />
					{$t('common.components.wallet_help_modal.start_using_button')}
				</button>
			</div>
		</div>
		<button
			class="modal-backdrop"
			onclick={closeModal}
			aria-label={$t('common.components.modal.close')}
		></button>
	</div>
{/if}

<style>
	.bitcoin-pulse {
		animation: bitcoin-pulse 2s ease-in-out infinite;
	}

	@keyframes bitcoin-pulse {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.05);
		}
	}
</style>
