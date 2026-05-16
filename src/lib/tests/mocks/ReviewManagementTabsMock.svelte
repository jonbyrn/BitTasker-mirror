<script lang="ts">
	let {
		activeTab = 'received',
		receivedCount = 0,
		givenCount = 0,
		pendingCount = 0,
		idPrefix = 'reviews',
		onTabChange
	} = $props<{
		activeTab?: 'received' | 'given' | 'pending';
		receivedCount?: number;
		givenCount?: number;
		pendingCount?: number;
		idPrefix?: string;
		onTabChange?: (tab: 'received' | 'given' | 'pending') => void;
	}>();
</script>

<div data-testid="review-tabs" data-id-prefix={idPrefix}>
	active:{activeTab} received:{receivedCount} given:{givenCount} pending:{pendingCount}
</div>

<button type="button" onclick={() => onTabChange?.('given')}>open given</button>
<button type="button" onclick={() => onTabChange?.('pending')}>open pending</button>
