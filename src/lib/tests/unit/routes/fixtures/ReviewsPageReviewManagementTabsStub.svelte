<script lang="ts">
	let {
		activeTab,
		receivedCount = 0,
		givenCount = 0,
		pendingCount = 0,
		isCurrentUser = false,
		onTabChange = () => {}
	} = $props<{
		activeTab: 'received' | 'given' | 'pending';
		receivedCount?: number;
		givenCount?: number;
		pendingCount?: number;
		isCurrentUser?: boolean;
		onTabChange?: (tab: 'received' | 'given' | 'pending') => void;
	}>();
</script>

<div data-testid="reviews-tabs" data-active-tab={activeTab} data-current-user={isCurrentUser}>
	<button type="button" onclick={() => onTabChange('pending')}>pending:{pendingCount}</button>
	<button type="button" onclick={() => onTabChange('given')}>given:{givenCount}</button>
	<button type="button" onclick={() => onTabChange('received')}>received:{receivedCount}</button>
</div>
