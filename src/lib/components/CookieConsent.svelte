<!--
	Cookie Consent Banner Component
	
	GDPR-compliant banner that allows users to accept/reject analytics cookies.
	Integrates with analytics store and respects user preferences.
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { analyticsStore, shouldShowBanner, type CookiePreferences } from '$lib/stores/analytics.store';
	import { updateAnalyticsConsent } from '$lib/utils/helpers/fcm';
	
	// Props
	let { position = 'bottom', theme = 'dark' }: { 
		position?: 'bottom' | 'top'; 
		theme?: 'light' | 'dark' 
	} = $props();

	// Component state
	let showBanner = $state(false);
	let showDetails = $state(false);
	let preferences = $state<CookiePreferences>({
		necessary: true,
		analytics: false,
		marketing: false,
		personalization: true
	});

	// Subscribe to store to show/hide banner
	shouldShowBanner.subscribe(value => {
		showBanner = value;
	});

	// Handle accept all cookies
	function acceptAll() {
		const allAcceptedPreferences: CookiePreferences = {
			necessary: true,
			analytics: true,
			marketing: false, // Keep disabled for now
			personalization: true
		};

		analyticsStore.grantConsent(allAcceptedPreferences);
		updateAnalyticsConsent(true);
		showBanner = false;
		showDetails = false;
	}

	// Handle reject optional cookies (keep only necessary)
	function rejectOptional() {
		const necessaryOnlyPreferences: CookiePreferences = {
			necessary: true,
			analytics: false,
			marketing: false,
			personalization: false
		};

		analyticsStore.grantConsent(necessaryOnlyPreferences);
		updateAnalyticsConsent(false);
		showBanner = false;
		showDetails = false;
	}

	// Handle save custom preferences
	function savePreferences() {
		analyticsStore.grantConsent(preferences);
		updateAnalyticsConsent(preferences.analytics);
		showBanner = false;
		showDetails = false;
	}

	// Handle dismiss for later
	function dismissForLater() {
		analyticsStore.dismissBanner();
		showBanner = false;
		showDetails = false;
	}

	// Toggle details view
	function toggleDetails() {
		showDetails = !showDetails;
	}

	// Initialize on mount
	onMount(() => {
		// Get current preferences from store
		const currentState = analyticsStore.getState();
		preferences = { ...currentState.preferences };
	});
</script>

