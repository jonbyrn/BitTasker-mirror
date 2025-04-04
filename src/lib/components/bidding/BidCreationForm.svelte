<script lang="ts">
	import type { Bid, Currency, PaymentType } from '$lib/types/bid';
	import { BudgetTypeEnum } from '$lib/utils/enums/task.enum';
	import { slide } from 'svelte/transition';
	
	// Props
	const props = $props<{
		taskId: string;
		onSubmit: (bid: Bid) => Promise<void>;
		onCancel: () => void;
	}>();
	
	// Form state
	let paymentType = $state<PaymentType>('FIXED');
	let amount = $state(0);
	let currency = $state<Currency>('BTC');
	let hourlyRate = $state(0);
	let estimatedHours = $state(0);
	let description = $state('');
	let estimatedDuration = $state('');
	let proposedApproach = $state('');
	let coverLetter = $state('');
	let milestones = $state<string[]>(['']);
	let skills = $state<string[]>(['']);
	let certifications = $state<string[]>(['']);
	let portfolioItems = $state<string[]>(['']);
	let isSubmitting = $state(false);
	let validationErrors = $state<Record<string, string>>({});
	
	// Dynamic array handling
	function addItem(array: string[], index: number) {
		const newArray = [...array];
		newArray.splice(index + 1, 0, '');
		return newArray;
	}
	
	function removeItem(array: string[], index: number) {
		if (array.length > 1) {
			const newArray = [...array];
			newArray.splice(index, 1);
			return newArray;
		} else {
			const newArray = [...array];
			newArray[0] = '';
			return newArray;
		}
	}
	
	// Derived calculations
	const getTotalAmount = $derived(
		paymentType === 'HOURLY' ? hourlyRate * estimatedHours : amount
	);
	
	// Form validation
	function validateForm() {
		const errors: Record<string, string> = {};
		
		if (getTotalAmount <= 0) {
			errors.amount = 'Please enter a valid amount';
		}
		
		if (paymentType === 'HOURLY') {
			if (hourlyRate <= 0) {
				errors.hourlyRate = 'Please enter a valid hourly rate';
			}
			if (estimatedHours <= 0) {
				errors.estimatedHours = 'Please enter estimated hours';
			}
		}
		
		if (!description.trim()) {
			errors.description = 'Please provide a description';
		}
		
		if (!estimatedDuration.trim()) {
			errors.estimatedDuration = 'Please provide estimated duration';
		}
		
		if (!proposedApproach.trim()) {
			errors.proposedApproach = 'Please describe your approach';
		}
		
		validationErrors = errors;
		return Object.keys(errors).length === 0;
	}
	
	// Handle form submission
	async function handleSubmit() {
		if (!validateForm()) {
			return;
		}
		
		isSubmitting = true;
		
		try {
			// Filter out empty items
			const filteredMilestones = milestones.filter(m => m.trim());
			const filteredSkills = skills.filter(s => s.trim());
			const filteredCertifications = certifications.filter(c => c.trim());
			const filteredPortfolioItems = portfolioItems.filter(p => p.trim());
			
			const newBid: Bid = {
				taskId: props.taskId,
				amount: getTotalAmount,
				description,
				estimatedDuration,
				proposedApproach,
				coverLetter,
				paymentType,
				currency,
				visibility: 'PUBLIC',
				responseTime: 24, // Default response time in hours
				milestones: filteredMilestones.length > 0 ? filteredMilestones : undefined,
				hourlyRate: paymentType === 'HOURLY' ? hourlyRate : undefined,
				estimatedHours: paymentType === 'HOURLY' ? estimatedHours : undefined,
				providerHighlights: {
					skills: filteredSkills,
					certifications: filteredCertifications,
					portfolioItems: filteredPortfolioItems
				}
			};
			
			await props.onSubmit(newBid);
		} catch (error) {
			console.error('Failed to submit bid:', error);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="bg-base-100 p-4 rounded-lg shadow-lg max-w-2xl mx-auto">
	<h2 class="text-2xl font-bold mb-6">Submit a Bid</h2>
	
	<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
		<!-- Payment Type -->
		<div class="form-control">
			<label class="label" id="payment-type-label" for="payment-type">
				<span class="label-text font-medium">Payment Type</span>
			</label>
			<div class="tabs tabs-boxed" role="tablist" aria-label="Payment type options">
				<button 
					type="button"
					class="tab" 
					class:tab-active={paymentType === 'FIXED'}
					onclick={() => paymentType = 'FIXED'}
					onkeydown={(e) => e.key === 'Enter' && (paymentType = 'FIXED')}
					role="tab"
					aria-selected={paymentType === 'FIXED'}
					aria-controls="fixed-price-panel">
					Fixed Price
				</button>
				<button 
					type="button"
					class="tab" 
					class:tab-active={paymentType === 'HOURLY'} 
					onclick={() => paymentType = 'HOURLY'}
					onkeydown={(e) => e.key === 'Enter' && (paymentType = 'HOURLY')}
					role="tab"
					aria-selected={paymentType === 'HOURLY'}
					aria-controls="hourly-rate-panel">
					Hourly Rate
				</button>
			</div>
		</div>
		
		<!-- Price -->
		<div id="fixed-price-panel" role="tabpanel" aria-labelledby="fixed-price-tab" class:hidden={paymentType !== 'FIXED'}>
		{#if paymentType === 'FIXED'}
			<div class="form-control">
				<label class="label" for="bid-amount">
					<span class="label-text font-medium">Bid Amount</span>
				</label>
				<div class="input-group">
					<select id="hourly-currency" class="select select-bordered" value={currency} onchange={(e) => currency = (e.target as HTMLSelectElement).value as Currency} aria-label="Currency selection">
						<option value="BTC">BTC</option>
						<option value="L-BTC">L-BTC</option>
						<option value="LN">Lightning</option>
						<option value="USD">USD</option>
					</select>
					<input 
						id="bid-amount"
						type="number" 
						step="0.00000001"
						min="0"
						class="input input-bordered w-full" 
						class:input-error={validationErrors.amount}
						value={amount} 
						oninput={(e) => amount = parseFloat((e.target as HTMLInputElement).value) || 0}
						placeholder="0.00" 
						aria-invalid={validationErrors.amount ? 'true' : undefined}
						aria-describedby={validationErrors.amount ? 'amount-error' : undefined}
					/>
				</div>
				{#if validationErrors.amount}
					<label class="label" for="bid-amount">
						<span id="amount-error" class="label-text-alt text-error">{validationErrors.amount}</span>
					</label>
				{/if}
			</div>
		{/if}
		</div>
		
		<div id="hourly-rate-panel" role="tabpanel" aria-labelledby="hourly-rate-tab" class:hidden={paymentType !== 'HOURLY'}>
		{#if paymentType === 'HOURLY'}
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div class="form-control">
					<label class="label" for="hourly-rate">
						<span class="label-text font-medium">Hourly Rate</span>
					</label>
					<div class="input-group">
						<select id="hourly-currency" class="select select-bordered" value={currency} onchange={(e) => currency = (e.target as HTMLSelectElement).value as Currency} aria-label="Currency selection">
							<option value="BTC">BTC</option>
							<option value="L-BTC">L-BTC</option>
							<option value="LN">Lightning</option>
							<option value="USD">USD</option>
						</select>
						<input 
							id="hourly-rate"
							type="number" 
							step="0.00000001"
							min="0"
							class="input input-bordered w-full" 
							class:input-error={validationErrors.hourlyRate}
							value={hourlyRate} 
							oninput={(e) => hourlyRate = parseFloat((e.target as HTMLInputElement).value) || 0}
							placeholder="0.00" 
							aria-invalid={validationErrors.hourlyRate ? 'true' : undefined}
							aria-describedby={validationErrors.hourlyRate ? 'hourly-rate-error' : undefined}
						/>
					</div>
					{#if validationErrors.hourlyRate}
						<label class="label" for="hourly-rate">
							<span id="hourly-rate-error" class="label-text-alt text-error">{validationErrors.hourlyRate}</span>
						</label>
					{/if}
				</div>
				
				<div class="form-control">
					<label class="label" for="estimated-hours">
						<span class="label-text font-medium">Estimated Hours</span>
					</label>
					<input 
						id="estimated-hours"
						type="number" 
						min="1" 
						step="1"
						class="input input-bordered w-full" 
						class:input-error={validationErrors.estimatedHours}
						value={estimatedHours} 
						oninput={(e) => estimatedHours = parseInt((e.target as HTMLInputElement).value) || 0}
						placeholder="10" 
						aria-invalid={validationErrors.estimatedHours ? 'true' : undefined}
						aria-describedby={validationErrors.estimatedHours ? 'estimated-hours-error' : undefined}
					/>
					{#if validationErrors.estimatedHours}
						<label class="label" for="estimated-hours">
							<span id="estimated-hours-error" class="label-text-alt text-error">{validationErrors.estimatedHours}</span>
						</label>
					{/if}
				</div>
			</div>
			
			<div class="form-control">
				<label class="label" id="total-amount-label" for="total-amount">
					<span class="label-text font-medium">Total Estimated Amount</span>
				</label>
				<div class="bg-base-200 p-3 rounded-md">
					<div class="text-lg font-semibold">
						{currency} {getTotalAmount.toFixed(8)}
					</div>
					<div class="text-sm opacity-70">
						{currency} {hourlyRate.toFixed(8)} × {estimatedHours} hours
					</div>
				</div>
			</div>
		{/if}
		
		<!-- Bid Description -->
		<div class="form-control">
			<label class="label" for="bid-description">
				<span class="label-text font-medium">Bid Description</span>
			</label>
			<textarea 
				id="bid-description"
				class="textarea textarea-bordered h-24" 
				class:textarea-error={validationErrors.description}
				oninput={(e) => description = (e.target as HTMLTextAreaElement).value}
				placeholder="Describe your bid, what you're offering to do, and why you're the right person for this task"
				aria-invalid={validationErrors.description ? 'true' : undefined}
				aria-describedby={validationErrors.description ? 'description-error' : undefined}
			>{description}</textarea>
			{#if validationErrors.description}
				<label class="label" for="bid-description">
					<span id="description-error" class="label-text-alt text-error">{validationErrors.description}</span>
				</label>
			{/if}
		</div>
		
		<!-- Estimated Duration -->
		<div class="form-control">
			<label class="label" for="estimated-duration">
				<span class="label-text font-medium">Estimated Duration</span>
			</label>
			<input 
				id="estimated-duration"
				type="text" 
				class="input input-bordered" 
				class:input-error={validationErrors.estimatedDuration}
				value={estimatedDuration} 
				oninput={(e) => estimatedDuration = (e.target as HTMLInputElement).value}
				placeholder="e.g., 3 days, 2 weeks" 
				aria-invalid={validationErrors.estimatedDuration ? 'true' : undefined}
				aria-describedby={validationErrors.estimatedDuration ? 'duration-error' : undefined}
			/>
			{#if validationErrors.estimatedDuration}
				<label class="label" for="estimated-duration">
					<span id="duration-error" class="label-text-alt text-error">{validationErrors.estimatedDuration}</span>
				</label>
			{/if}
		</div>
		
		<!-- Proposed Approach -->
		<div class="form-control">
			<label class="label" for="proposed-approach">
				<span class="label-text font-medium">Proposed Approach</span>
			</label>
			<textarea 
				id="proposed-approach"
				class="textarea textarea-bordered h-24" 
				class:textarea-error={validationErrors.proposedApproach}
				oninput={(e) => proposedApproach = (e.target as HTMLTextAreaElement).value}
				placeholder="Explain how you plan to approach and complete this task"
				aria-invalid={validationErrors.proposedApproach ? 'true' : undefined}
				aria-describedby={validationErrors.proposedApproach ? 'approach-error' : undefined}
			>{proposedApproach}</textarea>
			{#if validationErrors.proposedApproach}
				<label class="label" for="proposed-approach">
					<span id="approach-error" class="label-text-alt text-error">{validationErrors.proposedApproach}</span>
				</label>
			{/if}
		</div>
		
		<!-- Cover Letter -->
		<div class="form-control">
			<label class="label" for="cover-letter">
				<span class="label-text font-medium">Cover Letter (Optional)</span>
			</label>
			<textarea 
				id="cover-letter"
				class="textarea textarea-bordered h-24" 
				oninput={(e) => coverLetter = (e.target as HTMLTextAreaElement).value}
				placeholder="Add any additional information for the task creator"
			>{coverLetter}</textarea>
		</div>
		
		<!-- Milestones -->
		<div class="form-control">
			<label class="label" id="milestones-label" for="milestones">
				<span class="label-text font-medium">Milestones (Optional)</span>
			</label>
			{#each milestones as milestone, i}
				<div class="flex items-center gap-2 mb-2" transition:slide>
					<input 
						type="text" 
						class="input input-bordered w-full" 
						value={milestones[i]} oninput={(e) => {
						const newMilestones = [...milestones];
						newMilestones[i] = (e.target as HTMLInputElement).value;
						milestones = newMilestones;
					}} 
						placeholder="e.g., Design completed by Day 3" 
					/>
					<button 
						type="button" 
						class="btn btn-square btn-outline btn-sm" 
						onclick={() => milestones = addItem(milestones, i)}>
						+
					</button>
					<button 
						type="button" 
						class="btn btn-square btn-outline btn-sm" 
						onclick={() => milestones = removeItem(milestones, i)}>
						-
					</button>
				</div>
			{/each}
		</div>
		
		<!-- Provider Highlights -->
		<div class="divider">Provider Highlights</div>
		
		<!-- Skills -->
		<div class="form-control">
			<label class="label" id="skills-label" for="skills">
				<span class="label-text font-medium">Skills</span>
			</label>
			{#each skills as skill, i}
				<div class="flex items-center gap-2 mb-2" transition:slide>
					<input 
						type="text" 
						class="input input-bordered w-full" 
						value={skills[i]} oninput={(e) => {
						const newSkills = [...skills];
						newSkills[i] = (e.target as HTMLInputElement).value;
						skills = newSkills;
					}} 
						placeholder="e.g., JavaScript, Smart Contract Development" 
					/>
					<button 
						type="button" 
						class="btn btn-square btn-outline btn-sm" 
						onclick={() => skills = addItem(skills, i)}>
						+
					</button>
					<button 
						type="button" 
						class="btn btn-square btn-outline btn-sm" 
						onclick={() => skills = removeItem(skills, i)}>
						-
					</button>
				</div>
			{/each}
		</div>
		
		<!-- Certifications -->
		<div class="form-control">
			<label class="label" id="certifications-label" for="certifications">
				<span class="label-text font-medium">Certifications (Optional)</span>
			</label>
			{#each certifications as cert, i}
				<div class="flex items-center gap-2 mb-2" transition:slide>
					<input 
						type="text" 
						class="input input-bordered w-full" 
						value={certifications[i]} oninput={(e) => {
						const newCertifications = [...certifications];
						newCertifications[i] = (e.target as HTMLInputElement).value;
						certifications = newCertifications;
					}} 
						placeholder="e.g., Blockchain Developer Certificate" 
					/>
					<button 
						type="button" 
						class="btn btn-square btn-outline btn-sm" 
						onclick={() => certifications = addItem(certifications, i)}>
						+
					</button>
					<button 
						type="button" 
						class="btn btn-square btn-outline btn-sm" 
						onclick={() => certifications = removeItem(certifications, i)}>
						-
					</button>
				</div>
			{/each}
		</div>
		
		<!-- Portfolio Items -->
		<div class="form-control">
			<label class="label" id="portfolio-items-label" for="portfolio-items">
				<span class="label-text font-medium">Portfolio Items (Optional)</span>
			</label>
			{#each portfolioItems as item, i}
				<div class="flex items-center gap-2 mb-2" transition:slide>
					<input 
						type="text" 
						class="input input-bordered w-full" 
						value={portfolioItems[i]} oninput={(e) => {
						const newPortfolioItems = [...portfolioItems];
						newPortfolioItems[i] = (e.target as HTMLInputElement).value;
						portfolioItems = newPortfolioItems;
					}} 
						placeholder="e.g., Link to previous work" 
					/>
					<button 
						type="button" 
						class="btn btn-square btn-outline btn-sm" 
						onclick={() => portfolioItems = addItem(portfolioItems, i)}>
						+
					</button>
					<button 
						type="button" 
						class="btn btn-square btn-outline btn-sm" 
						onclick={() => portfolioItems = removeItem(portfolioItems, i)}>
						-
					</button>
				</div>
			{/each}
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
				{isSubmitting ? 'Submitting...' : 'Submit Bid'}
			</button>
		</div>
	</form>
</div>
