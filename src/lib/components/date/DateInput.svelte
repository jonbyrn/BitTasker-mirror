<script lang="ts">
	let {
		value = $bindable(''),
		type = 'single',
		min = undefined,
		max = undefined,
		maxDate = undefined,
		placeholderKey = undefined,
		minDate = undefined,
		labelKey = undefined,
		disabled = false,
		onchange = () => {},
		onChange = undefined
	}: {
		value?: string | Date | null;
		type?: 'single' | 'range';
		min?: string;
		max?: string;
		maxDate?: string;
		placeholderKey?: string;
		minDate?: string;
		labelKey?: string;
		disabled?: boolean;
		onchange?: (event: Event) => void;
		onChange?: (value: Date | null) => void;
	} = $props();

	const inputValue = $derived(
		value instanceof Date ? value.toISOString().slice(0, 10) : (value ?? '')
	);
	const inputMax = $derived(max ?? maxDate);
	const inputMin = $derived(min ?? minDate);

	function handleChange(event: Event): void {
		onchange(event);
		if (onChange && event.currentTarget instanceof HTMLInputElement) {
			onChange(
				event.currentTarget.value ? new Date(`${event.currentTarget.value}T00:00:00`) : null
			);
		}
	}
</script>

<input
	type="date"
	class="input input-bordered w-full"
	value={inputValue}
	min={inputMin}
	max={inputMax}
	{disabled}
	onchange={handleChange}
/>
