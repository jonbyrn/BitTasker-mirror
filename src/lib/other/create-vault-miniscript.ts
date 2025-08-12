import * as bitcoin from "bitcoinjs-lib";
import * as liquidjs from "liquidjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";
import { compilePolicy } from "@bitcoinerlab/miniscript";
import * as descriptors from "@bitcoinerlab/descriptors";
import * as secp256k1 from "@bitcoinerlab/secp256k1";

const ECPair = ECPairFactory(ecc);
bitcoin.initEccLib(ecc);

// CONFIGURATION - EDIT THESE VALUES
const PRIVILEGED_PUBLIC_KEY =
  "036ad1dc803a626c7e55aa9db5b2c1eb97a716e7269a124f8e3cc2f81e1003068b";
const OTHER_PUBLIC_KEY =
  "034c38375a288f005b655d18ee5aecc13b30fd168cf4be5959ec99a6e2bc4daf15";
const CSV_VALUE = 5; // blocks (5 min)
const NETWORK = "testnet"; // or 'testnet'

function createVault() {
  const network =
    (NETWORK as string) === "liquid"
      ? liquidjs.networks.liquid
      : liquidjs.networks.testnet;

  // Build witness script using miniscript policy: and(pk(@privilegedKey),or(pk(@otherKey),older(csvValue)))
  // Use short identifiers for the policy, then replace them in the generated miniscript
  const policyExpression = `and(pk(A),or(pk(B),older(${CSV_VALUE})))`;
  console.log("Policy expression:", policyExpression);

  const compiled = compilePolicy(policyExpression);
  console.log("Compiled policy result:", compiled);

  // Create descriptor with the compiled miniscript and actual keys
  const { Output } = descriptors.DescriptorsFactory(secp256k1);

  // Replace key identifiers in miniscript with actual keys
  let miniscript = compiled.miniscript;
  miniscript = miniscript.replace(/A/g, PRIVILEGED_PUBLIC_KEY);
  miniscript = miniscript.replace(/B/g, OTHER_PUBLIC_KEY);

  const descriptor = `wsh(${miniscript})`;
  console.log("Descriptor:", descriptor);

  // Create output using descriptors library with liquid network
  const output = new Output({ descriptor, network });

  const address = output.getAddress();
  const scriptPubKey = output.getScriptPubKey();

  console.log(`\n=== LIQUID VAULT CREATED ===`);
  console.log("Network:", NETWORK);
  console.log("Address:", address);
  console.log("ScriptPubKey:", scriptPubKey.toString("hex"));
  console.log("Miniscript:", miniscript);

  console.log("\nVault Spending Conditions:");
  console.log("- Normal spending: Both privileged key AND other key must sign");
  console.log(
    `- Emergency spending: Privileged key alone after ${CSV_VALUE} blocks (~${
      CSV_VALUE * 1
    } minutes)`
  );
}

createVault();
