<script lang="ts">
	let {
		label = '',
		placeholder = '',
		serviceRadius = 0,
		showRadiusCircle = true,
		onLocationSelect = () => {}
	}: {
		label?: string;
		placeholder?: string;
		serviceRadius?: number;
		showRadiusCircle?: boolean;
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
	<p data-testid="mock-enhanced-location-picker-radius">{serviceRadius}</p>
	<p data-testid="mock-enhanced-location-picker-show-radius-circle">{showRadiusCircle}</p>
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
