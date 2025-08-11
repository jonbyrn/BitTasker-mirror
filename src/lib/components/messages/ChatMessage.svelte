<script lang="ts">
	import type { Event as NostrEvent } from 'nostr-tools';
	// We render the specific message sender's avatar from the provided `profile`
	import { formatTimeAgo } from '$lib/utils/helpers/date';

	// Props
	let {
		message,
		isSender,
		profile,
		onViewContract
	}: {
		message: { plaintext: string; senderPubkey: string; event: NostrEvent };
		isSender: boolean;
		profile: { name?: string; picture?: string };
		onViewContract?: (detail: { payload: any; event: NostrEvent; isSender: boolean }) => void;
	} = $props();

	// Local state for image fallback
	let imageError = $state(false);

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

	const special = $derived(tryParseSpecial(message.plaintext));

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
	function getInitials(name?: string): string {
		if (!name) return '';
		const parts = name.trim().split(/\s+/);
		if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
		return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
	}
</script>

<div class="mb-4 flex gap-3" class:flex-row-reverse={isSender}>
	<!-- Avatar for the message sender -->
	<div class="flex-shrink-0">
		{#if profile?.picture && !imageError}
			<img
				src={profile.picture}
				alt={profile?.name || 'User'}
				class="h-8 w-8 rounded-full object-cover"
				width={32}
				height={32}
				onerror={() => (imageError = true)}
			/>
		{:else}
			<div
				class="avatar placeholder text-neutral-content bg-base-300 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full"
			>
				{#if profile?.name}
					<span class="text-xs">{getInitials(profile.name)}</span>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="50%" height="50%" viewBox="0 0 24 24">
						<g fill="none" stroke="currentColor" stroke-width="1.5">
							<circle cx="12" cy="6" r="4" />
							<path
								stroke-linecap="round"
								d="M20 18q0-.246 0-.5c0-2.485-3.582-4.5-8-4.5s-8 2.015-8 4.5S4 22 12 22c2.231 0 3.84-.157 5-.437"
							/>
						</g>
					</svg>
				{/if}
			</div>
		{/if}
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
				<div class="bg-warning/10 text-warning-content max-w-sm rounded-2xl px-4 py-3 break-words">
					<div class="mb-1 font-semibold">New contract offer</div>
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
				<div class="bg-success/10 text-success-content max-w-sm rounded-2xl px-4 py-3">
					<div class="flex items-center justify-between">
						<span class="font-medium">Contract accepted</span>
						{#if isSender}
							<button class="btn btn-xs" onclick={handleViewOffer}>Create Vault</button>
						{/if}
					</div>
					<div class="mt-1 text-xs opacity-80">
						Partner Pubkey: {special.freelancerPubkey.slice(0, 8)}... · CSV: {special.csvBlocks}
					</div>
				</div>
			{:else if special.type === 'contract_reject'}
				<div class="bg-error/10 text-error-content rounded-2xl px-4 py-2">
					<span class="font-medium">Contract rejected</span>
					{#if special.reason}
						<span class="opacity-80"> — {special.reason}</span>
					{/if}
				</div>
			{:else if special.type === 'contract_created'}
				<div class="bg-info/10 text-info-content max-w-sm rounded-2xl px-4 py-3 break-words">
					<div class="mb-1 font-semibold">Contract vault created</div>
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
