<script lang="ts">
	let {
		label = '',
		placeholder = '',
		onLocationSelect = () => {}
	}: {
		label?: string;
		placeholder?: string;
		onLocationSelect?: (location: {
			displayName: string;
			latitude: number;
			longitude: number;
			zipCode: string;
			locationLoaded: boolean;
		}) => void;
	} = $props();
</script>

<div data-testid="mock-enhanced-location-picker">
	<p>{label}</p>
	<p>{placeholder}</p>
	<button
		type="button"
		data-testid="mock-enhanced-location-picker-select"
		onclick={() =>
			onLocationSelect({
				displayName: 'Selected place',
				latitude: 10,
				longitude: 20,
				zipCode: '12345',
				locationLoaded: true
			})}
	>
		Select location
	</button>
</div>
