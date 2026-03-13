import type { EscrowStatus as V1EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';
import type { EscrowStatus as V2EscrowStatus } from '$lib/utils/escrow/v2/escrow.enum';

/**
 * Shared escrow status type for cross-version models.
 *
 * Use this type in shared domain objects that may represent either a v1 or v2
 * contract. Prefer importing a version-specific enum in behavior-specific code.
 */
export type EscrowStatusValue = V1EscrowStatus | V2EscrowStatus;
