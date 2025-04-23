<!-- WalletReceive.svelte -->
<script lang="ts">
  import type { WalletAddress } from '$lib/types/wallet';
  import { walletStore } from '$lib/stores/wallet.store';
  
  let networkType = $state<'Bitcoin' | 'Lightning' | 'Liquid'>('Bitcoin');
  let selectedAddress = $state<WalletAddress | null>(null);
  let showQR = $state(false);
  let copiedAddress = $state(false);
  let requestAmount = $state('');
  let requestDescription = $state('');
  let requestCurrency = $state<'BTC' | 'sats'>('BTC');
  let lightningInvoice = $state('');
  
  // Convert BTC to sats
  function btcToSats(btc: number): number {
    return Math.floor(btc * 100000000);
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
  function selectNetwork(type: 'Bitcoin' | 'Lightning' | 'Liquid'): void {
    networkType = type;
    const address = walletStore.subscribe((state) => {
      const found = state.addresses.find((a) => a.type === type);
      if (found) {
        selectedAddress = found;
      }
    })();
  }
  
  // Generate a new address
  async function generateNewAddress(): Promise<void> {
    try {
      const newAddress = await walletStore.generateAddress(networkType);
      if (newAddress) {
        selectedAddress = newAddress;
      }
    } catch (error) {
      console.error('Failed to generate address:', error);
    }
  }
  
  // Generate a Lightning invoice
  async function generatePaymentRequest(): Promise<void> {
    if (!requestAmount) {
      return;
    }

    try {
      // Convert amount to sats if needed
      const amountSats =
        requestCurrency === 'BTC' ? btcToSats(parseFloat(requestAmount)) : parseInt(requestAmount);

      // Generate invoice
      // In a real implementation, this would call a backend service
      const invoice = {
        paymentRequest: `lnbc${amountSats}${Math.random().toString(36).substring(2, 15)}`,
        amount: amountSats / 100000000, // Convert to BTC
        description: requestDescription || 'BitTasker Payment',
        expiryTime: Date.now() + 3600 * 1000 // 1 hour expiry
      };

      lightningInvoice = invoice.paymentRequest;
      showQR = true;
    } catch (error) {
      console.error('Failed to generate payment request:', error);
    }
  }
  
  // Initialize selected address when component is mounted
  $effect(() => {
    selectNetwork(networkType);
  });
</script>

<div class="space-y-6">
  <h3 class="mb-3 text-lg font-semibold">Receive Bitcoin</h3>

  <!-- Network Selection -->
  <div class="tabs tabs-boxed">
    <button
      class="tab {networkType === 'Bitcoin' ? 'tab-active' : ''}"
      onclick={() => selectNetwork('Bitcoin')}
    >
      Bitcoin
    </button>
    <button
      class="tab {networkType === 'Lightning' ? 'tab-active' : ''}"
      onclick={() => selectNetwork('Lightning')}
    >
      Lightning
    </button>
    <button
      class="tab {networkType === 'Liquid' ? 'tab-active' : ''}"
      onclick={() => selectNetwork('Liquid')}
    >
      Liquid
    </button>
  </div>

  <!-- Address Display -->
  <div class="card bg-base-200">
    <div class="card-body">
      <h4 class="card-title text-base">{networkType} Address</h4>

      {#if selectedAddress}
        <div class="bg-base-300 flex items-center justify-between rounded-lg p-3">
          <div class="font-mono text-sm break-all">
            {selectedAddress.address}
          </div>
          <button
            class="btn btn-ghost btn-sm"
            onclick={() => copyToClipboard(selectedAddress?.address || '')}
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
      {:else}
        <div class="alert">No address available. Generate a new one.</div>
      {/if}

      <div class="mt-4 flex gap-2">
        <button class="btn flex-1" onclick={generateNewAddress}>
          Generate New Address
        </button>
        <button class="btn btn-primary flex-1" onclick={toggleQR}>
          {showQR ? 'Hide QR Code' : 'Show QR Code'}
        </button>
      </div>

      {#if showQR && selectedAddress}
        <div class="mt-4 flex justify-center">
          <div class="rounded-lg bg-white p-4">
            <!-- In a real implementation, this would be an actual QR code -->
            <div class="bg-base-100 flex h-60 w-60 items-center justify-center">
              <span class="text-base-content"
                >QR Code for {truncateAddress(selectedAddress.address)}</span
              >
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Request Payment Form (for Lightning) -->
  {#if networkType === 'Lightning'}
    <div class="card bg-base-200">
      <div class="card-body">
        <h4 class="card-title text-base">Generate Lightning Invoice</h4>

        <div class="form-control">
          <div class="label">
            <span class="label-text">Amount</span>
          </div>
          <div class="input-group">
            <input
              type="number"
              placeholder="0.00000000"
              class="input input-bordered w-full"
              bind:value={requestAmount}
            />
            <select class="select select-bordered" bind:value={requestCurrency}>
              <option value="BTC">BTC</option>
              <option value="sats">sats</option>
            </select>
          </div>
        </div>

        <div class="form-control mt-4">
          <div class="label">
            <span class="label-text">Description (optional)</span>
          </div>
          <input
            type="text"
            placeholder="What's this payment for?"
            class="input input-bordered w-full"
            bind:value={requestDescription}
          />
        </div>

        <div class="mt-4">
          <button class="btn btn-primary btn-block" onclick={generatePaymentRequest}>
            Generate Invoice
          </button>
        </div>

        {#if lightningInvoice}
          <div class="mt-4">
            <div class="label">
              <span class="label-text font-semibold">Lightning Invoice</span>
            </div>
            <div class="bg-base-300 flex items-center justify-between rounded-lg p-3">
              <div class="font-mono text-xs break-all">
                {lightningInvoice}
              </div>
              <button
                class="btn btn-ghost btn-sm"
                onclick={() => copyToClipboard(lightningInvoice)}
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
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div> 