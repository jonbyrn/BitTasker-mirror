<!-- eslint-disable-next-line svelte/no-at-html-tags -->
<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	// Icon imports for unplugin-icons
	import IconSwapHorizontalCircleOutline from '~icons/mdi/swap-horizontal-circle-outline';
	import IconShieldCheck from '~icons/mdi/shield-check';
	import IconLightningBolt from '~icons/mdi/lightning-bolt';
	import IconLockClock from '~icons/mdi/lock-clock';
	import IconHelpCircle from '~icons/mdi/help-circle';

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

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeModal();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Help Button - Always in DOM but hidden on mobile (visible on tablet/desktop) for programmatic access -->
{#if showButton}
	<button
		class="btn btn-ghost hidden gap-2"
		onclick={openModal}
		title={$t('common.components.wallet_help_modal.button_title')}
		data-help-modal
	>
		<IconHelpCircle class="h-5 w-5" />
		{$t('common.components.wallet_help_modal.learn_more')}
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
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 sm:h-5 sm:w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
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
					<div class="card bg-base-200 h-full">
						<div class="card-body flex h-full flex-col p-3 sm:p-4">
							<div class="mb-2 flex h-10 items-center gap-2 sm:mb-3 sm:h-12 sm:gap-3">
								<IconSwapHorizontalCircleOutline class="text-primary h-6 w-6 sm:h-8 sm:w-8" />
								<h4 class="card-title text-base-content text-sm sm:text-base">
									{$t('common.components.wallet_help_modal.multi_network_title')}
								</h4>
							</div>
							<div class="flex-1"></div>
							<p class="text-base-content/80 text-xs sm:text-sm">
								{$t('common.components.wallet_help_modal.multi_network_description')}
							</p>
						</div>
					</div>

					<div class="card bg-base-200 h-full">
						<div class="card-body flex h-full flex-col p-3 sm:p-4">
							<div class="mb-2 flex h-10 items-center gap-2 sm:mb-3 sm:h-12 sm:gap-3">
								<IconShieldCheck class="text-primary h-6 w-6 sm:h-8 sm:w-8" />
								<h4 class="card-title text-base-content text-sm sm:text-base">
									{$t('common.components.wallet_help_modal.security_title')}
								</h4>
							</div>
							<div class="flex-1"></div>
							<p class="text-base-content/80 text-xs sm:text-sm">
								{$t('common.components.wallet_help_modal.security_description')}
							</p>
						</div>
					</div>

					<div class="card bg-base-200 h-full">
						<div class="card-body flex h-full flex-col p-3 sm:p-4">
							<div class="mb-2 flex h-10 items-center gap-2 sm:mb-3 sm:h-12 sm:gap-3">
								<IconLightningBolt class="text-primary h-6 w-6 sm:h-8 sm:w-8" />
								<h4 class="card-title text-base-content text-sm sm:text-base">
									{$t('common.components.wallet_help_modal.lightning_title')}
								</h4>
							</div>
							<div class="flex-1"></div>
							<p class="text-base-content/80 text-xs sm:text-sm">
								{$t('common.components.wallet_help_modal.lightning_description')}
							</p>
						</div>
					</div>

					<div class="card bg-base-200 h-full">
						<div class="card-body flex h-full flex-col p-3 sm:p-4">
							<div class="mb-2 flex h-10 items-center gap-2 sm:mb-3 sm:h-12 sm:gap-3">
								<IconLockClock class="text-primary h-6 w-6 sm:h-8 sm:w-8" />
								<h4 class="card-title text-base-content text-sm sm:text-base">
									{$t('common.components.wallet_help_modal.escrow_title')}
								</h4>
							</div>
							<div class="flex-1"></div>
							<p class="text-base-content/80 text-xs sm:text-sm">
								{$t('common.components.wallet_help_modal.escrow_description')}
							</p>
						</div>
					</div>
				</div>

				<!-- How It Works -->
				<div class="card bg-base-200">
					<div class="card-body p-3 sm:p-4">
						<h4 class="card-title text-base-content mb-3 text-sm sm:mb-4 sm:text-base">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 sm:h-5 sm:w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
								/>
							</svg>
							{$t('common.components.wallet_help_modal.how_it_works_title')}
						</h4>
						<div class="space-y-2 sm:space-y-3">
							<div class="flex items-center gap-2 sm:gap-3">
								<div
									class="bg-primary text-primary-content flex h-5 min-h-5 w-5 min-w-5 items-center justify-center rounded-full text-xs font-medium sm:h-6 sm:min-h-6 sm:w-6 sm:min-w-6"
								>
									1
								</div>
								<div>
									<h5 class="text-base-content text-xs font-medium sm:text-sm">
										{$t('common.components.wallet_help_modal.step1_title')}
									</h5>
									<p class="text-base-content/70 text-xs">
										{$t('common.components.wallet_help_modal.step1_description')}
									</p>
								</div>
							</div>
							<div class="flex items-center gap-2 sm:gap-3">
								<div
									class="bg-primary text-primary-content flex h-5 min-h-5 w-5 min-w-5 items-center justify-center rounded-full text-xs font-medium sm:h-6 sm:min-h-6 sm:w-6 sm:min-w-6"
								>
									2
								</div>
								<div>
									<h5 class="text-base-content text-xs font-medium sm:text-sm">
										{$t('common.components.wallet_help_modal.step2_title')}
									</h5>
									<p class="text-base-content/70 text-xs">
										{$t('common.components.wallet_help_modal.step2_description')}
									</p>
								</div>
							</div>
							<div class="flex items-center gap-2 sm:gap-3">
								<div
									class="bg-primary text-primary-content flex h-5 min-h-5 w-5 min-w-5 items-center justify-center rounded-full text-xs font-medium sm:h-6 sm:min-h-6 sm:w-6 sm:min-w-6"
								>
									3
								</div>
								<div>
									<h5 class="text-base-content text-xs font-medium sm:text-sm">
										{$t('common.components.wallet_help_modal.step3_title')}
									</h5>
									<p class="text-base-content/70 text-xs">
										{$t('common.components.wallet_help_modal.step3_description')}
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Benefits -->
				<div class="alert alert-success alert-outline">
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
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						></path>
					</svg>
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
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 sm:h-5 sm:w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							{$t('common.components.wallet_help_modal.faq_title')}
						</h4>

						<div class="space-y-1.5 sm:space-y-2">
							<!-- What is Rootstock Bitcoin? -->
							<div
								class="collapse-arrow border-base-300 collapse rounded-lg border"
								class:collapse-open={openFaqIndex === 0}
							>
								<button
									type="button"
									class="collapse-title text-base-content py-2 text-left text-sm font-medium sm:py-3 sm:text-base"
									onclick={() => toggleFaq(0)}
								>
									{$t('common.components.wallet_help_modal.faq_rsk_title')}
								</button>
								<div class="collapse-content">
									<div class="space-y-2 sm:space-y-3">
										<p class="text-base-content/80 text-xs sm:text-sm">
											{$t('common.components.wallet_help_modal.faq_rsk_description')}
										</p>
										<ul
											class="text-base-content/70 list-inside list-disc space-y-0.5 text-xs sm:space-y-1"
										>
											<li>
												<strong>{$t('common.components.wallet_help_modal.faq_rsk_security')}</strong
												>
												{$t('common.components.wallet_help_modal.faq_rsk_security_desc')}
											</li>
											<li>
												<strong
													>{$t('common.components.wallet_help_modal.faq_rsk_contracts')}</strong
												>
												{$t('common.components.wallet_help_modal.faq_rsk_contracts_desc')}
											</li>
											<li>
												<strong
													>{$t('common.components.wallet_help_modal.faq_rsk_settlement')}</strong
												>
												{$t('common.components.wallet_help_modal.faq_rsk_settlement_desc')}
											</li>
											<li>
												<strong>{$t('common.components.wallet_help_modal.faq_rsk_fees')}</strong>
												{$t('common.components.wallet_help_modal.faq_rsk_fees_desc')}
											</li>
											<li>
												<strong>{$t('common.components.wallet_help_modal.faq_rsk_peg')}</strong>
												{$t('common.components.wallet_help_modal.faq_rsk_peg_desc')}
											</li>
										</ul>
									</div>
								</div>
							</div>

							<!-- What is Liquid Bitcoin? -->
							<div
								class="collapse-arrow border-base-300 collapse rounded-lg border"
								class:collapse-open={openFaqIndex === 1}
							>
								<button
									type="button"
									class="collapse-title text-base-content py-2 text-left text-sm font-medium sm:py-3 sm:text-base"
									onclick={() => toggleFaq(1)}
								>
									{$t('common.components.wallet_help_modal.faq_liquid_title')}
								</button>
								<div class="collapse-content">
									<div class="space-y-2 sm:space-y-3">
										<p class="text-base-content/80 text-xs sm:text-sm">
											{$t('common.components.wallet_help_modal.faq_liquid_description')}
										</p>
										<ul
											class="text-base-content/70 list-inside list-disc space-y-0.5 text-xs sm:space-y-1"
										>
											<li>
												<strong
													>{$t('common.components.wallet_help_modal.faq_liquid_settlement')}</strong
												>
												{$t('common.components.wallet_help_modal.faq_liquid_settlement_desc')}
											</li>
											<li>
												<strong
													>{$t('common.components.wallet_help_modal.faq_liquid_scripting')}</strong
												>
												{$t('common.components.wallet_help_modal.faq_liquid_scripting_desc')}
											</li>
											<li>
												<strong
													>{$t('common.components.wallet_help_modal.faq_liquid_assets')}</strong
												>
												{$t('common.components.wallet_help_modal.faq_liquid_assets_desc')}
											</li>
											<li>
												<strong>{$t('common.components.wallet_help_modal.faq_liquid_peg')}</strong>
												{$t('common.components.wallet_help_modal.faq_liquid_peg_desc')}
											</li>
											<li>
												<strong>{$t('common.components.wallet_help_modal.faq_liquid_fees')}</strong>
												{$t('common.components.wallet_help_modal.faq_liquid_fees_desc')}
											</li>
										</ul>
									</div>
								</div>
							</div>

							<!-- Can I use Lightning Bitcoin? -->
							<div
								class="collapse-arrow border-base-300 collapse rounded-lg border"
								class:collapse-open={openFaqIndex === 2}
							>
								<button
									type="button"
									class="collapse-title text-base-content py-2 text-left text-sm font-medium sm:py-3 sm:text-base"
									onclick={() => toggleFaq(2)}
								>
									{$t('common.components.wallet_help_modal.faq_lightning_title')}
								</button>
								<div class="collapse-content">
									<div class="space-y-2 sm:space-y-3">
										<p class="text-base-content/80 text-xs sm:text-sm">
											{$t('common.components.wallet_help_modal.faq_lightning_description')}
										</p>
										<ul
											class="text-base-content/70 list-inside list-disc space-y-0.5 text-xs sm:space-y-1"
										>
											<li>
												<strong
													>{$t(
														'common.components.wallet_help_modal.faq_lightning_deposits'
													)}</strong
												>
												{$t('common.components.wallet_help_modal.faq_lightning_deposits_desc')}
											</li>
											<li>
												<strong
													>{$t('common.components.wallet_help_modal.faq_lightning_fees')}</strong
												>
												{$t('common.components.wallet_help_modal.faq_lightning_fees_desc')}
											</li>
											<li>
												<strong
													>{$t(
														'common.components.wallet_help_modal.faq_lightning_conversion'
													)}</strong
												>
												{$t('common.components.wallet_help_modal.faq_lightning_conversion_desc')}
											</li>
											<li>
												<strong
													>{$t(
														'common.components.wallet_help_modal.faq_lightning_withdrawals'
													)}</strong
												>
												{$t('common.components.wallet_help_modal.faq_lightning_withdrawals_desc')}
											</li>
											<li>
												<strong
													>{$t(
														'common.components.wallet_help_modal.faq_lightning_adoption'
													)}</strong
												>
												{$t('common.components.wallet_help_modal.faq_lightning_adoption_desc')}
											</li>
										</ul>
									</div>
								</div>
							</div>

							<!-- Why doesn't BitTasker just use Lightning for escrow? -->
							<div
								class="collapse-arrow border-base-300 collapse rounded-lg border"
								class:collapse-open={openFaqIndex === 3}
							>
								<button
									type="button"
									class="collapse-title text-base-content py-2 text-left text-sm font-medium sm:py-3 sm:text-base"
									onclick={() => toggleFaq(3)}
								>
									{$t('common.components.wallet_help_modal.faq_escrow_title')}
								</button>
								<div class="collapse-content">
									<div class="space-y-2 sm:space-y-3">
										<p class="text-base-content/80 text-xs sm:text-sm">
											{$t('common.components.wallet_help_modal.faq_escrow_description')}
										</p>
										<ul
											class="text-base-content/70 list-inside list-disc space-y-0.5 text-xs sm:space-y-1"
										>
											<li>
												<strong
													>{$t('common.components.wallet_help_modal.faq_escrow_channels')}</strong
												>
												{$t('common.components.wallet_help_modal.faq_escrow_channels_desc')}
											</li>
											<li>
												<strong>{$t('common.components.wallet_help_modal.faq_escrow_time')}</strong>
												{$t('common.components.wallet_help_modal.faq_escrow_time_desc')}
											</li>
											<li>
												<strong
													>{$t('common.components.wallet_help_modal.faq_escrow_contracts')}</strong
												>
												{$t('common.components.wallet_help_modal.faq_escrow_contracts_desc')}
											</li>
											<li>
												<strong
													>{$t('common.components.wallet_help_modal.faq_escrow_multisig')}</strong
												>
												{$t('common.components.wallet_help_modal.faq_escrow_multisig_desc')}
											</li>
											<li>
												<strong>{$t('common.components.wallet_help_modal.faq_escrow_risks')}</strong
												>
												{$t('common.components.wallet_help_modal.faq_escrow_risks_desc')}
											</li>
										</ul>
									</div>
								</div>
							</div>

							<!-- What is USDT and how do I use it? -->
							<div
								class="collapse-arrow border-base-300 collapse rounded-lg border"
								class:collapse-open={openFaqIndex === 4}
							>
								<button
									type="button"
									class="collapse-title text-base-content py-2 text-left text-sm font-medium sm:py-3 sm:text-base"
									onclick={() => toggleFaq(4)}
								>
									{$t('wallet.information.faq_usdt_title')}
								</button>
								<div class="collapse-content">
									<div class="space-y-2 sm:space-y-3">
										<p class="text-base-content/80 text-xs sm:text-sm">
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html $t('wallet.information.faq_usdt_body')}
										</p>
										<ul
											class="text-base-content/70 list-inside list-disc space-y-0.5 text-xs sm:space-y-1"
										>
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											<li>{@html $t('wallet.information.faq_usdt_bullet_1')}</li>
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											<li>{@html $t('wallet.information.faq_usdt_bullet_2')}</li>
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											<li>{@html $t('wallet.information.faq_usdt_bullet_3')}</li>
										</ul>
									</div>
								</div>
							</div>

							<!-- Can I use my own wallet (MetaMask, Ledger)? -->
							<div
								class="collapse-arrow border-base-300 collapse rounded-lg border"
								class:collapse-open={openFaqIndex === 5}
							>
								<button
									type="button"
									class="collapse-title text-base-content py-2 text-left text-sm font-medium sm:py-3 sm:text-base"
									onclick={() => toggleFaq(5)}
								>
									{$t('wallet.information.faq_ownwallet_title')}
								</button>
								<div class="collapse-content">
									<div class="space-y-2 sm:space-y-3">
										<p class="text-base-content/80 text-xs sm:text-sm">
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html $t('wallet.information.faq_ownwallet_body')}
										</p>
										<ul
											class="text-base-content/70 list-inside list-disc space-y-0.5 text-xs sm:space-y-1"
										>
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											<li>{@html $t('wallet.information.faq_ownwallet_bullet_1')}</li>
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											<li>{@html $t('wallet.information.faq_ownwallet_bullet_2')}</li>
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											<li>{@html $t('wallet.information.faq_ownwallet_bullet_3')}</li>
										</ul>
										<p class="text-base-content/80 text-xs sm:text-sm">
											{$t('wallet.information.faq_ownwallet_footer')}
										</p>
									</div>
								</div>
							</div>
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
					<svg class="mr-1 h-4 w-4 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.05);
		}
	}
</style>
