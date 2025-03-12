<script lang="ts">
	import { getContext } from 'svelte';
	const page = getContext('page');
	let isLogin = $state(true);
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let name = $state('');

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (isLogin) {
			// Handle login
			console.log('Login:', { email, password });
		} else {
			// Handle signup
			console.log('Signup:', { name, email, password });
		}
	}
</script>

<div class="bg-base-200 flex min-h-screen items-center justify-center px-4">
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h2 class="card-title mb-6 justify-center text-2xl font-bold">
				{isLogin ? 'Login' : 'Sign Up'} to Bittasker
			</h2>

			<form onsubmit={handleSubmit} class="space-y-4">
				{#if !isLogin}
					<div class="form-control">
						<label class="label" for="name">
							<span class="label-text">Full Name</span>
						</label>
						<input
							type="text"
							id="name"
							bind:value={name}
							placeholder="Enter your full name"
							class="input input-bordered w-full"
							required
						/>
					</div>
				{/if}

				<div class="form-control">
					<label class="label" for="email">
						<span class="label-text">Email</span>
					</label>
					<input
						type="email"
						id="email"
						bind:value={email}
						placeholder="Enter your email"
						class="input input-bordered w-full"
						required
					/>
				</div>

				<div class="form-control">
					<label class="label" for="password">
						<span class="label-text">Password</span>
					</label>
					<input
						type="password"
						id="password"
						bind:value={password}
						placeholder="Enter your password"
						class="input input-bordered w-full"
						required
					/>
				</div>

				{#if !isLogin}
					<div class="form-control">
						<label class="label" for="confirmPassword">
							<span class="label-text">Confirm Password</span>
						</label>
						<input
							type="password"
							id="confirmPassword"
							bind:value={confirmPassword}
							placeholder="Confirm your password"
							class="input input-bordered w-full"
							required
						/>
					</div>
				{/if}

				<button type="submit" class="btn btn-primary w-full">
					{isLogin ? 'Login' : 'Sign Up'}
				</button>
			</form>

			<div class="divider">OR</div>

			<button class="btn btn-outline w-full">
				<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-5 w-5" viewBox="0 0 48 48">
					<path
						fill="#FFC107"
						d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
					/>
					<path
						fill="#FF3D00"
						d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
					/>
					<path
						fill="#4CAF50"
						d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
					/>
					<path
						fill="#1976D2"
						d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
					/>
				</svg>
				Continue with Google
			</button>

			<div class="mt-4 text-center">
				<button onclick={() => (isLogin = !isLogin)} class="link link-primary">
					{isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
				</button>
			</div>
		</div>
	</div>
</div>
