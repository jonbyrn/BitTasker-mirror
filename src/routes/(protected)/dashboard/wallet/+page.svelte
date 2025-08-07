<script lang="ts">
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { wallet } from '$lib/utils/consts';
	import { calculateUsdtEstimate, formatBtcToSats } from '$lib/utils/helpers/crypto';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { t } from '$lib/stores/i18n.store';

	// UI state
	let activeTab = $state('balance'); // balance, receive, send, transactions
	let selectedAddress = $state(wallet.addresses.find((a) => a.isDefault) || wallet.addresses[0]);
	let showQR = $state(false);
	let copiedAddress = $state(false);

	// Send form
	let sendAmount = $state('');
	let sendAddress = $state('');
	let sendNetworkFee = $state('medium'); // low, medium, high
	let sendError = $state('');

	// Format number with a specific number of decimals
	function formatNumber(number: number, decimals: number): string {
		return number.toFixed(decimals);
	}

	// Format timestamp to human-readable date
	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Truncate address for display
	function truncateAddress(address: string, prefixLength = 8, suffixLength = 4): string {
		if (address.length <= prefixLength + suffixLength) {
			return address;
		}
		return `${address.substring(0, prefixLength)}...${address.substring(address.length - suffixLength)}`;
	}

	// Copy address to clipboard
	function copyToClipboard(text: string): void {
		navigator.clipboard.writeText(text).then(() => {
			copiedAddress = true;
			setTimeout(() => {
				copiedAddress = false;
			}, 2000);
		});
	}

	// Toggle QR code visibility
	function toggleQR(): void {
		showQR = !showQR;
	}

	// Select address type
	function selectAddress(type: string): void {
		const found = wallet.addresses.find((a) => a.type === type);
		if (found) {
			selectedAddress = found;
		}
	}

	// Validate send form
	function validateSendForm(): boolean {
		if (!sendAmount || isNaN(parseFloat(sendAmount)) || parseFloat(sendAmount) <= 0) {
			sendError = 'Please enter a valid amount';
			return false;
		}

		if (parseFloat(sendAmount) > wallet.balance.btc) {
			sendError = 'Insufficient balance';
			return false;
		}

		if (!sendAddress.trim()) {
			sendError = 'Please enter a recipient address';
			return false;
		}

		sendError = '';
		return true;
	}

	// Send transaction
	function sendTransaction(): void {
		if (!validateSendForm()) {
			return;
		}

		// In a real implementation, this would call an API to send the transaction
		alert(`Transaction initiated: ${sendAmount} BTC to ${sendAddress}`);

		// Reset form
		sendAmount = '';
		sendAddress = '';
		sendNetworkFee = 'medium';
	}

	let btcPrice = $state<number>(120000); // Default fallback price

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			// Keep using fallback price
		}
	}
	onMount(() => {
		if (browser) {
			fetchBtcPrice();
		}
	});
</script>

