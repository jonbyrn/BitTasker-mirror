<script lang="ts">
	import { t } from 'svelte-i18n';
	import ChatView from '$lib/components/messages/ChatView.svelte';
	import { assistantContact } from '$lib/qvac/assistant-client';
	import { isQvacEnabled } from '$lib/services/feature-flags';
	import { authState } from '$lib/stores/auth.store';

	const enabled = isQvacEnabled();
	let open = $state(false);
	let pubkey = $state('');
	let looked = $state(false);

	const signedIn = $derived($authState.isAuthenticated);

	$effect(() => {
		if (!open || !signedIn || looked) return;
		looked = true;
		void assistantContact().then((contact) => {
			pubkey = contact?.pubkey || '';
		});
	});

	function toggle() {
		open = !open;
	}
</script>

{#if enabled}
	<div
		class="fixed z-40 flex flex-col items-end"
		style="right: 0.75rem; bottom: calc(var(--app-footer-height, 0px) + 0.75rem);"
	>
		{#if open}
			<section
				class="bg-base-100 border-base-300 mb-2 flex h-[min(28rem,70vh)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border shadow-xl"
				data-testid="qvac-assistant-panel"
			>
				<header class="border-base-300 flex items-center justify-between border-b px-3 py-2">
					<p class="text-sm font-semibold">{$t('common.qvac.assistant_name')}</p>
					<a class="link text-xs" href="/faq">{$t('common.qvac.assistant_help')}</a>
				</header>
				{#if !signedIn}
					<div class="flex flex-1 flex-col items-start justify-center gap-3 p-4 text-sm">
						<p>{$t('common.qvac.assistant_signin')}</p>
						<a class="btn btn-primary btn-sm" href="/auth/login"
							>{$t('common.qvac.assistant_signin')}</a
						>
						<a class="link text-xs" href="/faq">{$t('common.qvac.assistant_help')}</a>
					</div>
				{:else if pubkey}
					<div class="min-h-0 flex-1">
						<ChatView recipientPubkey={pubkey} />
					</div>
				{:else}
					<div class="flex flex-1 flex-col items-start justify-center gap-3 p-4 text-sm">
						<p>{$t('common.qvac.assistant_fallback')}</p>
						<a class="btn btn-outline btn-sm" href="/faq">{$t('common.qvac.assistant_help')}</a>
					</div>
				{/if}
			</section>
		{/if}
		<button
			type="button"
			class="btn btn-primary btn-circle shadow-lg"
			data-testid="qvac-assistant-bubble"
			aria-expanded={open}
			aria-label={$t('common.qvac.assistant_open')}
			onclick={toggle}
		>
			?
		</button>
	</div>
{/if}
