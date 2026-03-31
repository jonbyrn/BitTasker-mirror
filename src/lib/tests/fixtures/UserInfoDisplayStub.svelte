<script lang="ts">
	const { username = null, pubkey = null } = $props<{
		username?: string | null;
		pubkey?: string | null;
	}>();
</script>

<div data-testid="user-info-display">{username || pubkey || ''}</div>
