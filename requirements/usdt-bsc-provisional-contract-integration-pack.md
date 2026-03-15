# USDT-BSC Provisional Contract Integration Pack

## Artifact Metadata
- Source contract path: `SecurePaymentContract.sol`
- Source revision reference: local workspace snapshot on 2026-03-13 UTC
- Artifact status: provisional
- Primary approver: pending
- Secondary approver: pending

## Expected Function Map
| App capability | Expected function | Source status | Classification |
|---|---|---|---|
| create escrow | `createPaymentContract(...)` | present | `needs-adapter` |
| read escrow summary | `getPaymentContract(...)` | present | `needs-adapter` |
| read escrow state | `getPaymentContractState(...)` | present | `needs-adapter` |
| read lifecycle timestamps | `getEstimatedStartTime(...)`, `getEstimatedCompletionTime(...)`, `getTimelockEnd(...)` | present | `compatible` |
| accept completed work | `acceptTask(...)` | present | `needs-adapter` |
| release after timeout | `resolveAfterTimelock(...)` | present | `needs-adapter` |
| dispute | `disputeTask(...)` | present | `needs-adapter` |
| cancel | `cancelPaymentContract(...)` | present | `needs-adapter` |
| no-show handling | `markNoShow(...)`, `claimNoShowRefund(...)`, `markWorkInProgress(...)` | present | `needs-adapter` |
| ERC-20 USDT funding | token-aware `approve`/`transferFrom` or equivalent | missing | `blocked-until-deploy` |

## Expected Event Map
| App need | Expected event | Source status | Classification |
|---|---|---|---|
| creation | `PaymentContractCreated(uint32)` | present | `needs-adapter` |
| lifecycle transitions | `StateTransition(uint32,uint8,uint8,uint32)` | present | `needs-adapter` |
| deposit release | `UpfrontDepositClaimed(uint32,address)` | present | `compatible` |
| token funding / allowance lifecycle | token-specific funding events | missing | `blocked-until-deploy` |

## Expected Read-Model Fields
| Field | Source mapping | Classification |
|---|---|---|
| contract reference | local `paymentContractId` | `needs-adapter` |
| tasker | `SecurePayment.tasker` | `compatible` |
| taskee | `SecurePayment.taskee` | `compatible` |
| amount | `SecurePayment.amount` | `needs-adapter` |
| status | packed `stateAndFlagsAndDispute` | `needs-adapter` |
| created timestamp | `createdAt` | `compatible` |
| estimated start / completion | getter-backed timestamps | `compatible` |
| timelock end | getter-backed timestamp | `compatible` |
| payment asset / network | not stored in contract | `needs-adapter` |
| token address / decimals | missing | `blocked-until-deploy` |

## Expected Role And Permission Model
- Tasker and taskee are the primary parties.
- Owner-only powers exist for pause and contract administration.
- Current source assumes direct/native value custody plus optional ERC2771 forwarding.
- Sponsor interaction assumptions remain unverified because the local source does not expose any BSC USDT-specific method surface.

## Mismatch List Versus Current App Assumptions
| Assumption | Source finding | Classification |
|---|---|---|
| BSC escrow can fund with USDT | local source uses native-value `payable` creation and native-value payout helpers | `blocked-until-deploy` |
| contract exposes chain-qualified asset metadata | no asset or chain field exists in contract storage | `needs-adapter` |
| contract emits rich escrow lifecycle events for read-model hydration | only coarse creation / transition events exist | `needs-adapter` |
| contract id format can be used directly as app `contractRef` | app requires `contract:<chain-env>:<external-id>` | `needs-adapter` |
| sponsor path can whitelist final escrow selectors now | deployed ABI and accepted address set are still missing | `blocked-until-deploy` |

## Open Deployment-Time Questions
| Question | Blocker status |
|---|---|
| What deployed ABI and bytecode hash are accepted for BSC escrow? | blocked |
| Does the deployed BSC contract support ERC-20 USDT funding semantics? | blocked |
| Which address set is accepted for testnet and mainnet? | blocked |
| Are event signatures and field ordering stable enough for read-model decoding? | blocked |
| Which contract methods are sponsor-eligible in production policy? | blocked |

## Implementation Guidance
- App-side BSC escrow work must stay contract-agnostic until the deployed artifact bundle exists.
- The current local source is useful for lifecycle vocabulary and permission analysis only.
- Any contract-specific BSC USDT funding, approval, or event decoding work remains release-blocked.
