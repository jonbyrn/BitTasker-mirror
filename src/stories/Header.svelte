<script lang="ts">
	interface Props {
		user?: { name: string } | null;
		onLogin?: () => void;
		onLogout?: () => void;
		onCreateAccount?: () => void;
	}

	let { user = null, onLogin, onLogout, onCreateAccount }: Props = $props();

	function handleLogin() {
		onLogin?.();
	}

	function handleLogout() {
		onLogout?.();
	}

	function handleCreateAccount() {
		onCreateAccount?.();
	}
</script>

<div class="storybook-header">
	<div>
		<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
			<g fill="none" fill-rule="evenodd">
				<path
					d="M10 0h12a10 10 0 0110 10v12A10 10 0 0122 32H10A10 10 0 010 22V10A10 10 0 0110 0z"
					fill="#FFF"
				/>
				<path
					d="M5.3 10.6l10.4 6v11.1l-10.4-6v-11.1zM26.7 10.6v11.1l-10.4 6V16.6l10.4-6zM5.3 32l10.4-6V16.6L5.3 22.6V32z"
					fill="#555AB9"
				/>
				<path d="M26.7 32l-10.4-6V16.6l10.4 6V32z" fill="#91BAF8" />
			</g>
		</svg>
		<h1>Acme</h1>
	</div>
	<div>
		{#if user}
			<span class="welcome">
				Welcome, <b>{user.name}</b>!
			</span>
			<button class="btn btn-sm" onclick={handleLogout}> Log out </button>
		{:else}
			<button class="btn btn-sm" onclick={handleLogin}> Log in </button>
			<button class="btn btn-primary btn-sm" onclick={handleCreateAccount}> Sign up </button>
		{/if}
	</div>
</div>
