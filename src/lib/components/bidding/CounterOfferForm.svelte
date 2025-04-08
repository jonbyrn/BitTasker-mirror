<script lang="ts">
	import type { Bid, CounterOffer, Currency } from '$lib/types/bid';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	
	// Props
	const props = $props<{
		bid: Bid;
		onSubmit: (bidId: string, counterOffer: Omit<CounterOffer, 'id' | 'bidId' | 'createdAt' | 'status'>) => Promise<void>;
		onCancel: () => void;
	}>();
	
	// Form state
	let amount = $state(props.bid.amount);
	let currency = $state<Currency>(props.bid.currency);
	let estimatedCompletion = $state('');
	let message = $state('');
	let isSubmitting = $state(false);
	let validationErrors = $state<Record<string, string>>({});
	
	// Derived values
	const getOriginalPrice = $derived(formatCurrency(props.bid.amount, props.bid.currency));
	
	const getFormattedPrice = $derived(formatCurrency(amount, currency));
	
	// Form validation
	function validateForm() {
		const errors: Record<string, string> = {};
		
		if (amount <= 0) {
			errors.amount = 'Please enter a valid amount';
		}
		
		if (!message.trim()) {
			errors.message = 'Please provide a message';
		}
		
		validationErrors = errors;
		return Object.keys(errors).length === 0;
	}
	
	// Handle form submission
	async function handleSubmit() {
		if (!validateForm() || !props.bid.id) {
			return;
		}
		
		isSubmitting = true;
		
		try {
			const counterOffer = {
				price: {
					amount,
					currency
				},
				...(estimatedCompletion ? { 
					timeFrame: { 
						estimatedCompletion 
					} 
				} : {}),
				message,
				proposedBy: 'current-user-id' // This would come from user store
			};
			
			await props.onSubmit(props.bid.id, counterOffer);
		} catch (error) {
			console.error('Failed to submit counter offer:', error);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="bg-base-100 p-4 rounded-lg shadow-lg max-w-2xl mx-auto">
	<h2 class="text-xl font-bold mb-6">Create Counter Offer</h2>
	
	<div class="mb-6 bg-base-200 p-4 rounded-lg">
		<div class="flex justify-between items-center">
			<span class="text-sm font-medium">Original Bid:</span>
			<span class="font-bold">{getOriginalPrice}</span>
		</div>
		{#if props.bid.paymentType === 'HOURLY'}
			<div class="text-sm mt-1">
				{formatCurrency(props.bid.hourlyRate || 0, props.bid.currency)}/hr × {props.bid.estimatedHours || 0} hrs
			</div>
		{/if}
	</div>
	
	<form class="space-y-6" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
		<!-- Counter Offer Amount -->
		<div class="form-control">
			<label class="label" for="counter-amount">
				<span class="label-text font-medium">Counter Offer Amount</span>
			</label>
			<div class="input-group">
				<select class="select select-bordered" value={currency} onchange={(e) => currency = (e.target as HTMLSelectElement).value as Currency}>
					<option value="BTC">BTC</option>
					<option value="L-BTC">L-BTC</option>
					<option value="LN">Lightning</option>
					<option value="USD">USD</option>
				</select>
				<input 
					type="number" 
					step="0.00000001"
					min="0"
					class="input input-bordered w-full" 
					class:input-error={validationErrors.amount}
					bind:value={amount} 
					placeholder="0.00" 
				/>
			</div>
			{#if validationErrors.amount}
				<label class="label" for="counter-amount">
					<span id="amount-error" class="label-text-alt text-error">{validationErrors.amount}</span>
				</label>
			{/if}
		</div>
		
		<!-- Estimated Completion -->
		<div class="form-control">
			<label class="label" for="estimated-completion">
				<span class="label-text font-medium">Estimated Completion (Optional)</span>
			</label>
			<input 
				id="estimated-completion"
				type="text" 
				class="input input-bordered" 
				value={estimatedCompletion} 
				oninput={(e) => estimatedCompletion = (e.target as HTMLInputElement).value}
				placeholder="e.g., 2 days, 1 week" 
			/>
		</div>
		
		<!-- Message -->
		<div class="form-control">
			<label class="label" for="counter-message">
				<span class="label-text font-medium">Message</span>
			</label>
			<textarea 
				id="counter-message"
				class="textarea textarea-bordered h-24" 
				class:textarea-error={validationErrors.message}
				oninput={(e) => message = (e.target as HTMLTextAreaElement).value}
				placeholder="Explain your counter offer conditions and why you're proposing this amount"
				aria-invalid={validationErrors.message ? 'true' : undefined}
				aria-describedby={validationErrors.message ? 'message-error' : undefined}
			>{message}</textarea>
			{#if validationErrors.message}
				<label class="label" for="counter-message">
					<span id="message-error" class="label-text-alt text-error">{validationErrors.message}</span>
				</label>
			{/if}
		</div>
		
		<!-- Submit Buttons -->
		<div class="flex justify-end space-x-3 pt-4">
			<button 
				type="button" 
				class="btn btn-outline" 
				onclick={props.onCancel}
				disabled={isSubmitting}>
				Cancel
			</button>
			<button 
				type="submit" 
				class="btn btn-primary" 
				disabled={isSubmitting}>
				{isSubmitting ? 'Submitting...' : 'Send Counter Offer'}
			</button>
		</div>
	</form>
</div>
