<script lang="ts">
	import { devicePlatform } from '$lib/stores/device.store';
	import { page } from '$app/state';
	import { sections } from '$lib/utils/consts';
	import { t } from 'svelte-i18n';
	import IconFormatListBulleted from '~icons/mdi/format-list-bulleted';
	import IconPlusCircleOutline from '~icons/mdi/plus-circle-outline';
	import IconMagnify from '~icons/mdi/magnify';
	import IconInvoiceTextSendOutline from '~icons/mdi/invoice-text-send-outline';
	import IconFileSign from '~icons/mdi/file-sign';
	import IconWalletOutline from '~icons/mdi/wallet-outline';
	import IconAccount from '~icons/mdi/account';
	import IconChatOutline from '~icons/mdi/chat-outline';
	import IconCog from '~icons/mdi/cog';
	import WarningPopup from '$lib/components/WarningPopup.svelte';
	import NotificationPermissionBanner from '$lib/components/notifications/NotificationPermissionBanner.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { walletManager } from '$lib/stores/wallet.store';

	let { children } = $props();

	let width = $state(375);

	onMount(async () => {
		try {
			// Ensure wallet is initialized BEFORE loading dashboard
			const { walletStore, walletManager } = await import('$lib/stores/wallet.store');
			const { get } = await import('svelte/store');
			let walletState = get(walletStore);

			// Wait for wallet initialization if not already initialized
			if (!walletState.isConnected || !walletState.rsk?.wallet || !walletState.rsk?.provider) {
				await walletManager.initialize();
				walletState = get(walletStore);
			}
		} catch {
			// Continue anyway - contracts will handle wallet initialization individually
		}

		// NDK signer is loaded only from NdkIdentityGate so passkey is not raced with wallet init.
	});

	// Dispose SDK / ethers providers only when leaving the whole dashboard shell — not when
	// swapping child routes (e.g. wallet page ↔ contracts tab). Child pages must not call cleanup.
	onDestroy(() => {
		walletManager.cleanup();
	});
</script>

<svelte:head>
	<title>Dashboard | BitTasker</title>
	<meta
		name="description"
		content="Manage your tasks, bids, and wallet on BitTasker's dashboard."
	/>
</svelte:head>

<svelte:window bind:innerWidth={width} />

<div
	class="bg-base-200 dashboard-layout mx-auto flex h-full min-h-0 w-full flex-col overflow-hidden px-2 md:py-4"
>
	<div class="flex min-h-0 flex-1 flex-row gap-8 overflow-hidden">
		{#if $devicePlatform !== 'ios' && $devicePlatform !== 'android' && width >= 1200}
			<!-- Fixed Sidebar - Solo en desktop -->
			<div class="w-full shrink-0 md:w-64">
				<div class="fixed top-24 left-8 z-10 w-60">
					<div class="card bg-base-100 rounded-xl shadow-xl">
						<div class="card-body p-4">
							<ul class="menu bg-base-100 rounded-box w-full">
								{#each sections as section (section.id)}
									<li class="my-1">
										<a
											data-sveltekit-reload="off"
											href={section.path}
											class:menu-active={page.url.pathname + page.url.search === section.path}
											class="flex items-center gap-3"
										>
											{#if section.icon === 'mdi:format-list-bulleted'}
												<IconFormatListBulleted class="text-primary" />
											{:else if section.icon === 'mdi:plus-circle-outline'}
												<IconPlusCircleOutline class="text-primary" />
											{:else if section.icon === 'mdi:magnify'}
												<IconMagnify class="text-primary" />
											{:else if section.icon === 'mdi:invoice-text-send-outline'}
												<IconInvoiceTextSendOutline class="text-primary" />
											{:else if section.icon === 'mdi:file-sign'}
												<IconFileSign class="text-primary" />
											{:else if section.icon === 'mdi:wallet-outline'}
												<IconWalletOutline class="text-primary" />
											{:else if section.icon === 'mdi:account'}
												<IconAccount class="text-primary" />
											{:else if section.icon === 'mdi:chat-outline'}
												<IconChatOutline class="text-primary" />
											{:else if section.icon === 'mdi:cog'}
												<IconCog class="text-primary" />
											{:else}
												<IconFormatListBulleted class="text-primary" />
											{/if}
											{$t(section.label)}
										</a>
									</li>
								{/each}
							</ul>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Main Content with left margin for fixed sidebar -->
		<div class="min-h-0 w-full flex-1 overflow-hidden">
			{@render children()}
			<NotificationPermissionBanner />
			<WarningPopup />
		</div>
	</div>
</div>

<style>
	/* Ensure dashboard layout fills available space without causing scroll */
	.dashboard-layout {
		height: 100%;
		max-height: 100%;
		overflow: hidden;
		flex: 1;
		min-height: 0;
	}
</style>
