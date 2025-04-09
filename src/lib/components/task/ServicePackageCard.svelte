<script lang="ts">
import { format } from 'date-fns';
import type { ServicePackage } from '$lib/types/recurring-tasks';
import { TASKSTATUS } from '$lib/utils/enums/recurringTask.enums';

let { package: packageData, isOwner, onPurchase } = $props<{
  package: ServicePackage;
  isOwner: boolean;
  onPurchase: (() => void) | undefined;
}>();

// State
let isExpanded = $state(false);

// Format date string
function formatDate(dateString: string): string {
  return format(new Date(dateString), 'MMM d, yyyy');
}

function toggleExpand() {
  isExpanded = !isExpanded;
}

function getStatusColor(status: TASKSTATUS): string {
  switch (status) {
    case TASKSTATUS.ACTIVE:
      return 'bg-success text-success-content';
    case TASKSTATUS.PAUSED:
      return 'bg-warning text-warning-content';
    case TASKSTATUS.COMPLETED:
      return 'bg-info text-info-content';
    case TASKSTATUS.CANCELLED:
      return 'bg-error text-error-content';
    default:
      return 'bg-neutral text-neutral-content';
  }
}

// Handle purchase button click
function handlePurchase() {
  if (onPurchase) {
    onPurchase();
  }
}
</script>

<div class="card bg-base-100 shadow-md hover:shadow-lg transition-shadow">
  <div class="card-body p-4">
    <!-- Card Header -->
    <div class="flex items-center justify-between">
      <h3 class="card-title text-base md:text-lg truncate">{packageData.name}</h3>
      <div class="badge badge-accent badge-sm md:badge-md">
        {packageData.taskTemplates.length} {packageData.taskTemplates.length === 1 ? 'Task' : 'Tasks'}
      </div>
    </div>
    
    <!-- Package Price -->
    <div class="my-2">
      <div class="text-sm md:text-base font-medium flex items-end gap-2">
        <span class="text-lg md:text-xl font-bold">{packageData.totalPrice} {packageData.currency}</span>
        {#if packageData.bundleDiscount > 0}
          <span class="text-xs text-success">
            {packageData.bundleDiscount}% discount
          </span>
        {/if}
      </div>
    </div>
    
    <!-- Description -->
    <div class="my-2">
      <p class="text-sm">
        {packageData.description.length > 120 
          ? packageData.description.slice(0, 120) + '...' 
          : packageData.description}
      </p>
    </div>
    
    <!-- Expanded Content -->
    {#if isExpanded}
      <div class="divider my-2"></div>
      
      <!-- Status -->
      <div class="my-2">
        <div class="text-xs opacity-70">Status:</div>
        <div class="badge {getStatusColor(packageData.status)} badge-sm">
          {packageData.status}
        </div>
      </div>
      
      <!-- Task Templates Preview -->
      <div class="my-2">
        <div class="text-xs opacity-70">Includes:</div>
        <ul class="list-disc pl-5 text-sm mt-1">
          {#if packageData.taskTemplates.length <= 3}
            {#each packageData.taskTemplates as templateId, i}
              <li>Task {i + 1}</li>
            {/each}
          {:else}
            <li>Multiple recurring tasks ({packageData.taskTemplates.length})</li>
          {/if}
        </ul>
      </div>
      
      <!-- Created Date -->
      <div class="text-xs opacity-50 mt-2">
        Created: {formatDate(packageData.createdAt)}
      </div>
    {/if}
    
    <!-- Card Actions -->
    <div class="card-actions justify-end mt-2">
      <button 
        class="btn btn-ghost btn-xs" 
        onclick={toggleExpand}
      >
        {isExpanded ? 'Show Less' : 'Show More'}
      </button>
      
      {#if isOwner}
        <!-- Owner Actions -->
        <button class="btn btn-ghost btn-xs">
          Edit
        </button>
        <button class="btn btn-ghost btn-xs">
          Delete
        </button>
      {:else if onPurchase}
        <!-- Purchase Action -->
        <button 
          class="btn btn-primary btn-sm"
          onclick={handlePurchase}
        >
          Purchase
        </button>
      {/if}
    </div>
  </div>
</div>
