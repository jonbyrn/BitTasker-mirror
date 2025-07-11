<script lang="ts">
	import { darkMode } from '$lib/stores/theme.store';
	// Obfuscate email address to make it harder for simple bots to scrape.
	// This is constructed on the client-side.
	const user = 'hello';
	const domain = 'bittasker.com';
	const mailtoHref = `mailto:${user}@${domain}`;
</script>

<div class="container mx-auto p-4 py-8 md:p-12">
	<img
		src={$darkMode
			? '/images/Bittasker-logo-tagline-dark.svg'
			: '/images/Bittasker-logo-tagline-light.svg'}
		alt="BitTasker Logo"
		class="mx-auto mb-8 block w-full max-w-lg"
	/>
	<div class="text-center">
		<h1 class="text-4xl font-bold">Get in Touch</h1>
		<p class="mx-auto mt-4 max-w-2xl text-lg text-base-content/80">
			We'd love to hear from you! Whether you have a question about our platform, feedback, or a
			partnership proposal, please don't hesitate to reach out.
		</p>
	</div>

	<div class="mt-12 flex justify-center">
		<div class="card w-full max-w-md border border-base-300 bg-base-100 shadow-xl">
			<div class="card-body items-center text-center">
				<h2 class="card-title text-2xl">General Inquiries</h2>
				<p>For all general questions, the best way to reach our team is by email.</p>
				<div class="card-actions justify-end">
					<a href={mailtoHref} class="btn btn-primary btn-wide mt-4">
						<i class="fa-solid fa-envelope fa-xl"></i>
						Send Us An Email
					</a>
				</div>
			</div>
		</div>
	</div>
</div>

