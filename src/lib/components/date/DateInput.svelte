<script lang="ts">
	let {
		value = $bindable(''),
		type: _type = 'single',
		min = undefined,
		max = undefined,
		maxDate = undefined,
		placeholderKey: _placeholderKey = undefined,
		minDate = undefined,
		labelKey: _labelKey = undefined,
		disabled = false,
		onchange = () => {},
		onChange = undefined
	}: {
		value?: string | Date | null;
		type?: 'single' | 'range';
		min?: string | Date;
		max?: string | Date;
		maxDate?: string | Date;
		placeholderKey?: string;
		minDate?: string | Date;
		labelKey?: string;
		disabled?: boolean;
		onchange?: (event: Event) => void;
		onChange?: (value: Date | null) => void;
	} = $props();

	// A type="date" input only keeps yyyy-mm-dd. Stored deadlines are full ISO strings.
	function calendarDay(raw: string | Date | null | undefined): string {
		if (raw instanceof Date) {
			if (Number.isNaN(raw.getTime())) return '';
			const month = String(raw.getMonth() + 1).padStart(2, '0');
			const day = String(raw.getDate()).padStart(2, '0');
			return `${raw.getFullYear()}-${month}-${day}`;
		}
		if (typeof raw !== 'string') return '';
		const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
		return match ? match[1] : '';
	}

	let focused = $state(false);
	let draft = $state('');

	const committed = $derived(calendarDay(value));
	const shown = $derived(focused ? draft : committed);
	const inputMax = $derived(calendarDay(max ?? maxDate));
	const inputMin = $derived(calendarDay(min ?? minDate));

	function publish(raw: string, event: Event): void {
		onchange(event);
		if (!onChange || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return;
		onChange(new Date(`${raw}T00:00:00`));
	}

	function handleInput(event: Event): void {
		if (!(event.currentTarget instanceof HTMLInputElement)) return;
		draft = event.currentTarget.value;
		publish(draft, event);
	}

	function handleFocus(): void {
		focused = true;
		draft = committed;
	}

	function handleBlur(event: FocusEvent): void {
		focused = false;
		if (draft) return;
		onchange(event);
		onChange?.(null);
	}
</script>

<input
	type="date"
	class="input input-bordered w-full"
	data-testid="date-input"
	value={shown}
	min={inputMin || undefined}
	max={inputMax || undefined}
	{disabled}
	onfocus={handleFocus}
	onblur={handleBlur}
	oninput={handleInput}
	onchange={handleInput}
/>
