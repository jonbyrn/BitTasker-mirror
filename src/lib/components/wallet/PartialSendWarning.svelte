<script lang="ts">
	import { t } from 'svelte-i18n';

	let { onsend, pending = false }: { onsend: () => void; pending?: boolean } = $props();
</script>

<div class="alert alert-warning flex-wrap text-sm" role="status" data-testid="partial-send-warn">
	<p>{$t('wallet.send_partial_warn')}</p>
	<button
		type="button"
		class="btn btn-warning btn-sm min-h-12"
		data-testid="send-anyway"
		disabled={pending}
		onclick={onsend}
	>
		{$t('wallet.send_anyway')}
	</button>
</div>
