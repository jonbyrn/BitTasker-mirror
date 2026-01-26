<script lang="ts">
	import { t } from 'svelte-i18n';
	import { fly, fade } from 'svelte/transition';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import IconClose from '~icons/mdi/close';
	import IconShieldCheck from '~icons/mdi/shield-check';
	import IconLock from '~icons/mdi/lock';
	import IconClock from '~icons/mdi/clock';
	import IconHandshake from '~icons/mdi/handshake';
	import IconAlertCircle from '~icons/mdi/alert-circle';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
	}

	let { isOpen, onClose }: Props = $props();

	// Helper function to convert markdown-style bold (**text**) to HTML
	function formatBold(text: string): string {
		return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
	}

	function closeModal() {
		triggerHaptic(ImpactStyle.Light);
		onClose();
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

<svelte:window onkeydown={handleKeydown} />

<!-- Modal -->
<input
	type="checkbox"
	class="modal-toggle"
	checked={isOpen}
	style="display:none"
	readonly
	aria-label={$t('common.components.secure_payment_contract_modal.title')}
/>
{#if isOpen}
	<div class="modal modal-open" transition:fade={{ duration: 200 }}>
		<div class="modal-box max-w-4xl max-h-[85vh] flex flex-col p-0" transition:fly={{ y: 20, duration: 300 }}>
			<!-- Modal Header -->
			<div class="flex items-center justify-between bg-base-300 px-3 py-2 rounded-t-lg sm:px-4 sm:py-3">
				<div class="flex items-center gap-2 sm:gap-3">
					<div class="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full sm:h-10 sm:w-10">
						<IconShieldCheck class="h-5 w-5 text-primary sm:h-6 sm:w-6" />
					</div>
					<h4 class="text-base font-bold text-base-content sm:text-lg">
						{$t('common.components.secure_payment_contract_modal.title')}
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
			<div class="space-y-4 overflow-y-auto flex-1 p-3 sm:space-y-6 sm:p-6">
				<!-- Hero Section -->
				<div class="text-center">
					<div class="mb-3 flex justify-center sm:mb-4">
						<div class="bg-primary/10 rounded-full p-3 sm:p-4">
							<IconLock class="h-12 w-12 text-primary sm:h-16 sm:w-16" />
						</div>
					</div>
					<h3 class="text-lg font-bold text-base-content mb-1.5 sm:text-xl sm:mb-2">
						{$t('common.components.secure_payment_contract_modal.hero_title')}
					</h3>
					<p class="text-base-content/70 text-base sm:text-lg">
						{$t('common.components.secure_payment_contract_modal.hero_description')}
					</p>
				</div>

				<!-- For Taskers -->
				<div class="card bg-base-200">
					<div class="card-body p-3 sm:p-4">
						<h4 class="card-title text-sm text-base-content mb-3 sm:text-base sm:mb-4">
							<IconHandshake class="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
							{$t('common.components.secure_payment_contract_modal.for_taskers_title')}
						</h4>
						<ul class="space-y-2 text-xs text-base-content/80 sm:text-sm sm:space-y-3">
							<li class="flex items-start gap-2">
								<span class="text-primary mt-0.5 shrink-0">•</span>
								<span>{@html formatBold($t('common.components.secure_payment_contract_modal.for_taskers_locked'))}</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="text-primary mt-0.5 shrink-0">•</span>
								<span>{@html formatBold($t('common.components.secure_payment_contract_modal.for_taskers_review'))}</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="text-primary mt-0.5 shrink-0">•</span>
								<span>{@html formatBold($t('common.components.secure_payment_contract_modal.for_taskers_grace'))}</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="text-primary mt-0.5 shrink-0">•</span>
								<span>{@html formatBold($t('common.components.secure_payment_contract_modal.for_taskers_dispute'))}</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="text-primary mt-0.5 shrink-0">•</span>
								<span>{@html formatBold($t('common.components.secure_payment_contract_modal.for_taskers_cancel'))}</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="text-primary mt-0.5 shrink-0">•</span>
								<span>{@html formatBold($t('common.components.secure_payment_contract_modal.for_taskers_no_show'))}</span>
							</li>
						</ul>
					</div>
				</div>

				<!-- For Taskees -->
				<div class="card bg-base-200">
					<div class="card-body p-3 sm:p-4">
						<h4 class="card-title text-sm text-base-content mb-3 sm:text-base sm:mb-4">
							<IconHandshake class="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
							{$t('common.components.secure_payment_contract_modal.for_taskees_title')}
						</h4>
						<ul class="space-y-2 text-xs text-base-content/80 sm:text-sm sm:space-y-3">
							<li class="flex items-start gap-2">
								<span class="text-primary mt-0.5 shrink-0">•</span>
								<span>{@html formatBold($t('common.components.secure_payment_contract_modal.for_taskees_guaranteed'))}</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="text-primary mt-0.5 shrink-0">•</span>
								<span>{@html formatBold($t('common.components.secure_payment_contract_modal.for_taskees_upfront'))}</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="text-primary mt-0.5 shrink-0">•</span>
								<span>{@html formatBold($t('common.components.secure_payment_contract_modal.for_taskees_dispute'))}</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="text-primary mt-0.5 shrink-0">•</span>
								<span>{@html formatBold($t('common.components.secure_payment_contract_modal.for_taskees_refund'))}</span>
							</li>
						</ul>
					</div>
				</div>

				<!-- Platform Fees -->
				<div class="card bg-base-200">
					<div class="card-body p-3 sm:p-4">
						<h4 class="card-title text-sm text-base-content mb-3 sm:text-base sm:mb-4">
							<IconAlertCircle class="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
							{$t('common.components.secure_payment_contract_modal.platform_fees_title')}
						</h4>
						<p class="text-xs text-base-content/80 sm:text-sm">
							{@html formatBold($t('common.components.secure_payment_contract_modal.platform_fees_both'))}
						</p>
					</div>
				</div>

				<!-- Important Time Limits -->
				<div class="card bg-base-200">
					<div class="card-body p-3 sm:p-4">
						<h4 class="card-title text-sm text-base-content mb-3 sm:text-base sm:mb-4">
							<IconClock class="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
							{$t('common.components.secure_payment_contract_modal.time_limits_title')}
						</h4>
						<ul class="space-y-2 text-xs text-base-content/80 sm:text-sm sm:space-y-3">
							<li class="flex items-start gap-2">
								<span class="text-primary mt-0.5 shrink-0">•</span>
								<span>{@html formatBold($t('common.components.secure_payment_contract_modal.time_limits_grace'))}</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="text-primary mt-0.5 shrink-0">•</span>
								<span>{@html formatBold($t('common.components.secure_payment_contract_modal.time_limits_cancellation'))}</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="text-primary mt-0.5 shrink-0">•</span>
								<span>{@html formatBold($t('common.components.secure_payment_contract_modal.time_limits_review'))}</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="text-primary mt-0.5 shrink-0">•</span>
								<span>{@html formatBold($t('common.components.secure_payment_contract_modal.time_limits_dispute'))}</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="text-primary mt-0.5 shrink-0">•</span>
								<span>{@html formatBold($t('common.components.secure_payment_contract_modal.time_limits_no_show'))}</span>
							</li>
						</ul>
					</div>
				</div>

				<!-- Dispute Process -->
				<div class="card bg-base-200">
					<div class="card-body p-3 sm:p-4">
						<h4 class="card-title text-sm text-base-content mb-3 sm:text-base sm:mb-4">
							<IconHandshake class="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
							{$t('common.components.secure_payment_contract_modal.dispute_process_title')}
						</h4>
						<div class="space-y-2 sm:space-y-3">
							<div class="flex items-center gap-2">
								<div
									class="bg-primary text-primary-content flex h-5 w-5 min-h-5 min-w-5 items-center justify-center rounded-full text-xs font-medium sm:h-6 sm:w-6 sm:min-h-6 sm:min-w-6 shrink-0"
								>
									1
								</div>
								<p class="text-xs text-base-content/80 sm:text-sm">
									{@html formatBold($t('common.components.secure_payment_contract_modal.dispute_process_step1'))}
								</p>
							</div>
							<div class="flex items-center gap-2">
								<div
									class="bg-primary text-primary-content flex h-5 w-5 min-h-5 min-w-5 items-center justify-center rounded-full text-xs font-medium sm:h-6 sm:w-6 sm:min-h-6 sm:min-w-6 shrink-0"
								>
									2
								</div>
								<p class="text-xs text-base-content/80 sm:text-sm">
									{@html formatBold($t('common.components.secure_payment_contract_modal.dispute_process_step2'))}
								</p>
							</div>
							<div class="flex items-center gap-2">
								<div
									class="bg-primary text-primary-content flex h-5 w-5 min-h-5 min-w-5 items-center justify-center rounded-full text-xs font-medium sm:h-6 sm:w-6 sm:min-h-6 sm:min-w-6 shrink-0"
								>
									3
								</div>
								<p class="text-xs text-base-content/80 sm:text-sm">
									{@html formatBold($t('common.components.secure_payment_contract_modal.dispute_process_step3'))}
								</p>
							</div>
							<div class="flex items-center gap-2">
								<div
									class="bg-primary text-primary-content flex h-5 w-5 min-h-5 min-w-5 items-center justify-center rounded-full text-xs font-medium sm:h-6 sm:w-6 sm:min-h-6 sm:min-w-6 shrink-0"
								>
									4
								</div>
								<p class="text-xs text-base-content/80 sm:text-sm">
									{@html formatBold($t('common.components.secure_payment_contract_modal.dispute_process_step4'))}
								</p>
							</div>
						</div>
					</div>
				</div>

				<!-- Cancellation Rules -->
				<div class="card bg-base-200">
					<div class="card-body p-3 sm:p-4">
						<h4 class="card-title text-sm text-base-content mb-3 sm:text-base sm:mb-4">
							<IconAlertCircle class="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
							{$t('common.components.secure_payment_contract_modal.cancellation_rules_title')}
						</h4>
						<div class="space-y-2 text-xs text-base-content/80 sm:text-sm sm:space-y-3">
							<p>
								{@html formatBold($t('common.components.secure_payment_contract_modal.cancellation_tasker'))}
							</p>
							<p>
								{@html formatBold($t('common.components.secure_payment_contract_modal.cancellation_taskee'))}
							</p>
						</div>
					</div>
				</div>

			</div>

			<!-- Action Buttons - Fixed at bottom -->
			<div class="border-t border-base-300 bg-base-100 flex gap-2 p-3 shrink-0 sm:gap-3 sm:p-4">
				<button
					type="button"
					class="btn btn-primary flex-1 min-h-[44px] text-sm sm:text-base"
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
					{$t('common.components.secure_payment_contract_modal.understand_button')}
				</button>
			</div>
		</div>
		<button class="modal-backdrop" onclick={closeModal} aria-label="Close modal"></button>
	</div>
{/if}
