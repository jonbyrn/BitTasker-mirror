/**
 * RGB Subsystem — Type Boundary
 *
 * Pure interface definitions for the greenfield native RGB module
 * (see docs/adr/0001-greenfield-rgb-wasm-subsystem.md). No execution logic
 * lives here — this file only declares the shapes that cross the trust
 * boundary between the single-writer WASM command queue and its consumers.
 *
 * Nothing outside `src/lib/services/rgb/` may construct or mutate these
 * types directly; the command queue is the only writer, and everything
 * else consumes the read-only projection types below via Svelte 5 `$derived`.
 */

// ─── Single-use seal state lifecycle ────────────────────────────────────────

/**
 * A single-use seal's lifecycle, mapped 1:1 onto `@utexo/rgb-sdk-web`'s real
 * per-transfer `TransferStatus` (`Initiated` -> `WaitingCounterparty` ->
 * `WaitingConfirmations` -> `Settled`/`Failed`, from `@utexo/rgb-sdk-core`).
 * The SDK's `WaitingSafeHeight` status is folded into `WAITING_CONFIRMATIONS`
 * here — both mean "on-chain but not yet final" from this module's perspective.
 * `SETTLED` is durably recorded before any UI or Nostr relay event observes it
 * (see ADR §"Spend durability ordering").
 */
export type RgbSealState =
	| 'INITIATED'
	| 'WAITING_COUNTERPARTY'
	| 'WAITING_CONFIRMATIONS'
	| 'SETTLED'
	| 'FAILED';

/** Opaque identifier for a single-use seal, scoped to the local stash. */
export type SealId = string & { readonly __brand: 'SealId' };

/** Opaque identifier for an RGB contract/asset schema instance. */
export type ContractId = string & { readonly __brand: 'ContractId' };

/** The Bitcoin UTXO a seal is bound to. */
export interface SealUtxoBinding {
	readonly txid: string;
	readonly vout: number;
}

/**
 * Canonical, durably-persisted record for a single-use seal. `utxo` is
 * optional — the SDK only assigns a receive UTXO once a transfer reaches
 * `WAITING_CONFIRMATIONS`; it is unknown at `INITIATED`/`WAITING_COUNTERPARTY`.
 */
export interface RgbSeal {
	readonly id: SealId;
	readonly contractId: ContractId;
	readonly invoice?: string;
	readonly contractTitle?: string;
	readonly bidderComments?: string;
	readonly state: RgbSealState;
	readonly utxo?: SealUtxoBinding;
	readonly assetId: string;
	readonly amount: number;
	readonly createdAt: number;
	readonly updatedAt: number;
}

// ─── Command queue interface ────────────────────────────────────────────────

/** Result of a command applied to the single-writer command queue. */
export interface RgbCommandResult<T> {
	readonly ok: boolean;
	readonly value?: T;
	readonly error?: string;
}

/**
 * `utxo` is intentionally absent — `@utexo/rgb-sdk-web`'s receive calls
 * (`witnessReceive`/`blindReceive`) derive/select the UTXO internally and
 * accept no caller-chosen one. Presenting a `utxo` field here would be a
 * false guarantee the backend cannot honor.
 */
export interface CommitCommandInput {
	readonly contractId: ContractId;
	readonly contractTitle?: string;
	readonly bidderComments?: string;
	readonly assetId: string;
	readonly amount: number;
}

/**
 * `recipientId` is the SDK's transfer identifier (returned as
 * `InvoiceReceiveData.recipientId` from `commit()`) — passing it back in
 * triggers a fail-closed `refreshWallet()` + status check rather than
 * trusting a caller-supplied claim that the seal was witnessed. `contractId`
 * cannot be derived from the SDK's raw `Transfer` record, so it must be
 * supplied by the caller, which already knows which seal it's tracking.
 */
export interface WitnessCommandInput {
	readonly recipientId: SealId;
	readonly contractId: ContractId;
	readonly assetId: string;
}

/** See `WitnessCommandInput` — same fail-closed refresh-and-check pattern. */
export interface SpendCommandInput {
	readonly recipientId: SealId;
	readonly contractId: ContractId;
	readonly assetId: string;
}

export interface ValidateConsignmentInput {
	readonly consignment: string;
	readonly expectedContractId: ContractId;
}

export interface ValidateConsignmentResult {
	readonly valid: boolean;
	readonly seal?: RgbSeal;
	readonly reason?: string;
}

/**
 * Public async command queue interface. All state transitions are modeled
 * as commands, not setters, and are serialized so two transitions can never
 * interleave (see ADR §"Single-writer WASM command queue"). Every command
 * either fully commits or is rolled back atomically — a rejected command
 * must not poison subsequently queued commands.
 */
export interface RgbCommandQueue {
	commit(input: CommitCommandInput): Promise<RgbCommandResult<RgbSeal>>;
	witness(input: WitnessCommandInput): Promise<RgbCommandResult<RgbSeal>>;
	spend(input: SpendCommandInput): Promise<RgbCommandResult<RgbSeal>>;
	validateConsignment(
		input: ValidateConsignmentInput
	): Promise<RgbCommandResult<ValidateConsignmentResult>>;
}

// ─── Read-only UI projections ───────────────────────────────────────────────

/** Read-only per-asset balance, derived from validated seals only. */
export interface RgbAssetBalanceProjection {
	readonly assetId: string;
	readonly amount: number;
	readonly formattedAmount: string;
}

/** Read-only seal status, safe to render without exposing the stash itself. */
export interface RgbSealProjection {
	readonly id: SealId;
	readonly contractId: ContractId;
	readonly state: RgbSealState;
	readonly assetId: string;
	readonly amount: number;
}

/**
 * Immutable, versioned snapshot emitted by the command queue. UI stores
 * (e.g. `WalletStateExtended`) consume this via `$derived`/`$derived.by` and
 * never write back into it — the RGB module is treated like an external
 * oracle (see ADR §"Read-only Svelte 5 UI projections").
 */
export interface RgbStateProjection {
	readonly version: number;
	readonly balances: readonly RgbAssetBalanceProjection[];
	readonly seals: readonly RgbSealProjection[];
	/** Observable init/availability flag — see ADR §"Init error containment must log, not swallow". */
	readonly status: 'uninitialized' | 'ready' | 'unavailable';
	/** Populated when `status` is `'unavailable'`; the reason the RGB queue failed to init. */
	readonly unavailableReason?: string;
}
