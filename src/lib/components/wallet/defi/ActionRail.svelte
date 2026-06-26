<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { BorrowAction } from '$lib/types/defi';

	interface Props {
		activeAction: BorrowAction;
		hasPosition: boolean;
		hasDebt: boolean;
		hasCollateral: boolean;
		availableBorrowsUsd: number;
		onActionChange: (action: BorrowAction) => void;
		onSwitchAction?: (action: string) => void;
	}

	let {
		activeAction,
		hasPosition,
		hasDebt,
		hasCollateral,
		availableBorrowsUsd,
		onActionChange,
		onSwitchAction: _onSwitchAction
	}: Props = $props();

	let dropdownOpen = $state(false);

	const isManageAction = $derived(
		activeAction === 'repay' ||
			activeAction === 'addCollateral' ||
			activeAction === 'withdraw' ||
			activeAction === 'close'
	);

	const manageLabel = $derived.by(() => {
		switch (activeAction) {
			case 'repay':
				return $t('wallet.defi.borrow.button_repay');
			case 'addCollateral':
				return $t('wallet.defi.borrow.button_add_collateral');
			case 'withdraw':
				return $t('wallet.defi.borrow.button_withdraw');
			case 'close':
				return $t('wallet.defi.position.close_position');
			default:
				return $t('wallet.defi.select_action');
		}
	});

	function handleSupply() {
		onActionChange('supply');
		dropdownOpen = false;
	}

	function handleBorrow() {
		if (availableBorrowsUsd <= 0) return;
		onActionChange('borrow');
		dropdownOpen = false;
	}

	function handleManageAction(action: BorrowAction, e?: MouseEvent) {
		e?.preventDefault();
		onActionChange(action);
		dropdownOpen = false;
	}

	function toggleDropdown() {
		dropdownOpen = !dropdownOpen;
	}

	function closeDropdown() {
		dropdownOpen = false;
	}
</script>

<div class="flex items-center gap-2">
	<!-- Supply Button -->
	<button
		type="button"
		class={['btn btn-outline btn-sm', activeAction === 'supply' && 'btn-active']}
		onclick={handleSupply}
	>
		{$t('wallet.defi.wizard.supply_collateral')}
	</button>

	<!-- Borrow Button -->
	<button
		type="button"
		class={['btn btn-outline btn-sm', activeAction === 'borrow' && 'btn-active']}
		disabled={availableBorrowsUsd <= 0}
		onclick={handleBorrow}
	>
		{$t('wallet.defi.wizard.borrow_usdt0')}
	</button>

	<!-- Manage Dropdown -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div class="dropdown dropdown-top" class:dropdown-open={dropdownOpen}>
		<button
			type="button"
			class={['btn btn-outline btn-sm', isManageAction && 'btn-active']}
			tabindex="0"
			onclick={toggleDropdown}
			onblur={() => {
				// Delay close so click on menu item can register
				setTimeout(closeDropdown, 150);
			}}
		>
			{manageLabel} ▾
		</button>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<ul class="dropdown-content menu bg-base-100 rounded-box z-10 w-52 p-2 shadow-sm" tabindex="0">
			<li>
				<button
					type="button"
					disabled={!hasDebt}
					class={!hasDebt ? 'pointer-events-none opacity-50' : ''}
					onmousedown={(e) => handleManageAction('repay', e)}
				>
					{$t('wallet.defi.borrow.button_repay')}
				</button>
			</li>
			<li>
				<button
					type="button"
					disabled={!hasPosition}
					class={!hasPosition ? 'pointer-events-none opacity-50' : ''}
					onmousedown={(e) => handleManageAction('addCollateral', e)}
				>
					{$t('wallet.defi.borrow.button_add_collateral')}
				</button>
			</li>
			<li>
				<button
					type="button"
					disabled={!hasCollateral}
					class={!hasCollateral ? 'pointer-events-none opacity-50' : ''}
					onmousedown={(e) => handleManageAction('withdraw', e)}
				>
					{$t('wallet.defi.borrow.button_withdraw')}
				</button>
			</li>
			<li>
				<button
					type="button"
					disabled={hasDebt}
					class={[hasDebt ? 'pointer-events-none opacity-50' : '', 'text-error']}
					onmousedown={(e) => handleManageAction('close', e)}
				>
					{$t('wallet.defi.position.close_position')}
				</button>
			</li>
		</ul>
	</div>
</div>