<div class="bg-base-100 mx-auto max-w-4xl rounded-lg p-6 shadow-lg">
	<h2 class="mb-6 text-2xl font-bold">{$t('wallet.title')}</h2>

	<!-- Tabs -->
	<div class="tabs tabs-boxed mb-6">
		<button
			class="tab {activeTab === 'balance' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'balance')}
		>
			{$t('wallet.tab_balance')}
		</button>
		<button
			class="tab {activeTab === 'receive' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'receive')}
		>
			{$t('wallet.tab_receive')}
		</button>
		<button
			class="tab {activeTab === 'send' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'send')}
		>
			{$t('wallet.tab_send')}
		</button>
		<button
			class="tab {activeTab === 'transactions' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'transactions')}
		>
			{$t('wallet.tab_transactions')}
		</button>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'balance'}
		<div class="space-y-6">
			<!-- Balance Card -->
			<div class="card bg-primary text-primary-content">
				<div class="card-body">
					<div class="mb-2 flex items-center justify-between">
						<h3 class="card-title text-lg">{$t('wallet.total_balance')}</h3>
						<!-- <div class="form-control">
							<label class="label cursor-pointer">
								<span class="label-text text-primary-content mr-2">Show in BTC</span>
								<input type="checkbox" class="toggle toggle-primary toggle-lg" checked={true} />
							</label>
						</div> -->
					</div>

					<p class="text-4xl font-bold">{formatBtcToSats(wallet.balance.btc)}</p>
					<p class="opacity-80">{wallet.balance.usdValue} USDT</p>
				</div>
			</div>

			<!-- Quick Actions -->
			<div class="grid grid-cols-2 gap-4">
				<button class="btn btn-outline btn-primary" onclick={() => (activeTab = 'receive')}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-2 h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 9l-7 7-7-7"
						/>
					</svg>
					{$t('wallet.receive')}
				</button>
				<button class="btn btn-outline btn-primary" onclick={() => (activeTab = 'send')}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-2 h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 15l7-7 7 7"
						/>
					</svg>
					{$t('wallet.send')}
				</button>
			</div>

			<!-- Recent Transactions -->
			<div>
				<h3 class="mb-3 text-lg font-semibold">{$t('wallet.recent_transactions')}</h3>
				{#if wallet.transactions.length > 0}
					<div class="overflow-x-auto">
						<table class="table w-full">
							<thead>
								<tr>
									<th>{$t('wallet.type')}</th>
									<th>{$t('wallet.amount')}</th>
									<th>{$t('wallet.date')}</th>
									<th>{$t('wallet.network')}</th>
								</tr>
							</thead>
							<tbody>
								{#each wallet.transactions.slice(0, 3) as tx}
									<tr>
										<td>
											<div class="flex items-center gap-2">
												{#if tx.type === 'received'}
													<div class="badge badge-success">{$t('wallet.received')}</div>
												{:else}
													<div class="badge badge-warning">{$t('wallet.sent')}</div>
												{/if}
											</div>
										</td>
										<td class="flex flex-col">
											<span class={tx.type === 'received' ? 'text-success' : 'text-warning'}>
												{tx.type === 'received' ? '+' : '-'}{formatBtcToSats(tx.amount)}
											</span>
											<span class="text-gray text-xs"
												>≈{calculateUsdtEstimate(tx.amount, btcPrice)} USDT</span
											>
										</td>
										<td>{formatDate(tx.timestamp)}</td>
										<td>
											<div class="badge">
												{tx.network}
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<div class="mt-4 text-center">
						<button class="btn btn-ghost btn-sm" onclick={() => (activeTab = 'transactions')}>
							{$t('wallet.view_all_transactions')}
						</button>
					</div>
				{:else}
					<div class="alert alert-outline">
						<span>{$t('wallet.no_transactions')}</span>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if activeTab === 'receive'}
		<div class="space-y-6">
			<h3 class="mb-3 text-lg font-semibold">{$t('wallet.receive_btc')}</h3>

			<!-- Network Selection -->
			<div class="tabs tabs-boxed">
				{#each wallet.addresses as address}
					<button
						class="tab {selectedAddress.type === address.type ? 'tab-active' : ''}"
						onclick={() => selectAddress(address.type)}
					>
						{address.type}
					</button>
				{/each}
			</div>

			<!-- Address Display -->
			<div class="card bg-base-200">
				<div class="card-body">
					<h4 class="card-title text-base">{selectedAddress.type} {$t('wallet.address')}</h4>
					<div class="bg-base-300 flex items-center justify-between rounded-lg p-3">
						<div class="font-mono text-sm break-all">
							{selectedAddress.address}
						</div>
						<button
							class="btn btn-ghost btn-sm"
							onclick={() => copyToClipboard(selectedAddress.address)}
						>
							{#if copiedAddress}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-5 w-5"
									viewBox="0 0 20 20"
									fill="currentColor"
								>
									<path
										fill-rule="evenodd"
										d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
										clip-rule="evenodd"
									/>
								</svg>
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
										d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
									/>
								</svg>
							{/if}
						</button>
					</div>

					<!-- QR Code Toggle -->
					<div class="mt-4">
						<button class="btn btn-primary btn-block" onclick={toggleQR}>
							{showQR ? $t('wallet.hide_qr') : $t('wallet.show_qr')}
						</button>
					</div>

					{#if showQR}
						<div class="mt-4 flex justify-center">
							<div class="rounded-lg bg-white p-4">
								<!-- In a real implementation, this would be an actual QR code -->
								<div class="bg-base-100 flex h-60 w-60 items-center justify-center">
									<span class="text-base-content">{$t('wallet.qr_placeholder')}</span>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Request Payment Form -->
			<div class="card bg-base-200">
				<div class="card-body">
					<h4 class="card-title text-base">{$t('wallet.request_amount')}</h4>

					<div class="form-control">
						<div class="label">
							<span class="label-text">{$t('wallet.amount_btc')}</span>
						</div>
						<div class="input-group">
							<input type="number" placeholder="0.00000000" class="input input-bordered w-full" />
							<select class="select select-bordered">
								<option value="BTC">BTC</option>
								<option value="sats">sats</option>
							</select>
						</div>
					</div>

					<div class="form-control mt-4">
						<div class="label">
							<span class="label-text">{$t('wallet.description_optional')}</span>
						</div>
						<input
							type="text"
							placeholder={$t('wallet.payment_description_placeholder')}
							class="input input-bordered w-full"
						/>
					</div>

					<div class="mt-4">
						<button class="btn btn-primary btn-block"
							>{$t('wallet.generate_payment_request')}</button
						>
					</div>
				</div>
			</div>
		</div>
	{/if}

	{#if activeTab === 'send'}
		<div class="space-y-6">
			<h3 class="mb-3 text-lg font-semibold">{$t('wallet.send_btc')}</h3>

			<!-- Send Form -->
			<div class="card bg-base-200">
				<div class="card-body">
					{#if sendError}
						<div class="alert alert-outline alert-error mb-4">
							<div>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-6 w-6 flex-shrink-0 stroke-current"
									fill="none"
									viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
									/></svg
								>
								<span>{sendError}</span>
							</div>
						</div>
					{/if}

					<div class="form-control">
						<div class="label">
							<span class="label-text">{$t('wallet.recipient_address')}</span>
						</div>
						<div class="input-group">
							<input
								type="text"
								placeholder={$t('wallet.address_placeholder')}
								class="input input-bordered w-full"
								bind:value={sendAddress}
							/>
							<button aria-label="Scan QR Code" class="btn">
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
										d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
									/>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
									/>
								</svg>
							</button>
						</div>
					</div>

					<div class="form-control mt-4">
						<div class="label">
							<span class="label-text">{$t('wallet.amount')}</span>
							<span class="label-text-alt"
								>{$t('wallet.available_balance')} {formatNumber(wallet.balance.btc, 8)} BTC</span
							>
						</div>
						<div class="input-group">
							<input
								type="number"
								placeholder="0.00000000"
								step="0.00000001"
								class="input input-bordered w-full"
								bind:value={sendAmount}
							/>
							<select class="select select-bordered">
								<option value="BTC">BTC</option>
								<option value="sats">sats</option>
							</select>
						</div>
					</div>

					<div class="form-control mt-4">
						<div class="label">
							<span class="label-text">{$t('wallet.transaction_fee')}</span>
						</div>
						<div class="btn-group w-full">
							<button
								class="btn flex-1 {sendNetworkFee === 'low' ? 'btn-active' : ''}"
								onclick={() => (sendNetworkFee = 'low')}
							>
								{$t('wallet.fee_low')}
							</button>
							<button
								class="btn flex-1 {sendNetworkFee === 'medium' ? 'btn-active' : ''}"
								onclick={() => (sendNetworkFee = 'medium')}
							>
								{$t('wallet.fee_medium')}
							</button>
							<button
								class="btn flex-1 {sendNetworkFee === 'high' ? 'btn-active' : ''}"
								onclick={() => (sendNetworkFee = 'high')}
							>
								{$t('wallet.fee_high')}
							</button>
						</div>
						<div class="text-base-content/70 mt-2 text-sm">
							{#if sendNetworkFee === 'low'}
								{$t('wallet.fee_time_low')}
							{:else if sendNetworkFee === 'medium'}
								{$t('wallet.fee_time_medium')}
							{:else}
								{$t('wallet.fee_time_high')}
							{/if}
						</div>
					</div>

					<div class="form-control mt-4">
						<div class="label">
							<span class="label-text">{$t('wallet.description_optional')}</span>
						</div>
						<input
							type="text"
							placeholder={$t('wallet.description_placeholder')}
							class="input input-bordered w-full"
						/>
					</div>

					<div class="mt-6">
						<button class="btn btn-primary btn-block" onclick={sendTransaction}>
							{$t('wallet.send_bitcoin')}
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	{#if activeTab === 'transactions'}
		<div class="space-y-6">
			<h3 class="mb-3 text-lg font-semibold">{$t('wallet.transaction_history')}</h3>

			{#if wallet.transactions.length > 0}
				<div class="overflow-x-auto">
					<table class="table w-full">
						<thead>
							<tr>
								<th>{$t('wallet.tx_type')}</th>
								<th>{$t('wallet.tx_amount')}</th>
								<th>{$t('wallet.tx_date')}</th>
								<th>{$t('wallet.tx_address')}</th>
								<th>{$t('wallet.tx_status')}</th>
								<th>{$t('wallet.tx_network')}</th>
							</tr>
						</thead>
						<tbody>
							{#each wallet.transactions as tx}
								<tr>
									<td>
										<div class="flex items-center gap-2">
											{#if tx.type === 'received'}
												<div class="badge badge-success">{$t('wallet.received')}</div>
											{:else}
												<div class="badge badge-warning">{$t('wallet.sent')}</div>
											{/if}
										</div>
									</td>
									<td class="flex flex-col items-start">
										<span class={tx.type === 'received' ? 'text-success' : 'text-warning'}>
											{tx.type === 'received' ? '+' : '-'}{formatBtcToSats(tx.amount)}
										</span>
										<span class="text-xs">≈ {calculateUsdtEstimate(tx.amount, btcPrice)} USDT</span>
									</td>
									<td>{formatDate(tx.timestamp)}</td>
									<td>
										{#if tx.type === 'received'}
											<span class="font-mono text-xs"
												>{$t('wallet.from')} {truncateAddress(tx.sender)}</span
											>
										{:else}
											<span class="font-mono text-xs"
												>{$t('wallet.to')} {truncateAddress(tx.recipient)}</span
											>
										{/if}
									</td>
									<td>
										{#if tx.network === 'Lightning'}
											<div class="badge badge-success">{$t('wallet.status_confirmed')}</div>
										{:else if tx.confirmations === 0}
											<div class="badge badge-warning">{$t('wallet.status_pending')}</div>
										{:else}
											<div class="indicator">
												<span class="indicator-item badge badge-xs">
													{tx.confirmations}
												</span>
												<div class="badge badge-success">{$t('wallet.status_confirmations')}</div>
											</div>
										{/if}
									</td>
									<td>
										<div class="badge">
											{tx.network}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="alertt alert-error alert-outline">
					<span>{$t('wallet.no_transactions')}</span>
				</div>
			{/if}
		</div>
	{/if}
</div>
