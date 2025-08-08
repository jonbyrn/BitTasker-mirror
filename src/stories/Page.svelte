<script>
	import { createEventDispatcher } from 'svelte';

	let { user } = $props();

	const dispatch = createEventDispatcher();

	function handleLogin() {
		dispatch('login');
	}

	function handleLogout() {
		dispatch('logout');
	}

	function handleCreateAccount() {
		dispatch('createAccount');
	}
</script>

<section class="storybook-page">
	<header>
		<h1>BitTasker</h1>
		<div class="user-info">
			{#if user}
				<span class="welcome">
					Welcome, <b>{user.name}</b>!
				</span>
				<button onclick={handleLogout}>
					Log out
				</button>
			{:else}
				<button onclick={handleLogin}>
					Log in
				</button>
				<button onclick={handleCreateAccount}>
					Sign up
				</button>
			{/if}
		</div>
	</header>

	<article>
		<h2>Pages in BitTasker</h2>
		<p>
			We recommend building UIs with a{' '}
			<strong>
				<a href="https://componentdriven.org" target="_blank" rel="noopener noreferrer">
					<strong>component-driven</strong>
				</a>
			</strong>{' '}
			process starting with atomic components and ending with pages.
		</p>
		<p>
			Render pages with mock data. This makes it easy to build and review page states without
			needing to navigate to them in your app. Here are some handy patterns for managing page
			data in Storybook:
		</p>
		<ul>
			<li>
				Use a higher-level connected component. Storybook helps you compose such data at the
				"page" level of your hierarchy.
			</li>
			<li>
				Assemble data in the page component from your services. You can mock these services out
				using Storybook.
			</li>
		</ul>
		<p>
			Get a guided tutorial on component-driven development at{' '}
			<a href="https://storybook.js.org/tutorials/" target="_blank" rel="noopener noreferrer">
				Storybook tutorials
			</a>
			. Read more in the{' '}
			<a href="https://storybook.js.org/docs" target="_blank" rel="noopener noreferrer">
				docs
			</a>
			.
		</p>
		<div class="tip-wrapper">
			<span class="tip">Tip</span> Adjust the width of the canvas with the{' '}
			<svg width="10" height="10" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
				<g fill="none" fill-rule="evenodd">
					<g fill-rule="nonzero" fill="#000">
						<path d="M10.12 10.419L8.904 11.63a.5.5 0 01-.788-.001l-1.216-1.21a.5.5 0 01.001-.789l1.216-1.21a.5.5 0 01.789.001l1.215 1.21a.5.5 0 01-.001.789zM4.904 11.63L3.69 10.42a.5.5 0 01.001-.789l1.215-1.21a.5.5 0 01.789.001l1.216 1.21a.5.5 0 01-.001.789L4.904 11.63z" />
						<path d="M8.333 7.5c.276 0 .5-.224.5-.5s-.224-.5-.5-.5-.5.224-.5.5.224.5.5.5zM3.667 7.5c.276 0 .5-.224.5-.5s-.224-.5-.5-.5-.5.224-.5.5.224.5.5.5z" />
					</g>
				</g>
			</svg>
			Viewports addon in the toolbar
		</div>
	</article>
</section>
