# rgb-lib keeps a spent allocation as spendable and cannot restore a failed change

**Repo:** https://github.com/UTEXO-Protocol/rgb-lightning-node
**Packages:** `@utexo/rln-wasm` `0.17.0-beta.3`, `@utexo/rgb-sdk-web` `1.0.0-beta.12` (depends on `@utexo/rgb-lib-wasm` `1.0.0-beta.3`)
**Network:** Bitcoin signet, indexer `https://esplora-api.utexo.com`
**Asset:** IFA USDT, precision 6 (100 USDT = 100_000_000 base units)

## Summary

After a partial USDT send, rgb-lib still reports the old allocation as `balance.spendable` on an output Esplora has already spent. `syncWallet` and `refreshWallet` do not move that allocation onto the change output. `failTransfers` on the send whose txid spent the coin deletes the change consignment, and there is no API to register it again. The wallet then cannot spend the remainder, while `listAssets` / `getAssetBalance` keep returning the full pre-send amount as spendable.

This is in rgb-lib / the wasm binding. The app can only hide the unspendable figure. It cannot put the change back.

## Steps to reproduce

1. Create a signet RGB wallet and receive 100 USDT into one colored output (about 1,000 sats).
2. Send 10 USDT to a blinded invoice with `onchainSendBegin` → `signPsbt` → `onchainSendEnd`, fee rate 2, `minConfirmations: 1`. Broadcast the bitcoin transaction. The recipient receives 10.
3. Wait until Esplora shows the colored input spent. Note the wallet's change output (the leftover sats on the send transaction).
4. Call `listAssets()`, `getAssetBalance(assetId)`, and `listUnspents()`.
5. Call `syncWallet()`, then `refreshWallet()`, and read those three again.
6. Call `failTransfers({ batchTransferIdx, skipSync: true })` on the Send whose `txid` is the transaction that spent the colored output (`spentBy` from Esplora `/tx/{txid}/outspend/{vout}`). Refresh again and read the balance and `listTransfers`.

## What happens

- Before the fail, `spendable` stays at 100_000_000 (or the pre-send total). `listUnspents` still lists that amount on the spent outpoint (`utxo.exists` true, one fungible allocation). Esplora says `spent: true` for that outpoint. `future` does not become the change (90 or 80).
- The change output is a free colorable output with 0 allocations. The Send's `assignments` are the remainder, but the next spend is not given that coin.
- After `failTransfers` on that Send, the change consignment is gone. Refresh does not recreate it. `listTransfers` shows the Send as `Failed`. `spendable` can still report the amount on the spent outpoint.
- There is no method besides `failTransfers`, `refreshWallet`, and `syncWallet` that reattaches an allocation to a wallet-owned change output.

Observed on wallet "Grok Bot Automate 2" (signet), 20 Oct 2026:

- Received 100 USDT, then sent 10 about 14 hours later and 10 about 2 hours later.
- App build `9b72f2f0d` ran `syncWallet`, `refreshWallet`, `listUnspents`, and an Esplora outspend check. The only allocation was on a spent output, so the spendable figure on chain was 0 while rgb-lib still said 100.00.
- A later reload, which reads `listAssets` again, still got 100.00 spendable from rgb-lib. No further send was broadcast.
- Lightning `createLsp` / connect failed with the wasm wallet busy during that refresh ("Lightning could not connect"). That part is the app overlapping the refresh. The balance bug remains after the wallet is idle.

## What we expected

- After the send confirms, `spendable` is the change (90 after one 10 USDT send, 80 after two), on an unspent wallet-owned output.
- `listUnspents` does not list an allocation on an output the indexer has spent.
- If a Send was failed by mistake, some call (`refreshWallet`, or a new reindex / import) can restore the change consignment from the broadcast transaction. Failing a transfer must not destroy coins that the bitcoin transaction already assigned back to the sender.

## Versions

- `@utexo/rln-wasm`: 0.17.0-beta.3 (`rln_wasm_sdk`, repository `UTEXO-Protocol/rgb-lightning-node`)
- `@utexo/rgb-sdk-web`: 1.0.0-beta.12
- `@utexo/rgb-lib-wasm`: 1.0.0-beta.3 (dependency of rgb-sdk-web)
- Indexer: `https://esplora-api.utexo.com`
- App commit that stopped failing the spending send: `af873569aa24c397bc65efd74f77cb0da0b2cc4f`
- Live pages deploy where the allocation was still spendable in rgb-lib after sync and refresh: `9b72f2f0d`

## Logs the app prints

```
[wallet-send] outspend lookup failed          # only when the indexer request itself fails
[wallet-balances] listUnspents failed
[wallet-balances] spent seal cleanup failed
[wallet-lsp] get_info failed                  # wasm busy / borrow while refresh runs
```

On this wallet the outspend lookup succeeded: Esplora reported the output spent, and rgb-lib's spendable field stayed 100_000_000. No app log line changes that field. `failTransfers` is the call that drops the change, and rgb-lib does not undo it.
