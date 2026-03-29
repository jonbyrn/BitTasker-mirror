<script lang="ts">
	let { pubkey = undefined, username = undefined }: { pubkey?: string; username?: string } =
		$props();
</script>

<div data-testid="quote-card-user">{username ?? ''}|{pubkey ?? 'User info'}</div>
