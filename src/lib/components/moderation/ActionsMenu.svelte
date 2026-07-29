<script lang="ts">
	/**
	 * ContentMenu — Three-dot moderation menu
	 *
	 * Renders a ⋮ button that opens a dropdown with "Report" and "Mute" options.
	 * Used on task cards, bid cards, messages, and profile pages.
	 *
	 * Google Play compliance: this is the "clearly labeled, readily accessible"
	 * reporting/blocking mechanism required by the User Generated Content policy.
	 */
	import { t } from 'svelte-i18n';
	import { mutePubkey } from '$lib/nostr/muteList';
	import { appStore } from '$lib/stores/app.store';
	import { teleport } from '$lib/utils/portal';
	import ReportModal from './ReportModal.svelte';

	type ContentType = 'task' | 'bid' | 'message' | 'user' | 'service';

	let {
		contentType,
		reportedPubkey,
		reportedEventId,
		username,
		/** When true, only shows "Report user" and "Block user" (no content-specific report) */
		profileMode = false,
		class: extraClass = '',
		/** Called after a mute is confirmed with the number of tasks removed from the store */
		onMuted
	}: {
		contentType: ContentType;
		reportedPubkey: string;
		reportedEventId?: string;
		username?: string;
		profileMode?: boolean;
		class?: string;
		onMuted?: (removedCount: number) => void;
	} = $props();

	let isDropdownOpen = $state(false);
	let isReportModalOpen = $state(false);
	let isMuting = $state(false);

	// Fixed-position dropdown coords — avoids clipping by overflow:hidden/auto ancestors
	let dropdownTop = $state(0);
	let dropdownRight = $state(0);
	let triggerRef = $state<HTMLButtonElement | null>(null);

	const reportLabels = {
		user: $t('moderation.menu.report_user'),
		task: $t('moderation.menu.report_task'),
		bid: $t('moderation.menu.report_bid'),
		message: $t('moderation.menu.report_message'),
		service: $t('moderation.menu.report_service'),
		mute: $t('moderation.menu.mute_user'),
		mute_generic: $t('moderation.menu.mute_user_generic'),
		block: $t('moderation.menu.block_user')
	};

	const muteLabel = $derived(
		username ? $t('moderation.menu.mute_user', { values: { username } }) : reportLabels.mute_generic
	);

	function openDropdown(e: MouseEvent) {
		e.stopPropagation();
		if (!isDropdownOpen && triggerRef) {
			const rect = triggerRef.getBoundingClientRect();
			dropdownTop = rect.bottom + 4;
			dropdownRight = window.innerWidth - rect.right;
		}
		isDropdownOpen = !isDropdownOpen;
	}

	function closeDropdown() {
		isDropdownOpen = false;
	}

	function openReportModal(e: MouseEvent) {
		e.stopPropagation();
		isDropdownOpen = false;
		isReportModalOpen = true;
	}

	async function handleMute(e: MouseEvent) {
		e.stopPropagation();
		isMuting = true;

		try {
			const removedCount = await mutePubkey(reportedPubkey);
			const toastMsg = username
				? $t('moderation.menu.muted_toast', { values: { username } })
				: $t('moderation.menu.muted_toast_generic');
			appStore.showSuccessToast(toastMsg);
			onMuted?.(removedCount);
		} catch {
			appStore.showErrorToast($t('moderation.menu.mute_error'));
		} finally {
			isMuting = false;
			isDropdownOpen = false;
		}
	}
</script>

<div class="relative inline-block {extraClass}">
	<!-- Three-dot trigger button -->
	<button
		bind:this={triggerRef}
		class="btn btn-ghost btn-xs btn-circle text-base-content/50 hover:text-base-content"
		onclick={openDropdown}
		aria-label={$t('moderation.menu.report')}
		aria-haspopup="true"
		aria-expanded={isDropdownOpen}
		title={$t('moderation.menu.report')}
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-4 w-4"
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden="true"
		>
			<circle cx="12" cy="5" r="1.5" />
			<circle cx="12" cy="12" r="1.5" />
			<circle cx="12" cy="19" r="1.5" />
		</svg>
	</button>
</div>

<!-- Dropdown + modal teleported to #portal-root to escape overflow:hidden/overflow-x:hidden ancestors -->
{#if isDropdownOpen}
	<!-- Click-outside backdrop -->
	<div
		use:teleport
		class="fixed inset-0 z-9998"
		role="presentation"
		onclick={closeDropdown}
		onkeydown={(e) => e.key === 'Escape' && closeDropdown()}
	></div>
	<!-- Dropdown menu -->
	<div
		use:teleport
		class="border-base-300 bg-base-100 fixed z-9999 min-w-48 rounded-lg border py-1 shadow-lg"
		style="top: {dropdownTop}px; right: {dropdownRight}px;"
		role="menu"
	>
		<!-- Report option -->
		<button
			class="hover:bg-base-200 text-base-content flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
			role="menuitem"
			onclick={openReportModal}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-warning h-4 w-4 shrink-0"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6H11.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
				/>
			</svg>
			<span>{profileMode ? reportLabels.user : reportLabels[contentType]}</span>
		</button>

		<!-- Mute/Block option -->
		<button
			class="hover:bg-base-200 text-base-content flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
			role="menuitem"
			onclick={handleMute}
			disabled={isMuting}
		>
			{#if isMuting}
				<span class="loading loading-spinner loading-xs shrink-0"></span>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-error h-4 w-4 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
					/>
				</svg>
			{/if}
			<span>{profileMode ? reportLabels.block : muteLabel}</span>
		</button>
	</div>
{/if}

<!-- Report modal — also teleported to escape overflow ancestors -->
{#if isReportModalOpen}
	<div use:teleport>
		<ReportModal
			isOpen={isReportModalOpen}
			onClose={() => (isReportModalOpen = false)}
			contentType={contentType as 'task' | 'bid' | 'message' | 'user'}
			{reportedPubkey}
			{reportedEventId}
			{username}
		/>
	</div>
{/if}
