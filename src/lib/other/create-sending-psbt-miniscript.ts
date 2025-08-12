import { Psbt } from "liquidjs-lib/src/psbt";
import * as liquidjs from "liquidjs-lib";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
bitcoin.initEccLib(ecc);
import type { UTXO } from "./types";
import { compilePolicy } from "@bitcoinerlab/miniscript";
import * as descriptors from "@bitcoinerlab/descriptors";
import * as secp256k1 from "@bitcoinerlab/secp256k1";

const { networks, payments } = liquidjs;

const TO_ADDRESS = "tex1q5g2sct6qcm4l5jwkxm3ydz3vw7vnv37f2nqx7d";
const WALLET_ADDRESS =
  "tex1qkg4ujm9sy4s7qsva5n36pdlmqqa5t5zelyh8epwk58p92nv7a0cs53uvlk";
const AMOUNT = 1000;
const FEE = 500;
const CSV_VALUE = 5; // blocks
const PRIVILEGED_PUB_KEY =
  "036ad1dc803a626c7e55aa9db5b2c1eb97a716e7269a124f8e3cc2f81e1003068b";
const OTHER_PUB_KEY =
  "034c38375a288f005b655d18ee5aecc13b30fd168cf4be5959ec99a6e2bc4daf15";
const NETWORK = networks.testnet; // Liquid testnet
const ASSET_ID = NETWORK.assetHash; // using L-BTC

const getWalletUTXOs = async (
  address: string,
  assetId: string
): Promise<UTXO[]> => {
  const isTestnet = address.startsWith("tex1"); // check if the address is a testnet address
  const baseUrl = isTestnet
    ? "https://blockstream.info/liquidtestnet/api"
    : "https://blockstream.info/liquid/api";

  const response = await fetch(`${baseUrl}/address/${address}/utxo`);

  if (!response.ok) {
    throw new Error(`Failed to fetch UTXOs: ${response.status}`);
  }

  const utxos: UTXO[] = await response.json();

  return utxos
    .filter((utxo) => utxo.status.confirmed) // filter out unconfirmed utxos
    .filter((utxo) => utxo.asset === assetId) // Filter by asset ID
    .map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      asset: utxo.asset,
      status: utxo.status,
    }));
};

const fetchOutputData = async (
  txid: string,
  vout: number
): Promise<{ script: Buffer; value: Buffer; asset: Buffer; nonce: Buffer }> => {
  const baseUrl = "https://blockstream.info/liquidtestnet/api";
  const resp = await fetch(`${baseUrl}/tx/${txid}/hex`);
  if (!resp.ok) {
    throw new Error(`Failed to fetch raw tx hex ${txid}`);
  }
  const hex = await resp.text();
  const tx = liquidjs.Transaction.fromHex(hex);
  const out = tx.outs[vout];
  return {
    script: out.script,
    value: out.value,
    asset: out.asset,
    nonce: out.nonce,
  };
};

