import IconCheckCircle from '~icons/mdi/check-circle';
import IconClockOutline from '~icons/mdi/clock-outline';
import IconCloseCircle from '~icons/mdi/close-circle';

// Historical contract addresses for all networks
export const ESCROW_CONTRACT_ADDRESSES = {
	mainnet: [
		'0x674A253Efe9B740193b34e69694B67971E4335bf',
		'0x05b08C866f10f922f647e3Ef05BBdacfdb72Ce89',
		'0x10169472537Cc354D9E24Aebe221aF15827e6378' // v2 SecurePaymentsContract
	],
	testnet: [
		'0xf87e93E73431Aad778592C78E2F86Ef671461c32',
		'0x0E66475957148B55FBef3259b0880a23a5502De6' // v2 SecurePaymentsContract
	]
};

export const statusUI = {
	confirmed: {
		label: 'wallet.transaction.status.confirmed',
		icon: IconCheckCircle,
		color: 'text-success'
	},
	pending: {
		label: 'wallet.transaction.status.pending',
		icon: IconClockOutline,
		color: 'text-warning'
	},
	failed: {
		label: 'wallet.transaction.status.failed',
		icon: IconCloseCircle,
		color: 'text-error'
	}
};
