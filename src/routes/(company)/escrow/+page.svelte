<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { darkMode } from '$lib/stores/theme.store';
	import { t } from '$lib/stores/i18n.store';

	let { data } = $props();
	const seo = data.seo;
</script>

<svelte:head>
	<title>{seo.title}</title>
	<meta name="description" content={seo.description} />
	<meta name="keywords" content={seo.keywords} />
	<meta name="author" content="BitTasker" />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href={seo.canonical} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content={seo.canonical} />
	<meta property="og:title" content={seo.ogTitle} />
	<meta property="og:description" content={seo.ogDescription} />

	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Bitcoin Escrow Service - Secure Task Payments" />
	<meta property="og:site_name" content="BitTasker" />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={seo.canonical} />
	<meta property="twitter:title" content={seo.twitterTitle} />
	<meta property="twitter:description" content={seo.twitterDescription} />

	<meta property="twitter:image:alt" content="BitTasker Logo" />
	<meta property="twitter:site" content="@BitTaskerdotcom" />
	<meta property="twitter:creator" content="@BitTaskerdotcom" />

	<!-- Structured Data -->
	{@html `<script type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>`}
</svelte:head>

<div class="w-full">
	<section class="hero bg-base-100 text-base-content min-h-[60vh] pb-12">
			<div class="hero-content flex-col text-center">
				<Logo />
				<div class="text-center">
					<h1 class="text-4xl font-bold">Bitcoin-Powered Escrow</h1>
					<p class="text-base-content/80 mx-auto mt-4 max-w-3xl text-lg">
						Our Bitcoin escrow system protects both taskers and taskees throughout the entire task
						process.
					</p>
				</div>
			</div>
	</section>

	<div class="mt-12 px-8 pb-12">
		<!-- Simplified Section -->
		<div class="prose lg:prose-lg mx-auto max-w-4xl">
			<h2 class="text-center">Peace of Mind Payments: A Simple Guide to Escrow</h2>
			<p>
				Think of our escrow as a <strong class="text-primary"
					>smart, digital safe deposit box</strong
				>
				that holds the payment for a task until everyone agrees the job is done. It's designed to be
				fair, automatic, and secure, all powered by Bitcoin technology.
			</p>

			<h3>Step 1: Funding the Task</h3>
			<p>
				When a Tasker hires a Taskee, they place the payment into the shared digital lockbox
				(escrow). From this moment on, the funds are safe and can only be moved when specific
				conditions are met. Neither the Tasker nor the Taskee can access the funds alone, but can
				access them at any point, provided they both agree on the outcome.
			</p>
			<p>
				The escrow period is set to 14 days after the estimated task completion date, with the
				option to extend it if needed. At this point, if the Taskee has not marked the task as
				complete, the funds are automatically returned to the Tasker.
			</p>
			<p>
				This escrow process is achieved through the use of a 2-of-2 multisig wallet, which requires
				both the Tasker and the Taskee to agree on the outcome of the task. As these agreements are
				made directly between the Tasker and Taskee, BitTasker is unable to intervene in the
				process, creating a true peer-to-peer escrow process.
			</p>

			<h3>Step 2: Completing the Task & Getting Paid</h3>
			<p>
				Once the Taskee finishes the work, they mark the task as complete. The Tasker then reviews
				the work.
			</p>
			<ul>
				<li>
					<strong>If the Tasker is happy</strong>, they approve the payment, and the funds are
					instantly released from the escrow to the Taskee.
				</li>
				<li>
					<strong>Safety Net:</strong> If the Tasker doesn't take any action within 7 days, the system
					automatically releases the funds to the Taskee. This protects Taskees from unresponsive, or
					forgetful Taskers.
				</li>
			</ul>

			<h3>What If Something Goes Wrong?</h3>
			<p>Our system has built-in rules to handle common issues automatically and fairly.</p>
			<ul>
				<li>
					<strong>Cancellations:</strong> If the task is cancelled by either the Tasker or the Taskee
					for a valid reason, the money is returned to the Tasker. It's that simple.
				</li>
				<li>
					<strong>Changing the Job (Rescoping):</strong> If the job changes, the Taskee can initiate
					a "rescope." A small portion (10%) is released to the Taskee for their time, and the rest is
					returned to the Tasker to fund a new, updated task.
				</li>
				<li>
					<strong>Disputes:</strong> If the Tasker isn't satisfied, they can raise a dispute. The funds
					stay locked while both parties discuss a fair solution, like a partial refund. If they can't
					agree, the system follows a clear, time-based process that ultimately returns the funds to
					the Tasker. Depending on the dispute avenue and outcome, this takes place either 14 days, or
					30 days after the dispute is raised.
				</li>
			</ul>
		</div>

		<div class="divider mx-auto my-12 max-w-4xl"></div>

		<!-- Technical Section -->
		<div class="prose lg:prose-lg mx-auto max-w-4xl">
			<h2 class="text-center">Under the Hood: A Technical Look at Our Bitcoin Escrow</h2>
			<p>
				Our escrow system is built on the <strong class="text-primary">Liquid Network</strong>, a
				Bitcoin sidechain that enables fast, confidential transactions. We leverage
				<strong class="text-primary">2-of-2 multisignature wallets</strong>, cryptographic
				<strong class="text-primary">timelocks</strong>, and
				<strong class="text-primary">pre-signed transactions</strong> to create a fully automated, non-custodial,
				and trustless process.
			</p>

			<h3>The Core Mechanism: 2-of-2 Multisig & Pre-Signed Transactions</h3>
			<p>
				Every escrow wallet requires two signatures to authorize a transaction, ensuring no single
				party can control the funds. At each stage, the system generates pre-signed transactions for
				every possible outcome (e.g., payment, refund). These transactions are held off-chain and
				only become valid when a corresponding timelock expires, or the other party provides the
				second signature.
			</p>

			<h3>The Escrow Lifecycle</h3>
			<ol>
				<li>
					<strong>Initial Setup:</strong> A Tasker funds a 2-of-2 multisig wallet. A pre-signed refund
					transaction is created with a 14-day timelock. If the Taskee is unresponsive, this ensures
					an automatic refund to the Tasker. The Taskee can also, at any time, agree to refund the Tasker
					(if either the Tasker or Taskee needs to cancel, for example).
				</li>
				<li>
					<strong>Cancellation:</strong> If either party cancels, the platform facilitates the signing
					of a refund transaction, and the Tasker receives a full refund (platform fees are also refunded).
				</li>
				<li>
					<strong>Task Completion:</strong> When the Taskee marks the task as done, funds move to a 2-of-2
					“done wallet.” This new wallet has a 7-day timelock for automatic payment to the Taskee. The
					Tasker can co-sign the payment transaction at any time within this 7-day window and pay the
					Taskee immediately, or initiate a dispute.
				</li>
				<li>
					<strong>Dispute Process:</strong>
					<ul>
						<li>
							If a dispute is opened, funds move to a “dispute wallet” with a 14-day timelock set to
							refund the Tasker. This is the default outcome if no agreement is reached.
						</li>
						<li>
							Either party can propose a split by creating and single-signing a new transaction. If
							the other party agrees and signs, the new outcome is executed immediately.
						</li>
						<li>
							If the first proposal is rejected, funds move to a final dispute wallet with a 30-day
							timelock favoring the Tasker. This serves as the final, unchangeable fallback to
							ensure resolution.
						</li>
					</ul>
				</li>
			</ol>

			<p>
				This system favors the Tasker as the Tasker ultimately has more to lose. However, it also
				forces the Tasker to wait to get refunded, incentivizing the Tasker to choose a fair outcome
				to avoid waiting the full escrow period.
			</p>

			<h3>Platform Fees</h3>
			<p>
				Platform fees are charged upon successful completion of a task (when the Tasker accepts or
				the 7-day timelock expires) and during dispute resolutions. Fees are fully refunded in the
				case of a valid cancellation.
			</p>
		</div>
	</div>
</div>
