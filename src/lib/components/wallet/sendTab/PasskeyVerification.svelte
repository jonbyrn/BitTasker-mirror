<!--
	Passkey Verification Component
	Handles passkey verification for wallet operations
-->
<script lang="ts">
	import type { PrepareSendResponse } from '@breeztech/breez-sdk-liquid/web';
	import { getMnemonicPasskey } from '$lib/wallet/mnemonicBiometrics';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { sendForm } from '$lib/stores/wallet.store';

	interface VerificationContext {
		operation: string;
		amount?: number;
		destination?: string;
		asset?: string;
		reason?: string;
	}

	// Props
	let {
		context,
		title = 'Security Verification Required',
		show = $bindable(false),
		preparedTransaction,
		selectedAsset,
		onSuccess = () => {},
		onCancel = () => {},
		onError = (error: string) => {}
	}: {
		context: VerificationContext;
		title?: string;
		show?: boolean;
		preparedTransaction?: PrepareSendResponse | null;
		selectedAsset?: string;
		onSuccess?: () => void;
		onCancel?: () => void;
		onError?: (error: string) => void;
	} = $props();

	// State
	let isVerifying = $state(false);
	let error = $state<string | null>(null);

	async function verifyPasskey() {
		try {
			isVerifying = true;
			error = null;

			// Verify with mnemonic passkey - this returns the mnemonic if successful
			const mnemonic = await getMnemonicPasskey();

			if (mnemonic) {
				// Verification successful
				console.log('✅ Passkey verification successful');
				show = false;
				onSuccess();
			} else {
				throw new Error('Passkey verification failed');
			}
		} catch (err) {
			console.error('❌ Passkey verification failed:', err);
			const errorMessage = err instanceof Error ? err.message : 'Verification failed';
			error = errorMessage;
			onError(errorMessage);
		} finally {
			isVerifying = false;
		}
	}

	function handleCancel() {
		show = false;
		onCancel();
	}

	function formatAmount(amount: number, asset: string): string {
		if (asset === 'sats' || asset === 'satoshis') {
			return `${amount.toLocaleString()} sats`;
		}

		// Convert from satoshis to main unit for display
		const mainAmount = amount / 100_000_000;
		return `${mainAmount.toFixed(8)} ${asset}`.replace(/\.?0+$/, '');
	}

	function getOperationIcon(operation: string): string {
		switch (operation.toLowerCase()) {
			case 'send':
				return '↗️';
			case 'receive':
				return '↙️';
			case 'swap':
				return '🔄';
			case 'backup':
				return '💾';
			default:
				return '🔒';
		}
	}

	function getSecurityMessage(): string {
		const op = context.operation.toLowerCase();

		if (context.destination?.includes('@') || context.destination?.startsWith('ln')) {
			return 'This is a Lightning payment and will be processed instantly.';
		}

		if (
			context.destination &&
			(context.destination.startsWith('bc1') ||
				context.destination.startsWith('1') ||
				context.destination.startsWith('3'))
		) {
			return '⚠️ This is an off-platform Bitcoin transfer. Funds will leave your wallet permanently.';
		}

		if (
			context.destination &&
			(context.destination.startsWith('ex1') || context.destination.startsWith('lq1'))
		) {
			return '⚠️ This is an off-platform Liquid transfer. Funds will leave your wallet permanently.';
		}

		switch (op) {
			case 'swap':
				return 'This will initiate a swap between different asset types.';
			case 'backup':
				return 'This will create a secure backup of your wallet data.';
			default:
				return 'This operation requires additional security verification.';
		}
	}

	function isHighRiskOperation(): boolean {
		const destination = context.destination || '';

		// Bitcoin addresses
		if (
			destination.startsWith('bc1') ||
			destination.startsWith('1') ||
			destination.startsWith('3')
		) {
			return true;
		}

		// Liquid addresses
		if (destination.startsWith('ex1') || destination.startsWith('lq1')) {
			return true;
		}

		// High amounts (over $100 equivalent)
		if (context.amount && context.amount > 10_000_000) {
			// 0.1 BTC in sats
			return true;
		}

		return false;
	}
</script>

<div
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: show ? 20 : -20
	}}
>
	<div class="relative max-w-md">
		<!-- Header -->
		<div class="mb-6 flex items-center gap-3">
			<span class="text-3xl">{getOperationIcon(context.operation)}</span>
			<div>
				<h3 class="text-lg font-bold">{title}</h3>
				<p class="text-sm opacity-70">Confirm with your passkey or biometrics</p>
			</div>
		</div>

		<!-- Operation Details -->
		<div class="bg-base-200 mb-6 rounded-lg p-4">
			<div class="space-y-3">
				<div class="flex justify-between">
					<span class="opacity-70">Operation:</span>
					<span class="font-medium capitalize">{context.operation}</span>
				</div>

				{#if context.amount}
					<div class="flex justify-between">
						<span class="opacity-70">Amount:</span>
						<span class="font-medium">{formatAmount(context.amount, context.asset || 'BTC')}</span>
					</div>
				{/if}

				{#if context.destination}
					<div class="flex justify-between">
						<span class="opacity-70">Destination:</span>
						<span class="font-mono text-sm break-all">
							{context.destination.length > 20
								? `${context.destination.substring(0, 10)}...${context.destination.substring(context.destination.length - 10)}`
								: context.destination}
						</span>
					</div>
				{/if}

				{#if context.asset && context.asset !== 'BTC'}
					<div class="flex justify-between">
						<span class="opacity-70">Asset:</span>
						<span class="font-medium">{context.asset}</span>
					</div>
				{/if}
			</div>
		</div>

		<!-- Security Warning -->
		<div class="alert alert-outline {isHighRiskOperation() ? 'alert-warning' : 'alert-info'} mb-6">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 flex-shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<div>
				<h3 class="font-bold">Security Notice</h3>
				<p class="text-sm">{getSecurityMessage()}</p>
			</div>
		</div>

		<!-- Error Display -->
		{#if error}
			<div class="alert alert-outline alert-error mb-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 flex-shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{error}</span>
			</div>
		{/if}

		<!-- Action Buttons -->
		<div class="flex gap-3">
			<button class="btn btn-outline flex-1" onclick={handleCancel} disabled={isVerifying}>
				Cancel
			</button>

			<button
				class="btn btn-primary flex-1 whitespace-nowrap"
				onclick={onSuccess}
				disabled={isVerifying}
			>
				{#if isVerifying}
					<span class="loading loading-spinner loading-sm"></span>
					Verifying...
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
						/>
					</svg>
					Verify with Passkey
				{/if}
			</button>
		</div>

		<!-- Additional Context -->
		{#if context.reason}
			<div class="mt-4 text-center">
				<p class="text-sm opacity-70">{context.reason}</p>
			</div>
		{/if}

		<!-- Transaction Info -->
		{#if preparedTransaction}
			<div class="alert alert-outline alert-info mt-6 text-xs sm:text-sm">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5 flex-shrink-0 stroke-current sm:h-6 sm:w-6"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<div class="flex-1">
					<h3 class="text-sm font-bold sm:text-base">Transaction Prepared</h3>
					<p class="text-xs opacity-75 sm:text-sm">
						Estimated fee: {((preparedTransaction.feesSat || 0) / 100_000_000).toFixed(8)}
						{selectedAsset}
					</p>
				</div>
			</div>
		{/if}

		<!-- Error Display -->
		{#if $sendForm.validationError}
			<div class="alert alert-outline alert-error mt-6">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 flex-shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{$sendForm.validationError}</span>
			</div>
		{/if}
	</div>
</div>
