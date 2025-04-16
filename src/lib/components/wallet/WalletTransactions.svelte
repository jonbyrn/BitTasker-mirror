<!-- WalletTransactions.svelte -->
<script lang="ts">
  import { walletStore } from '$lib/stores/wallet.store';
  
  let networkType = $state<'Bitcoin' | 'Lightning' | 'Liquid' | null>(null);
  
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
    if (!address || address.length <= prefixLength + suffixLength) {
      return address || '';
    }
    return `${address.substring(0, prefixLength)}...${address.substring(address.length - suffixLength)}`;
  }
  
  // Select address type
  function selectNetwork(type: 'Bitcoin' | 'Lightning' | 'Liquid' | null): void {
    networkType = type;
  }
</script>

<div class="space-y-6">
  <h3 class="mb-3 text-lg font-semibold">Transaction History</h3>

  <div class="tabs tabs-boxed mb-4">
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
    <button
      class="tab {networkType === null ? 'tab-active' : ''}"
      onclick={() => selectNetwork(null)}
    >
      All
    </button>
  </div>

  {#if $walletStore}
    {#if $walletStore.transactions.length > 0}
      {@const filteredTxs = networkType
        ? $walletStore.transactions.filter((tx) => tx.network === networkType)
        : $walletStore.transactions}
      {#if filteredTxs.length > 0}
        <div class="overflow-x-auto">
          <table class="table w-full">
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Address</th>
                <th>Status</th>
                <th>Network</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredTxs as tx}
                <tr>
                  <td>
                    <div class="flex items-center gap-2">
                      {#if tx.type === 'received'}
                        <div class="badge badge-success">Received</div>
                      {:else}
                        <div class="badge badge-warning">Sent</div>
                      {/if}
                    </div>
                  </td>
                  <td>
                    <span class={tx.type === 'received' ? 'text-success' : 'text-warning'}>
                      {tx.type === 'received' ? '+' : '-'}{formatNumber(tx.amount, 8)} BTC
                    </span>
                  </td>
                  <td>{formatDate(tx.timestamp)}</td>
                  <td>
                    {#if tx.type === 'received'}
                      <span class="font-mono text-xs">From: {truncateAddress(tx.sender)}</span>
                    {:else}
                      <span class="font-mono text-xs">To: {truncateAddress(tx.recipient)}</span>
                    {/if}
                  </td>
                  <td>
                    {#if tx.network === 'Lightning'}
                      <div class="badge badge-success">Confirmed</div>
                    {:else if tx.confirmations === 0}
                      <div class="badge badge-warning">Pending</div>
                    {:else}
                      <div class="indicator">
                        <span class="indicator-item badge badge-xs">
                          {tx.confirmations}
                        </span>
                        <div class="badge badge-success">Confirmations</div>
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
        <div class="alert">
          <span>No {networkType} transactions found.</span>
        </div>
      {/if}
    {:else}
      <div class="alert">
        <span>No transactions found.</span>
      </div>
    {/if}
  {/if}
</div> 