const createSendingPsbt = async () => {
  try {
    const assetUtxos = await getWalletUTXOs(WALLET_ADDRESS, ASSET_ID);
    const psbt = new Psbt({ network: NETWORK });

    // Build vault witness script: and(pk(priv), or(pk(other), older(CSV)))
    const policyExpression = `and(pk(A),or(pk(B),older(${CSV_VALUE})))`;
    const compiled = compilePolicy(policyExpression);
    let miniscript = compiled.miniscript;
    miniscript = miniscript.replace(/A/g, PRIVILEGED_PUB_KEY);
    miniscript = miniscript.replace(/B/g, OTHER_PUB_KEY);

    const descriptor = `wsh(${miniscript})`;

    const { Output, expand } = descriptors.DescriptorsFactory(secp256k1);

    // Create output for address generation and validation
    const output = new Output({ descriptor, network: NETWORK });
    console.log(output);
    // Get detailed information about the script using descriptors
    const expanded = expand({ descriptor, network: NETWORK });

    // Use the miniscript-generated witness script
    const witnessScript = expanded.witnessScript || Buffer.alloc(0);
    console.log(
      "Miniscript witness script hex:",
      witnessScript.toString("hex")
    );
    console.log(
      "Miniscript ASM:",
      compiled.asm
        .replace(/<A>/g, PRIVILEGED_PUB_KEY)
        .replace(/<B>/g, OTHER_PUB_KEY)
    );

    const p2wsh = payments.p2wsh({
      redeem: { output: witnessScript },
      network: NETWORK,
    });

    let assetInputTotal = 0;
    for (const utxo of assetUtxos) {
      const outData = await fetchOutputData(utxo.txid, utxo.vout);

      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: outData.script,
          value: outData.value,
          asset: outData.asset,
          nonce: outData.nonce,
        },
        witnessScript: witnessScript,
        sequence: CSV_VALUE,
      });
      assetInputTotal += utxo.value;

      // Stop when we have enough for the amount (plus some buffer for change)
      if (assetInputTotal >= AMOUNT + 1000) break;
    }

    const feeInputTotal = assetInputTotal; // As the asset and the fee asset are the same

    const recipientValueBuffer = Buffer.alloc(9);
    recipientValueBuffer.writeUInt8(0x01, 0); // Unconfidential prefix
    recipientValueBuffer.writeBigUInt64BE(BigInt(AMOUNT), 1);

    const recipientAssetBuffer = Buffer.concat([
      Buffer.from([0x01]), // Unconfidential prefix
      Buffer.from(ASSET_ID, "hex").reverse(), // Reverse for proper Liquid format
    ]);

    // Generate script for recipient address
    const recipientScript =
      payments.p2wpkh({
        address: TO_ADDRESS,
        network: NETWORK,
      }).output ||
      payments.p2wsh({
        address: TO_ADDRESS,
        network: NETWORK,
      }).output;

    psbt.addOutput({
      script: recipientScript!,
      value: recipientValueBuffer,
      asset: recipientAssetBuffer,
      nonce: Buffer.from([0x00]),
    });

    // Calculate and add change outputs
    const dustThreshold = 546;
    let totalOutputValue = AMOUNT;
    const totalChange = assetInputTotal - AMOUNT - FEE;
    if (totalChange >= dustThreshold) {
      const changeValueBuffer = Buffer.alloc(9);
      changeValueBuffer.writeUInt8(0x01, 0); // Unconfidential prefix
      changeValueBuffer.writeBigUInt64BE(BigInt(totalChange), 1);

      psbt.addOutput({
        script: p2wsh.output!,
        value: changeValueBuffer,
        asset: recipientAssetBuffer, // L-BTC
        nonce: Buffer.from([0x00]),
      });
      totalOutputValue += totalChange;
    }

    // Add explicit fee output in L-BTC
    const feeValueBuffer = Buffer.alloc(9);
    feeValueBuffer.writeUInt8(0x01, 0);
    feeValueBuffer.writeBigUInt64BE(BigInt(FEE), 1);

    const lbtcAssetId = ASSET_ID; // as we are only using L-btc as our asset
    const feeAssetBuffer = Buffer.concat([
      Buffer.from([0x01]),
      Buffer.from(lbtcAssetId, "hex").reverse(),
    ]);

    psbt.addOutput({
      script: Buffer.alloc(0),
      value: feeValueBuffer,
      asset: feeAssetBuffer,
      nonce: Buffer.from([0x00]),
    });

    totalOutputValue += FEE; // As client will be paying the fee

    const totalInputValue = assetInputTotal + feeInputTotal; // Total amount that the client pays
    console.log(
      "Paying: ",
      AMOUNT,
      " Fees: ",
      FEE,
      " Change: ",
      totalInputValue
    );

    console.log(psbt.toBase64());

    // console.log(psbt.toHex());

    return {
      psbt: psbt.toBase64(),
      inputTotal: totalInputValue,
      outputTotal: totalOutputValue,
      fee: FEE,
      change: assetInputTotal - AMOUNT - FEE,
      requiredSignatures: 2,
    };
  } catch (error) {
    throw new Error(
      `Transaction creation failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};

createSendingPsbt().then(() => {});
