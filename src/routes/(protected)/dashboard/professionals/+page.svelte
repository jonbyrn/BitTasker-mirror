<script>
	import { onMount } from 'svelte';

	let mounted = $state(false);

	onMount(() => {
		mounted = true;
	});
</script>

<svelte:head>
	<title>Professionals - Bittasker</title>
</svelte:head>

<div class="coming-soon-container" class:fade-in={mounted}>
	<div class="content">
		<div class="icon">
			<svg
				width="64"
				height="64"
				viewBox="0 0 24 24"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path
					d="M20.5899 22C20.5899 18.13 16.7399 15 11.9999 15C7.25991 15 3.40991 18.13 3.40991 22"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</div>

		<h1>Find Professionals</h1>

		<p class="description">
			Discover skilled professionals in your area who can help you complete your tasks. This feature
			is coming soon and will include:
		</p>

		<ul class="features">
			<li>Browse verified professionals by category</li>
			<li>View ratings and reviews from previous clients</li>
			<li>Compare skills, availability, and rates</li>
			<li>Direct messaging with professionals</li>
			<li>Portfolio and work samples</li>
		</ul>

		<div class="status">
			<div class="status-badge">
				<span class="dot"></span>
				Under Development
			</div>
		</div>

		<p class="sub-text">
			We're working hard to bring you the best professional discovery experience. Stay tuned for
			updates!
		</p>
	</div>
</div>

<style>
	.coming-soon-container {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		opacity: 0;
		transition: opacity 0.6s ease-in-out;
	}

	.coming-soon-container.fade-in {
		opacity: 1;
	}

	.content {
		text-align: center;
		max-width: 500px;
		width: 100%;
	}

	.icon {
		color: #f59e0b;
		margin-bottom: 1.5rem;
		display: flex;
		justify-content: center;
	}

	h1 {
		font-size: 2.5rem;
		font-weight: 700;
		color: #1f2937;
		margin-bottom: 1rem;
		line-height: 1.2;
	}

	.description {
		font-size: 1.125rem;
		color: #6b7280;
		margin-bottom: 2rem;
		line-height: 1.6;
	}

	.features {
		text-align: left;
		list-style: none;
		padding: 0;
		margin: 0 0 2rem 0;
		color: #4b5563;
	}

	.features li {
		padding: 0.5rem 0;
		position: relative;
		padding-left: 1.5rem;
		line-height: 1.5;
	}

	.features li::before {
		content: '✓';
		position: absolute;
		left: 0;
		color: #10b981;
		font-weight: bold;
	}

	.status {
		margin-bottom: 2rem;
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: #fef3c7;
		color: #92400e;
		padding: 0.5rem 1rem;
		border-radius: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.dot {
		width: 8px;
		height: 8px;
		background: #f59e0b;
		border-radius: 50%;
		animation: pulse 2s infinite;
	}

	.sub-text {
		color: #9ca3af;
		font-size: 0.875rem;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	@media (max-width: 640px) {
		.coming-soon-container {
			padding: 1rem;
		}

		h1 {
			font-size: 2rem;
		}

		.description {
			font-size: 1rem;
		}
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		h1 {
			color: #f9fafb;
		}

		.description {
			color: #d1d5db;
		}

		.features {
			color: #e5e7eb;
		}

		.status-badge {
			background: #451a03;
			color: #fbbf24;
		}

		.sub-text {
			color: #6b7280;
		}
	}
</style>
