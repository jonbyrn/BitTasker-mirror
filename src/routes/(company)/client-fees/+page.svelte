<script lang="ts">
	// Current date for the "last updated" timestamp
	const currentDate = new Date().toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
</script>

<div class="container mx-auto p-4 py-8 md:p-12">
	<div class="text-center">
		<h1 class="text-4xl font-bold">Client Fees & Pricing</h1>
		<p class="mx-auto mt-4 max-w-3xl text-lg text-base-content/80">
			Simple, transparent pricing designed to reward loyal clients
		</p>
		<p class="text-sm text-base-content/70 mt-2">Last Updated: {currentDate}</p>
	</div>

	<div class="prose mx-auto mt-8 max-w-4xl">
		<h2>Client Fee Structure</h2>
		<p>
			At BitTasker, we believe in rewarding loyalty. The more tasks you post, the less you pay in fees. Our dynamic tier system ensures that our most active clients enjoy the best rates.
		</p>

		<div class="card shadow-lg mb-8 bg-success/10 border-l-4 border-success">
			<div class="card-body py-4">
				<div class="flex items-center">
					<i class="fa-solid fa-circle-info text-success text-xl mr-4"></i>
					<div>
						<p class="m-0"><strong>Save money as you use BitTasker!</strong> Our unique tier system rewards active clients with progressively lower fees.</p>
					</div>
				</div>
			</div>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
			<!-- Tier 1 -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<div class="badge badge-primary mb-2">Tier 1</div>
					<h3 class="card-title">Nakamoto Newbie</h3>
					<p class="text-sm">For clients posting 0-3 tasks in the last 30 days</p>
					<div class="flex justify-center my-4">
						<div class="stats shadow">
							<div class="stat">
								<div class="stat-title">Fee Rate</div>
								<div class="stat-value text-primary">12.5%</div>
							</div>
						</div>
					</div>
					<div class="text-sm opacity-80">
						<p>Example: For a $100 task, you'll pay $112.50 total.</p>
					</div>
				</div>
			</div>
			
			<!-- Tier 2 -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<div class="badge badge-primary mb-2">Tier 2</div>
					<h3 class="card-title">Satoshi Stacker</h3>
					<p class="text-sm">For clients posting 4-10 tasks in the last 30 days</p>
					<div class="flex justify-center my-4">
						<div class="stats shadow">
							<div class="stat">
								<div class="stat-title">Fee Rate</div>
								<div class="stat-value text-primary">10%</div>
							</div>
						</div>
					</div>
					<div class="text-sm opacity-80">
						<p>Example: For a $100 task, you'll pay $110 total.</p>
					</div>
				</div>
			</div>
			
			<!-- Tier 3 -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<div class="badge badge-primary mb-2">Tier 3</div>
					<h3 class="card-title">Hash Master</h3>
					<p class="text-sm">For our most active clients with 11+ tasks in the last 30 days</p>

					<div class="flex justify-center my-4">
						<div class="stats shadow">
							<div class="stat">
								<div class="stat-title">Fee Rate</div>
								<div class="stat-value text-primary">7.5%</div>
							</div>
						</div>
					</div>
					<div class="text-sm opacity-80">
						<p>Example: For a $100 task, you'll pay $107.50 total.</p>
					</div>
				</div>
			</div>
		</div>

		<h2>Bitcoin Payments: Lower Fees, Same Great Service</h2>
		<p>
			Save even more when you pay with Bitcoin! We offer reduced rates for clients who choose to use Bitcoin.
		</p>

		<div class="overflow-x-auto my-6">
			<table class="table table-zebra">
				<thead>
					<tr>
						<th>Client Tier</th>
						<th>Bitcoin Fee Rate</th>
						<th>Savings vs. Standard</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>Nakamoto Newbie</td>
						<td>2.5%</td>
						<td>10% lower!</td>
					</tr>
					<tr>
						<td>Satoshi Stacker</td>
						<td>2%</td>
						<td>8% lower!</td>
					</tr>
					<tr>
						<td>Hash Master</td>
						<td>1.5%</td>
						<td>6% lower!</td>
					</tr>
				</tbody>
			</table>
		</div>
		
		<div class="card shadow-lg my-8 bg-info/10 border-l-4 border-info">
			<div class="card-body py-4">
				<div class="flex items-center">
					<i class="fa-solid fa-bitcoin-sign text-info text-xl mr-4"></i>
					<div>
						<p class="m-0"><strong>Bitcoin Example:</strong> As a <strong class="text-primary">Hash Master</strong> tier client, a $100 task paid with Bitcoin would cost just $101.50 total!</p>
					</div>
				</div>
			</div>
		</div>

		<h2>Rebooking Discount</h2>
		<p>
			Love working with a particular professional? We reward repeat partnerships with significantly reduced fees!
		</p>
		
		<div class="card bg-base-100 shadow-lg my-6 border border-success">
			<div class="card-body">
				<h3 class="card-title">Rebook & Save!</h3>
				<p>When you rebook a professional you've worked with before:</p>
				<ul>
					<li>Standard payments: Just <strong>3% fee</strong> (down from 7.5-12.5%)</li>
					<li>Bitcoin payments: Just <strong>1% fee</strong> (down from 1.5-2.5%)</li>
				</ul>
				<p class="text-sm mt-3 opacity-80">
					Example: Rebooking a $100 task costs just $103 with standard payment or $101 with Bitcoin!
				</p>
				<p class="text-sm mt-3 opacity-80">
					Booking repeat work with a professional counts towards your 30 day rolling tasks to maintain your tier.
				</p>
			</div>
		</div>

		<h2>Client Benefits & Visibility</h2>
		<p>
			Higher tier clients enjoy additional benefits beyond reduced fees:
		</p>
		<ul>
			<li><strong>Badge Recognition:</strong> Earn prestigious tier badges displayed on your profile</li>
			<li><strong>Priority Attention:</strong> Higher tier clients may receive more proposals from top professionals</li>
			<li><strong>Enhanced Profile:</strong> Your tier status signals to professionals that you're an active and trusted client</li>
		</ul>

		<div class="divider my-8"></div>

		<div class="flex flex-col items-center my-6">
			<h3>Ready to hire professionals with transparent pricing?</h3>
			<a href="/post-task" class="btn btn-primary mt-4">Post a Task Now</a>
		</div>
	</div>
</div>