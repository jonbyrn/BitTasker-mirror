import type { PaymentContractLifecycle } from './types';
import { v1Lifecycle } from './v1';
import { v2Lifecycle } from './v2';

export type {
	ContractLifecycleResult,
	PaymentContractLifecycle,
	PaymentContractRuneLike
} from './types';
export { permissionsNowSeconds, PERMISSIONS_TIME_OFFSET_SEC } from './time';

export function getPaymentContractLifecycle(version: string): PaymentContractLifecycle {
	if (version === 'v2') return v2Lifecycle;
	return v1Lifecycle;
}
