<script lang="ts">
	import type { Wallet } from '$lib/types/wallet';

	let { wallet, onClose } = $props<{
		wallet: Wallet;
		onClose: () => void;
	}>();

	let walletId = $state(wallet.id);
	let walletNetwork = $state(wallet.network);
	let requiresSignatures = $state(2);
	let showDeleteConfirm = $state(false);

	async function handleSave(event: Event) {
		event.preventDefault();
		try {
			// TODO: Implement API call to save wallet settings
			console.log('Saving wallet settings:', {
				id: walletId,
				network: walletNetwork,
				requiresSignatures
			});
			onClose();
		} catch (error) {
			console.error('Error saving wallet settings:', error);
		}
	}

	async function handleDelete() {
		try {
			// TODO: Implement API call to delete wallet
			console.log('Deleting wallet:', wallet.id);
			onClose();
		} catch (error) {
			console.error('Error deleting wallet:', error);
		}
	}
</script>

<div class="modal modal-open">
	<div class="modal-box">
		<h3 class="mb-6 text-lg font-bold">Wallet Settings</h3>

		<form class="space-y-6" onsubmit={handleSave}>
			<!-- Wallet ID -->
			<div class="form-control">
				<label class="label" for="wallet-id">
					<span class="label-text">Wallet ID</span>
				</label>
				<input
					type="text"
					id="wallet-id"
					class="input input-bordered"
					value={walletId}
					disabled
					readonly
				/>
			</div>

			<!-- Network -->
			<div class="form-control">
				<label class="label" for="wallet-network">
					<span class="label-text">Network</span>
				</label>
				<input
					type="text"
					id="wallet-network"
					class="input input-bordered"
					value={walletNetwork}
					disabled
					readonly
				/>
			</div>

			<!-- Required Signatures -->
			<div class="form-control">
				<label class="label" for="required-signatures">
					<span class="label-text">Required Signatures</span>
				</label>
				<select
					id="required-signatures"
					class="select select-bordered"
					bind:value={requiresSignatures}
				>
					<option value={1}>1 Signature</option>
					<option value={2}>2 Signatures</option>
					<option value={3}>3 Signatures</option>
				</select>
			</div>

			<!-- Backup Options -->
			<div class="form-control">
				<label class="label" for="backup-options">
					<span class="label-text">Backup Options</span>
				</label>
				<button type="button" class="btn btn-outline btn-sm">Export Backup</button>
			</div>

			<!-- Delete Wallet -->
			<div class="form-control">
				<label class="label" for="delete-wallet">
					<span class="label-text text-error">Danger Zone</span>
				</label>
				{#if !showDeleteConfirm}
					<button
						type="button"
						class="btn btn-error btn-outline btn-sm"
						onclick={() => (showDeleteConfirm = true)}
					>
						Delete Wallet
					</button>
				{:else}
					<div class="alert alert-error">
						<p>Are you sure you want to delete this wallet? This action cannot be undone.</p>
						<div class="mt-4 flex justify-end gap-2">
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								onclick={() => (showDeleteConfirm = false)}
							>
								Cancel
							</button>
							<button type="button" class="btn btn-error btn-sm" onclick={handleDelete}>
								Yes, Delete
							</button>
						</div>
					</div>
				{/if}
			</div>

			<div class="modal-action">
				<button type="button" class="btn btn-ghost" onclick={onClose}>Cancel</button>
				<button type="submit" class="btn btn-primary">Save Changes</button>
			</div>
		</form>
	</div>
	<button aria-label="close" class="modal-backdrop" onclick={onClose}></button>
</div>
