<script lang="ts">
	import {
		bidAmountLabel,
		contractDisplayAmount,
		type ContractAmount,
		type QuotedAmount
	} from '$lib/utils/ui/money-display';

	let {
		quote = undefined,
		contract = undefined,
		size = 'default'
	}: {
		quote?: QuotedAmount;
		contract?: ContractAmount;
		size?: 'default' | 'large';
	} = $props();

	const text = $derived(
		contract
			? contractDisplayAmount(contract)
			: quote
				? bidAmountLabel(quote)
				: 'Amount unavailable'
	);
	const sizeClass = $derived(size === 'large' ? 'text-2xl' : 'text-lg');
</script>

<p class="{sizeClass} font-bold tabular-nums" data-testid="money-amount">{text}</p>
