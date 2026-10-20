# Partial RGB send leaves the change on a spent output

Suggested GitHub issue for UTEXO. File against
https://github.com/UTEXO-Protocol/rgb-lightning-node
(the package that publishes `@utexo/rln-wasm`). rgb-lib is the component that
builds the transfer. `@utexo/rgb-sdk-web` only forwards the call.

## Title

Partial fungible send keeps the change allocation on an output Esplora has spent

## Body

### Packages

- `@utexo/rln-wasm` 0.17.0-beta.3 (latest on npm as of 20 Oct 2026; published 14 Oct 2026)
- `@utexo/rgb-sdk-web` 1.0.0-beta.12 (latest published; its `sendBegin` forwards to `wallet.sendBegin`)
- Network: Bitcoin signet, indexer `https://esplora-api.utexo.com`
- Asset: IFA USDT, precision 6 (100 USDT = 100_000_000 base units)

No newer `@utexo/rln-wasm` or `@utexo/rgb-sdk-web` is on npm. The sdk-web `dev` branch pins `@utexo/rln-wasm` 0.15.0-beta.3, which is older than the build that shows this.

### What we call

Blinded invoice, three-step send, the same shape as `@utexo/rgb-sdk-rn` 1.0.0-beta.39 `send` / `onchainSend` when the sender should keep a remainder (`donation: false` in the RN sandbox witness example):

```ts
const psbt = await wallet.onchainSendBegin({
  invoice,          // blinded utxob: invoice
  assetId,
  amount: 30_000_000,
  feeRate: 2,
  minConfirmations: 1
});
const signed = await wallet.signPsbt(psbt);
await wallet.onchainSendEnd({ signedPsbt: signed });
await wallet.syncWallet();
await wallet.refreshWallet();
```

`donation` is omitted. `RlnWasmBinding.sendBegin` uses `params.donation ?? false`. In rgb-lib, `donation: false` means the sender waits for the receiver ACK before broadcast. It does not mean "drop the change". The recipient map is one fungible output for the invoice amount. We do not pick the input, the fee coin, or the change seal. Those are inside `send_begin`.

### Steps

1. Signet RGB wallet. One settled allocation of 100 USDT on a single colorable output of 691 sats. Four other colorable outputs of 1,000 sats each, with no allocation. No pending receive.
2. Blinded invoice for 30 USDT. `onchainSendBegin` → `signPsbt` → `onchainSendEnd` as above. Broadcast. Wait until the send is settled and the input is confirmed spent.
3. Read `getAssetBalance(assetId)`, `listUnspents()`, and Esplora `GET /tx/{input-txid}/outspend/{vout}`.

### What happens

Observed on signet tx `05f39d98daca73e8d62e2f081cae327f773b541e22fb29ef1d4833a0f678f4e2` (block 722244). It spends `06e7b41120a25386076ea2699bb6a425bd0a121caae7a1e311603b2d55519d32:1` (691 sats, `tb1pzjcdr3grqmgeel2m2fnnwujt7zhecnu03ukc4f6fr468295kleasd3dhu2`).

- Fee 309 sats. Outputs: vout 0 is a zero-value OP_RETURN, vout 1 is 382 sats to `tb1p8937v38a6j7yscr36lr4hggnet67w0hegkhwhjdhs78la2xdjq9qx0hn50`.
- vout 1 is back in the sending wallet, colorable, and has no RGB allocation.
- `getAssetBalance` reports 70 USDT spendable, 70 settled, and 70 future.
- `listUnspents` still lists that 70 as a settled fungible allocation on `06e7b411…:1`, with `utxo.exists === true` and `btcAmount` 691.
- Esplora `outspend` for that outpoint is `spent: true`, confirmed, spent by `05f39d98…`.
- The four 1,000-sat colorable outputs are still unallocated. `syncWallet` and `refreshWallet` do not move the 70 onto vout 1 or onto any of those outputs.
- The next send of the 70 fails: the only allocation rgb-lib will spend is an output the chain has already spent.

The bitcoin transaction is the shape rgb-lib builds for a blinded send (one colored input, an OP_RETURN commitment, one wallet output). The missing piece is the RGB change assignment. A wallet-owned bitcoin output was created, and the remainder was not sealed to it or to any other unspent colorable output.

### What we expect

After the send confirms:

- `spendable` / `settled` / `future` are 70_000_000.
- `listUnspents` shows that 70 on an output Esplora still lists as unspent (`exists` agrees with the indexer).
- `listUnspents` does not report a settled allocation on `06e7b411…:1`.
- A later send of the 70 spends that new allocation.

`failTransfers` on the send whose txid spent the coin must not be required, and must not be the only way to notice the spend. Calling it deletes the change consignment, and nothing in the 0.17.0-beta.3 API puts that consignment back (see also the notes in this repo at `docs/UTEXO_CHANGE_ISSUE.md`).

### What is not the cause

- Donation flag. Omitted, so the SDK sends `false`. The RN sandbox sets `donation: true` only for examples that spend the whole balance.
- Fee rate 2, or which UTXO we passed. The call does not select inputs. The library spent the only colored coin.
- Too few sats for a bitcoin change output. The 382-sat output exists, is above dust, and belongs to the sender. Four extra 1,000-sat colorable outputs were already available.
- A missing refresh. Sync and refresh ran. The balance moved from 100 to 70, which means the library recorded the 30 as sent, and it still anchors the 70 to the spent input.

### Workaround in this app

A single-recipient partial still loses the change, and that is the bug to fix in rgb-lib. This wallet now avoids creating that change. On a clean allocation it builds one transfer with two recipients: the payee invoice for the typed amount, and a witness invoice of our own for the remainder (`witnessData.amountSat` 1000). The two amounts add up to the listed allocation, so rgb-lib's change seal is not used. `donation` stays false. The old refusal remains when that split cannot be built, including while a spent allocation is still listed.