{#if showBanner}
	<div 
		class="cookie-banner {theme} {position}"
		role="dialog"
		aria-labelledby="cookie-banner-title"
		aria-describedby="cookie-banner-description"
	>
		<div class="cookie-banner-container">
			{#if !showDetails}
				<!-- Simple Banner View -->
				<div class="cookie-banner-content">
					<div class="cookie-banner-text">
						<h3 id="cookie-banner-title" class="cookie-banner-title">
							We value your privacy
						</h3>
						<p id="cookie-banner-description" class="cookie-banner-description">
							We use cookies to enhance your experience and analyze how our app is used. 
							You can choose which types of cookies you're comfortable with.
						</p>
					</div>

					<div class="cookie-banner-actions">
						<button 
							type="button"
							class="btn btn-sm btn-ghost"
							onclick={toggleDetails}
						>
							Customize
						</button>
						<button 
							type="button"
							class="btn btn-sm btn-outline"
							onclick={rejectOptional}
						>
							Reject Optional
						</button>
						<button 
							type="button"
							class="btn btn-sm btn-primary"
							onclick={acceptAll}
						>
							Accept All
						</button>
					</div>
				</div>
			{:else}
				<!-- Detailed Preferences View -->
				<div class="cookie-preferences">
					<div class="cookie-preferences-header">
						<h3 class="cookie-preferences-title">Cookie Preferences</h3>
						<button 
							type="button"
							class="btn btn-sm btn-ghost"
							onclick={toggleDetails}
							aria-label="Back to simple view"
						>
							←
						</button>
					</div>

					<div class="cookie-preferences-content">
						<!-- Necessary Cookies -->
						<div class="cookie-category">
							<div class="cookie-category-header">
								<h4>Necessary Cookies</h4>
								<div class="toggle">
									<input 
										type="checkbox" 
										id="necessary"
										checked={preferences.necessary}
										disabled
										class="toggle toggle-sm toggle-primary"
									/>
									<label for="necessary" class="toggle-label">Always On</label>
								</div>
							</div>
							<p class="cookie-category-description">
								These cookies are essential for the app to function properly. 
								They enable core functionality like authentication and security.
							</p>
						</div>

						<!-- Analytics Cookies -->
						<div class="cookie-category">
							<div class="cookie-category-header">
								<h4>Analytics Cookies</h4>
								<div class="toggle">
									<input 
										type="checkbox" 
										id="analytics"
										bind:checked={preferences.analytics}
										class="toggle toggle-sm toggle-primary"
									/>
									<label for="analytics" class="toggle-label">
										{preferences.analytics ? 'Enabled' : 'Disabled'}
									</label>
								</div>
							</div>
							<p class="cookie-category-description">
								Help us understand how you use BitTasker so we can improve your experience. 
								This includes Google Analytics and Firebase Analytics.
							</p>
						</div>

						<!-- Personalization Cookies -->
						<div class="cookie-category">
							<div class="cookie-category-header">
								<h4>Personalization Cookies</h4>
								<div class="toggle">
									<input 
										type="checkbox" 
										id="personalization"
										bind:checked={preferences.personalization}
										class="toggle toggle-sm toggle-primary"
									/>
									<label for="personalization" class="toggle-label">
										{preferences.personalization ? 'Enabled' : 'Disabled'}
									</label>
								</div>
							</div>
							<p class="cookie-category-description">
								Remember your preferences and settings to provide a personalized experience.
							</p>
						</div>

						<!-- Marketing Cookies (Future) -->
						<div class="cookie-category opacity-50">
							<div class="cookie-category-header">
								<h4>Marketing Cookies</h4>
								<div class="toggle">
									<input 
										type="checkbox" 
										id="marketing"
										checked={false}
										disabled
										class="toggle toggle-sm"
									/>
									<label for="marketing" class="toggle-label">Coming Soon</label>
								</div>
							</div>
							<p class="cookie-category-description">
								Not currently used. Will be used for targeted content and advertising in the future.
							</p>
						</div>
					</div>

					<div class="cookie-preferences-actions">
						<button 
							type="button"
							class="btn btn-sm btn-ghost"
							onclick={dismissForLater}
						>
							Decide Later
						</button>
						<button 
							type="button"
							class="btn btn-sm btn-outline"
							onclick={rejectOptional}
						>
							Reject All Optional
						</button>
						<button 
							type="button"
							class="btn btn-sm btn-primary"
							onclick={savePreferences}
						>
							Save Preferences
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.cookie-banner {
		position: fixed;
		left: 0;
		right: 0;
		z-index: 9999;
		padding: 1rem;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	.cookie-banner.bottom {
		bottom: 0;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		border-bottom: none;
	}

	.cookie-banner.top {
		top: 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		border-top: none;
	}

	.cookie-banner.dark {
		background: rgba(30, 30, 30, 0.95);
		color: white;
	}

	.cookie-banner.light {
		background: rgba(255, 255, 255, 0.95);
		color: #333;
		border-color: rgba(0, 0, 0, 0.1);
	}

	.cookie-banner-container {
		max-width: 1200px;
		margin: 0 auto;
	}

	.cookie-banner-content {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	.cookie-banner-text {
		flex: 1;
		min-width: 300px;
	}

	.cookie-banner-title {
		margin: 0 0 0.5rem 0;
		font-size: 1.1rem;
		font-weight: 600;
	}

	.cookie-banner-description {
		margin: 0;
		font-size: 0.9rem;
		opacity: 0.9;
		line-height: 1.4;
	}

	.cookie-banner-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.cookie-preferences {
		max-width: 600px;
		margin: 0 auto;
	}

	.cookie-preferences-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.cookie-preferences-title {
		margin: 0;
		font-size: 1.2rem;
		font-weight: 600;
	}

	.cookie-preferences-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.cookie-category {
		padding: 1rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.05);
	}

	.cookie-banner.light .cookie-category {
		border-color: rgba(0, 0, 0, 0.1);
		background: rgba(0, 0, 0, 0.02);
	}

	.cookie-category-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.cookie-category-header h4 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.toggle-label {
		font-size: 0.8rem;
		opacity: 0.8;
	}

	.cookie-category-description {
		margin: 0;
		font-size: 0.85rem;
		opacity: 0.8;
		line-height: 1.4;
	}

	.cookie-preferences-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
		flex-wrap: wrap;
	}

	/* Mobile Responsiveness */
	@media (max-width: 768px) {
		.cookie-banner {
			padding: 0.75rem;
		}

		.cookie-banner-content {
			flex-direction: column;
			text-align: center;
		}

		.cookie-banner-text {
			min-width: unset;
		}

		.cookie-banner-actions {
			justify-content: center;
			width: 100%;
		}

		.cookie-preferences-header {
			flex-direction: column;
			gap: 1rem;
			text-align: center;
		}

		.cookie-category-header {
			flex-direction: column;
			gap: 0.5rem;
			text-align: center;
		}

		.cookie-preferences-actions {
			flex-direction: column;
		}
	}

	/* Animation */
	.cookie-banner {
		animation: slideUp 0.3s ease-out;
	}

	.cookie-banner.top {
		animation: slideDown 0.3s ease-out;
	}

	@keyframes slideUp {
		from {
			transform: translateY(100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	@keyframes slideDown {
		from {
			transform: translateY(-100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}
</style>