<script lang="ts">
	const { paymentAsset, paymentNetwork } = $props<{
		paymentAsset?: string;
		paymentNetwork?: string;
	}>();
</script>

<div data-testid="timeline-props">
	{paymentAsset ?? 'undefined'}|{paymentNetwork ?? 'undefined'}
</div>
