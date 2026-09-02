<script lang="ts">
  import { t } from 'svelte-i18n';

  interface Props {
    task?: any;
    onClose?: () => void;
    stickySubmit?: boolean;
    onSubmit?: (data: any) => void;
  }

  let { task = null, onClose = () => {}, stickySubmit = false, onSubmit }: Props = $props();

  let formattedBudget = $derived.by(() => {
    if (!task?.budget) return null;
    if (typeof task.budget === 'object') {
      return task.budget.amount ?? task.budget.value ?? task.budget.usd ?? null;
    }
    return task.budget;
  });

  let bidAmount = $state(0);
  let deliveryDays = $state(3);
  let proposal = $state('');
  let isSubmitting = $state(false);

  $effect(() => {
    if (formattedBudget && !bidAmount) {
      bidAmount = Number(formattedBudget) || 0;
    }
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    isSubmitting = true;
    try {
      if (onSubmit) {
        await onSubmit({
          amount: bidAmount,
          days: deliveryDays,
          proposal,
          taskId: task?.id || task?.eventId
        });
      }
      if (onClose) onClose();
    } catch (err) {
      console.error("Bid submission failed", err);
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="p-6 bg-base-100 text-base-content rounded-box shadow-xl max-w-2xl mx-auto border border-base-300">
  <div class="flex justify-between items-center mb-6 pb-4 border-b border-base-200">
    <div>
      <h2 class="text-2xl font-bold font-sans">{$t('bidding.place_bid', { default: 'Place Your Bid' })}</h2>
      {#if task?.title}
        <p class="text-sm text-opacity-70 text-base-content mt-1">For: <span class="font-semibold">{task.title}</span></p>
      {/if}
    </div>
    <button type="button" class="btn btn-sm btn-circle btn-ghost" onclick={onClose}>✕</button>
  </div>

  <form onsubmit={handleSubmit} class="space-y-6">
    <div class="form-control">
      <label class="label font-medium" for="bidAmount">
        <span class="label-text">Your Bid Amount ($ USD / Sats)</span>
      </label>
      <input
        id="bidAmount"
        type="number"
        bind:value={bidAmount}
        min="1"
        class="input input-bordered w-full focus:input-primary text-lg"
        placeholder="Enter bid amount"
        required
      />
      {#if formattedBudget}
        <label class="label">
          <span class="label-text-alt opacity-70">Task Budget: ${formattedBudget}</span>
        </label>
      {/if}
    </div>

    <div class="form-control">
      <label class="label font-medium" for="deliveryDays">
        <span class="label-text">Delivery Time (Days)</span>
      </label>
      <input
        id="deliveryDays"
        type="number"
        bind:value={deliveryDays}
        min="1"
        class="input input-bordered w-full focus:input-primary"
        required
      />
    </div>

    <div class="form-control">
      <label class="label font-medium" for="proposal">
        <span class="label-text">Proposal Details</span>
      </label>
      <textarea
        id="proposal"
        bind:value={proposal}
        class="textarea textarea-bordered h-32 w-full focus:textarea-primary"
        placeholder="Describe why you are the best fit for this task..."
        required
      ></textarea>
    </div>

    <div class="flex justify-end gap-3 pt-4 border-t border-base-200">
      <button type="button" class="btn btn-ghost" onclick={onClose}>
        Cancel
      </button>
      <button type="submit" class="btn btn-primary px-8" disabled={isSubmitting}>
        {#if isSubmitting}
          <span class="loading loading-spinner loading-xs"></span>
          Submitting...
        {:else}
          Submit Bid
        {/if}
      </button>
    </div>
  </form>
</div>
