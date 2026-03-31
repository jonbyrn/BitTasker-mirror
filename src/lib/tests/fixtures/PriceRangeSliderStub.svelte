<script lang="ts">
	const { currency = 'USD', tier = undefined } = $props<{
		currency?: string;
		tier?: string | undefined;
	}>();
</script>

<div data-testid="price-range-slider">{currency}:{tier || ''}</div>
