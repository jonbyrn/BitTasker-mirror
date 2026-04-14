/** RSK ~30s blocks — bias `now` forward for permission predicates without RPC block time. */
export const PERMISSIONS_TIME_OFFSET_SEC = 30;

export function permissionsNowSeconds(): number {
	return Math.floor(Date.now() / 1000) - PERMISSIONS_TIME_OFFSET_SEC;
}
