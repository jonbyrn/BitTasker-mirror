<script lang="ts">
	import type { Event as NostrEvent } from 'nostr-tools';
	import Avatar from '$lib/components/Avatar.svelte';
	import { formatTimeAgo } from '$lib/utils/helpers/date';
	import { t } from 'svelte-i18n';

    // Props
    let {
        message,
        isSender,
        profile
    , onViewContract
    }: {
        message: { plaintext: string; senderPubkey: string; event: NostrEvent };
        isSender: boolean;
        profile: { name?: string; picture?: string };
        onViewContract?: (detail: { payload: any; event: NostrEvent; isSender: boolean }) => void;
    } = $props();

    // Derived timestamp
    const formattedTime = $derived(formatTimeAgo(new Date(message.event.created_at * 1000)));

    type ContractOffer = {
        type: 'contract_offer';
        version: number;
        network: 'liquid';
        derivationPath: string;
        clientPubkey: string;
        csvBlocks: number;
        timestamp?: number;
    };
    type ContractAccept = {
        type: 'contract_accept';
        version: number;
        derivationPath: string;
        freelancerPubkey: string;
        csvBlocks: number;
        referenceDerivationPath?: string;
        timestamp?: number;
    };
    type ContractReject = {
        type: 'contract_reject';
        version: number;
        derivationPath: string;
        reason?: string;
        timestamp?: number;
    };
    type ContractCreated = {
        type: 'contract_created';
        version: number;
        setupId: string;
        vaultId: string;
        address?: string | null;
        descriptor: string;
        csvBlocks: number;
        derivationPath: string;
        timestamp?: number;
    };
    type SpecialMsg = ContractOffer | ContractAccept | ContractReject | ContractCreated;

    function tryParseSpecial(plaintext: string): SpecialMsg | null {
        try {
            const obj = JSON.parse(plaintext);
            if (!obj || typeof obj !== 'object') return null;
            if (
                obj.type === 'contract_offer' ||
                obj.type === 'contract_accept' ||
                obj.type === 'contract_reject' ||
                obj.type === 'contract_created'
            ) {
                return obj as SpecialMsg;
            }
            return null;
        } catch {
            return null;
        }
    }

    const special = $derived(() => tryParseSpecial(message.plaintext));

    function approxTimeFromCsv(blocks: number): string {
        const minutes = blocks; // ~1 min per Liquid block
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `${hours} hr`;
        const days = Math.round(hours / 24);
        return `${days} day${days === 1 ? '' : 's'}`;
    }

    function handleViewOffer() {
        if (onViewContract) {
            onViewContract({ payload: special, event: message.event, isSender });
        }
    }
</script>

<div class="mb-4 flex gap-3" class:flex-row-reverse={isSender}>
	<!-- Avatar -->
	<div class="flex-shrink-0">
		<Avatar
			user={{
				name: profile.name || (isSender ? $t('messages.you') : $t('messages.unknown')),
				picture: profile.picture || null
			}}
			size="sm"
		/>
	</div>

	<!-- Message bubble -->
	<div
		class="flex max-w-xs flex-col lg:max-w-md"
		class:items-end={isSender}
		class:items-start={!isSender}
	>
        <!-- Message content -->
        {#if special}
            <!-- Special contract message rendering -->
            {#if special.type === 'contract_offer'}
                <div class="rounded-2xl px-4 py-3 break-words bg-warning/10 text-warning-content max-w-sm">
                    <div class="font-semibold mb-1">New contract offer</div>
                    <div class="text-sm opacity-80">
                        Deadline: {approxTimeFromCsv(special.csvBlocks)}<br />
                        Pubkey: {special.clientPubkey.slice(0, 8)}...<br />
                        Path: {special.derivationPath}
                    </div>
                    <div class="mt-2">
                        <button class="btn btn-sm" onclick={handleViewOffer}>View</button>
                    </div>
                </div>
            {:else if special.type === 'contract_accept'}
                <div class="rounded-2xl px-4 py-3 bg-success/10 text-success-content max-w-sm">
                    <div class="flex items-center justify-between">
                        <span class="font-medium">Contract accepted</span>
                        {#if isSender}
                            <button class="btn btn-xs" onclick={handleViewOffer}>Create Vault</button>
                        {/if}
                    </div>
                    <div class="text-xs opacity-80 mt-1">
                        Partner Pubkey: {special.freelancerPubkey.slice(0,8)}... · CSV: {special.csvBlocks}
                    </div>
                </div>
            {:else if special.type === 'contract_reject'}
                <div class="rounded-2xl px-4 py-2 bg-error/10 text-error-content">
                    <span class="font-medium">Contract rejected</span>
                    {#if special.reason}
                        <span class="opacity-80"> — {special.reason}</span>
                    {/if}
                </div>
            {:else if special.type === 'contract_created'}
                <div class="rounded-2xl px-4 py-3 break-words bg-info/10 text-info-content max-w-sm">
                    <div class="font-semibold mb-1">Contract vault created</div>
                    <div class="text-sm opacity-80">
                        Address: {special.address || '—'}<br />
                        CSV: {special.csvBlocks} blocks<br />
                        Path: {special.derivationPath}
                    </div>
                </div>
            {/if}
        {:else}
            <div
                class="rounded-2xl px-4 py-2 break-words"
                class:bg-primary={isSender}
                class:text-primary-content={isSender}
                class:bg-base-200={!isSender}
                class:text-base-content={!isSender}
            >
                <p class="text-sm whitespace-pre-wrap">{message.plaintext}</p>
            </div>
        {/if}

		<!-- Timestamp and sender info -->
		<div class="mt-1 flex items-center gap-2 text-xs opacity-70" class:flex-row-reverse={isSender}>
			{#if !isSender && profile.name}
				<span class="font-medium">{profile.name}</span>
			{/if}
			<span>{formattedTime}</span>
		</div>
	</div>
</div>
