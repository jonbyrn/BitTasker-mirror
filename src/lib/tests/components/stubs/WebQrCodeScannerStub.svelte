<script lang="ts">
	let {
		onScan = (_value: string) => {},
		onClose = () => {}
	} = $props<{
		onScan?: (value: string) => void;
		onClose?: () => void;
	}>();

	const ambiguousPayload = '0x1234567890123456789012345678901234567890';
	const bscPayload =
		'bsc:0x1234567890123456789012345678901234567890?amount=12.345678&memo=Invoice';
</script>

<button data-testid="simulate-web-scan-ambiguous" onclick={() => onScan(ambiguousPayload)}>
	Simulate ambiguous scan
</button>
<button data-testid="simulate-web-scan-bsc" onclick={() => onScan(bscPayload)}>
	Simulate BSC scan
</button>
<button data-testid="simulate-web-scan-close" onclick={onClose}>Close scanner</button>
