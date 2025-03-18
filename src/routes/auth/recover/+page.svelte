<script lang="ts">
	let password = $state('');

	async function handleSubmit(event: Event) {
		event.preventDefault();
	}
</script>

<div class="bg-base-200 flex min-h-screen items-center justify-center px-4">
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h2 class="card-title mb-6 justify-center text-2xl font-bold">Recover password</h2>

			<form onsubmit={handleSubmit} class="space-y-4">
				<div class="form-control space-y-1">
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

				<button type="submit" class="btn btn-primary w-full"> Recover </button>
			</form>
		</div>
	</div>
</div>
