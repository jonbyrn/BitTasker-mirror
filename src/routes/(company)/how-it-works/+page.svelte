<script lang="ts">
	import { t } from '$lib/stores/i18n.store';
	import { darkMode } from '$lib/stores/theme.store';

	// State to track which detailed step section is open
	let openStepSection = $state<number>(-1);

	// State for client/freelancer accordion in step 3
	let openTaskTalentSection = $state<number>(-1); // Default to closed

	// Function to toggle between step sections
	function toggleStepSection(index: number): void {
		if (openStepSection === index) {
			openStepSection = -1; // Close if already open
		} else {
			openStepSection = index; // Open the new one
		}
	}

	// Function to toggle between client and freelancer accordion
	function toggleTaskTalentSection(index: number): void {
		if (openTaskTalentSection === index) {
			openTaskTalentSection = -1; // Close if already open
		} else {
			openTaskTalentSection = index; // Open the new one
		}
	}
</script>

<div class="container mx-auto px-4 py-8 md:px-8">
	<!-- Hero Section -->
	<div class="hero bg-base-200 py-8">
		<div class="hero-content text-center flex-col">
			<img
				src={$darkMode
					? '/images/Bittasker-logo-tagline-dark.svg'
					: '/images/Bittasker-logo-tagline-light.svg'}
				alt="BitTasker Logo"
				class="mx-auto mb-8 block w-full max-w-lg"
			/>
			<div class="max-w-3xl">
				<h1 class="text-5xl font-bold">{$t('how_it_works.title')}</h1>
				<p class="py-6 text-lg text-base-content/80">
					{$t('how_it_works.hero.description')}
				</p>
			</div>
		</div>
	</div>

	<!-- Overview Section -->
	<div class="prose mx-auto max-w-4xl py-8">
		<div class="text-center mb-12">
			<h2 class="text-4xl font-bold">The BitTasker Process</h2>
			<p class="mt-4 text-lg text-base-content/80">
				From signup to payment, our platform makes it easy to find work, hire professionals, and
				complete tasks with confidence and security.
			</p>
		</div>
		
		<div class="alert alert-primary alert-outline mb-8">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
			</svg>
			<span><strong>New to BitTasker?</strong> Our platform uses <a href="/security" class="link link-primary">secure passkeys</a> instead of passwords and <a href="/escrow" class="link link-primary">Bitcoin-powered escrow</a> for all payments, providing a safer experience than traditional platforms.</span>
		</div>

		<!-- Steps Overview -->
		<div class="flex justify-center mb-12">
			<div class="steps steps-vertical md:steps-horizontal">
				<div class="step step-primary">
					<div>Sign Up</div>
				</div>
				<div class="step step-primary">
					<div>Create Profile</div>
				</div>
				<div class="step step-primary">
					<div>Find Tasks/Talent</div>
				</div>
				<div class="step step-primary">
					<div>Complete Work</div>
				</div>
				<div class="step step-primary">
					<div>Get Paid</div>
				</div>
			</div>
		</div>

		<!-- Detailed Steps Section -->
		<div class="mx-auto max-w-4xl">
			<h3 class="text-2xl font-bold mb-6 text-center">Detailed Process Guide</h3>
			
			<!-- Step 1: Sign Up -->
			<div class="mb-8">
				<div class="flex items-baseline gap-4 mb-4">
					<div class="badge badge-primary badge-lg">1</div>
					<h3 class="text-2xl font-bold">Sign Up with BitTasker</h3>
				</div>
				
				<div class="card bg-base-100 shadow-lg mb-4">
					<div class="card-body">
						<p class="mb-4">Create your BitTasker account using our secure passkey system - no passwords needed! Our modern authentication approach uses your device's biometric security (fingerprint or face recognition) to keep your account safe.</p>
						
						<div class="flex flex-col md:flex-row gap-4 mt-4">
							<div class="flex-1">
								<h4 class="font-semibold mb-2">Quick and Secure</h4>
								<ul class="list-disc list-inside space-y-1">
									<li>Register in under 60 seconds</li>
									<li>No password to remember or risk being stolen</li>
									<li>Phishing-resistant technology</li>
								</ul>
							</div>
							<div class="flex-1">
								<h4 class="font-semibold mb-2">What You'll Need</h4>
								<ul class="list-disc list-inside space-y-1">
									<li>Modern device with biometric capability</li>
									<li>Optional: recovery email for account backup</li>
								</ul>
							</div>
						</div>
						
						<div class="card shadow-sm bg-base-200 mt-4">
							<div class="card-body p-4">
								<div class="flex items-start">
									<i class="fa-solid fa-lightbulb text-warning mr-3 mt-1"></i>
									<div>
										<p class="text-sm">Learn more about our <a href="/security" class="link link-primary">security approach</a> and how we protect your account better than traditional password-based platforms.</p>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Step 2: Create Profile -->
			<div class="mb-8">
				<div class="flex items-baseline gap-4 mb-4">
					<div class="badge badge-primary badge-lg">2</div>
					<h3 class="text-2xl font-bold">Create Your Professional Profile</h3>
				</div>
				
				<div class="card bg-base-100 shadow-lg mb-4">
					<div class="card-body">
						<p class="mb-4">Your profile is your digital reputation on BitTasker. Whether you're hiring or being hired, a complete profile builds trust and increases your chances of success on the platform.</p>
						
						<div class="divider">Key Profile Elements</div>
						
						<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title text-lg">Skills & Expertise</h4>
									<p>Highlight what you do best. Be specific about your skills so clients can find you for the right tasks.</p>
								</div>
							</div>
							
							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title text-lg">Experience & Portfolio</h4>
									<p>Share your work history, qualifications, and examples of previous projects to establish credibility.</p>
								</div>
							</div>
							
							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title text-lg">Rates & Availability</h4>
									<p>Set your hourly or project-based rates, and use our calendar system to manage your available working hours.</p>
								</div>
							</div>
							
							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title text-lg">Payment Methods</h4>
									<p>Begin accepting payments immediately with our built-in wallets.</p>
								</div>
							</div>
						</div>
						
						<div class="alert alert-success alert-outline mt-6">
							<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<span><strong>Pro tip:</strong> Profiles with a profile photo, verified skills, and complete information get up to 5x more work opportunities. Take time to make yours stand out!</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Step 3: Find Tasks/Talent -->
			<div class="mb-8">
				<div class="flex items-baseline gap-4 mb-4">
					<div class="badge badge-primary badge-lg">3</div>
					<h3 class="text-2xl font-bold">Find Tasks or Talent</h3>
				</div>
				
				<div class="card bg-base-100 shadow-lg mb-4">
					<div class="card-body">
						<p class="mb-4">BitTasker's matching system connects clients with the right freelancers and helps professionals find work that matches their skills.</p>
						
						<div class="join join-vertical w-full">
							<!-- For Clients -->
							<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openTaskTalentSection === 0}>
								<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleTaskTalentSection(0)}>
									For Clients: Post a Task, Get Offers
								</button>
								<div class="collapse-content">
									<div class="space-y-4">
										<div class="flex gap-4 items-center">
											<div class="badge badge-outline">1</div>
											<div>
												<p class="font-semibold">Describe your task</p>
												<p class="text-base-content/80">Be specific about what you need, when you need it, and your budget.</p>
											</div>
										</div>
										
										<div class="flex gap-4 items-center">
											<div class="badge badge-outline">2</div>
											<div>
												<p class="font-semibold">Review offers from qualified professionals</p>
												<p class="text-base-content/80">Compare skills, ratings, and price quotes to find the perfect match.</p>
											</div>
										</div>
										
										<div class="flex gap-4 items-center">
											<div class="badge badge-outline">3</div>
											<div>
												<p class="font-semibold">Hire and pay through secure escrow</p>
												<p class="text-base-content/80">Our <a href="/escrow" class="link link-primary">escrow system</a> protects both parties during the transaction.</p>
											</div>
										</div>
									</div>
									
									<div class="alert alert-info alert-outline mt-6">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
										</svg>
										<span><strong>Budget Tip:</strong> Set a realistic budget range for your project with our fixed-price payment model. Be as detailed and accurate as possible with your tasks to ensure accurate bids and avoid rescopes from taskers.</span>
									</div>
								</div>
							</div>
							
							<!-- For Freelancers -->
							<div class="collapse collapse-arrow join-item border-b border-base-300" class:collapse-open={openTaskTalentSection === 1}>
								<button type="button" class="collapse-title text-xl font-medium text-left" onclick={() => toggleTaskTalentSection(1)}>
									For Freelancers: Find Work That Matches Your Skills
								</button>
								<div class="collapse-content">
									<div class="space-y-4">
										<div class="flex gap-4 items-center">
											<div class="badge badge-outline">1</div>
											<div>
												<p class="font-semibold">Browse available tasks</p>
												<p class="text-base-content/80">Filter by category, location, budget, and project type to find your ideal match.</p>
											</div>
										</div>
										
										<div class="flex gap-4 items-center">
											<div class="badge badge-outline">2</div>
											<div>
												<p class="font-semibold">Send compelling offers</p>
												<p class="text-base-content/80">Explain why you're perfect for the job, your approach, timeline, and pricing.</p>
											</div>
										</div>
										
										<div class="flex gap-4 items-center">
											<div class="badge badge-outline">3</div>
											<div>
												<p class="font-semibold">Negotiate and accept terms</p>
												<p class="text-base-content/80">When hired, you'll receive clear tasks, milestones, and payment terms through our platform.</p>
											</div>
										</div>
									</div>
									
									<div class="alert alert-info alert-outline mt-6">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
										</svg>
										<span><strong>Success Tip:</strong> Customize each proposal instead of sending generic responses. Clients are more likely to hire freelancers who address their specific needs.</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Step 4: Complete Work -->
			<div class="mb-8">
				<div class="flex items-baseline gap-4 mb-4">
					<div class="badge badge-primary badge-lg">4</div>
					<h3 class="text-2xl font-bold">Complete the Work</h3>
				</div>
				
				<div class="card bg-base-100 shadow-lg mb-4">
					<div class="card-body">
						<p class="mb-4">BitTasker provides all the tools you need to successfully complete projects, track progress, and maintain clear communication throughout.</p>
						
						<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<div class="flex items-center gap-3">
										<i class="fa-solid fa-comments text-primary"></i>
										<h4 class="font-bold">End-to-End Encrypted Messaging</h4>
									</div>
									<p class="mt-2">Private and secure communication between clients and freelancers with <a href="/security" class="link link-primary">end-to-end encryption</a>.</p>
								</div>
							</div>
							
							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<div class="flex items-center gap-3">
										<i class="fa-solid fa-file-arrow-up text-primary"></i>
										<h4 class="font-bold">File Sharing</h4>
									</div>
									<p class="mt-2">Securely exchange documents, images, and files necessary for project completion.</p>
								</div>
							</div>
							
							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<div class="flex items-center gap-3">
										<i class="fa-solid fa-flag text-primary"></i>
										<h4 class="font-bold">Milestone Tracking</h4>
									</div>
									<p class="mt-2">Break projects into manageable milestones with individual escrow payments for each completed phase.</p>
								</div>
							</div>
							
							<div class="card bg-base-200 shadow-sm">
								<div class="card-body p-4">
									<div class="flex items-center gap-3">
										<i class="fa-solid fa-handshake text-primary"></i>
										<h4 class="font-bold">Task Completion</h4>
									</div>
									<p class="mt-2">Mark tasks as complete when finished, triggering the escrow release process for payment.</p>
								</div>
							</div>
						</div>
						
						<div class="alert alert-warning alert-outline mt-6">
							<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z" />
							</svg>
							<span><strong>Important:</strong> Always communicate through the BitTasker platform to ensure protection under our <a href="/community-guidelines" class="link link-primary">community guidelines</a> and dispute resolution process.</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Step 5: Get Paid -->
			<div class="mb-8">
				<div class="flex items-baseline gap-4 mb-4">
					<div class="badge badge-primary badge-lg">5</div>
					<h3 class="text-2xl font-bold">Get Paid in Bitcoin and Fiat</h3>
				</div>
				
				<div class="card bg-base-100 shadow-lg mb-4">
					<div class="card-body">
						<p class="mb-4">BitTasker's flexible payment system supports both Bitcoin and traditional fiat currencies, ensuring freelancers receive their earnings securely and promptly with multiple withdrawal options.</p>
						
						<div class="divider">Key Payment Features</div>
						
						<div class="space-y-6">
							<div class="card shadow-sm bg-base-200">
								<div class="card-body p-4">
									<div class="flex items-center">
										<i class="fa-solid fa-lock text-success text-xl mr-4"></i>
										<div>
											<h4 class="font-semibold">Secure Escrow System</h4>
											<p>Client funds are secured in our <a href="/escrow" class="link link-primary">secure escrow system</a> until work is approved, protecting both parties throughout the transaction regardless of payment method.</p>
										</div>
									</div>
								</div>
							</div>
							
							<div class="card shadow-sm bg-base-200">
								<div class="card-body p-4">
									<div class="flex items-center">
										<i class="fa-solid fa-clock text-success text-xl mr-4"></i>
										<div>
											<h4 class="font-semibold">Automatic Payment Release</h4>
											<p>Funds are automatically released to freelancers 7 days after marking a task complete if the client hasn't taken action, ensuring you never wait indefinitely for payment.</p>
										</div>
									</div>
								</div>
							</div>
							
							<div class="card shadow-sm bg-base-200">
								<div class="card-body p-4">
									<div class="flex items-center">
										<i class="fa-solid fa-bolt text-success text-xl mr-4"></i>
										<div>
											<h4 class="font-semibold">Flexible Withdrawal Options</h4>
											<p>Withdraw earnings to your personal Bitcoin wallet (on-chain, Liquid, or Lightning Network) or receive fiat payments via traditional banking methods with competitive fees.</p>
										</div>
									</div>
								</div>
							</div>
						</div>
						
						<div class="alert alert-primary alert-outline mt-6">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
							<span><strong>Fee Advantage:</strong> BitTasker's <a href="/tasker-fees" class="link link-primary">dynamic fee structure</a> rewards active users with progressively lower fees. The more you use the platform, the less you pay!</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- CTA Section -->
	<div class="mx-auto max-w-4xl py-16 text-center">
		<h3 class="text-3xl font-bold mb-4">Ready to Get Started?</h3>
		<p class="mx-auto max-w-2xl text-lg text-base-content/80 mb-8">
			Join BitTasker today and experience a better way to find work or hire skilled professionals. Our Bitcoin-powered platform makes transactions secure, borderless, and efficient.
		</p>
		<div class="flex flex-col sm:flex-row justify-center gap-4">
			<a href="/auth/signup" class="btn btn-primary btn-lg">Create Your Account</a>
			<a href="/faq" class="btn btn-outline btn-lg">Browse FAQ</a>
		</div>
		
		<div class="mt-12 flex flex-wrap justify-center gap-6">
			<a href="/security" class="link link-hover flex items-center gap-2">
				<i class="fa-solid fa-shield-halved"></i> Security
			</a>
			<a href="/privacy" class="link link-hover flex items-center gap-2">
				<i class="fa-solid fa-user-shield"></i> Privacy
			</a>
			<a href="/escrow" class="link link-hover flex items-center gap-2">
				<i class="fa-solid fa-vault"></i> Escrow System
			</a>
			<a href="/tasker-principles" class="link link-hover flex items-center gap-2">
				<i class="fa-solid fa-medal"></i> Tasker Principles
			</a>
			<a href="/community-guidelines" class="link link-hover flex items-center gap-2">
				<i class="fa-solid fa-handshake"></i> Community Guidelines
			</a>
		</div>
	</div>
</div>
