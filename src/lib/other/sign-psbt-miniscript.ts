import { Psbt } from "liquidjs-lib/src/psbt";
import * as liquidjs from "liquidjs-lib";
import * as bitcoin from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import * as ecc from "tiny-secp256k1";

// Initialize ECC for both libraries
bitcoin.initEccLib(ecc);

const { networks } = liquidjs;
const ECPair = ECPairFactory(ecc);

const NETWORK = networks.testnet;

// PSBT from miniscript vault - replace with your current PSBT
const PSBT_B64 =
  "cHNldP8BAPACAAAAAAFZpvh5Q0UQjqvqvuuC2V/PJw2bezAoXIzgVJuKaLrYXAEAAAAABQAAAAMBSZqBhUX2uuOfwDtjfypOHmTlkMrBvDpvbXGqRENlTBQBAAAAAAAAA+gAFgAUohUML0DG6/pJ1jbiRoosd5k2R8kBSZqBhUX2uuOfwDtjfypOHmTlkMrBvDpvbXGqRENlTBQBAAAAAAABeugAIgAgsivJbLAlYeBBnaTjoLf7ADtF0Fn5LnyF1qHCVU2e6/EBSZqBhUX2uuOfwDtjfypOHmTlkMrBvDpvbXGqRENlTBQBAAAAAAAAAfQAAAAAAAAAAQFOAUmagYVF9rrjn8A7Y38qTh5k5ZDKwbw6b21xqkRDZUwUAQAAAAAAAYDEACIAILIryWywJWHgQZ2k46C3+wA7RdBZ+S58hdahwlVNnuvxAQVLIQNq0dyAOmJsflWqnbWyweuXpxbnJpoST448wvgeEAMGi60hA0w4N1oojwBbZV0Y7lrswTsw/RaM9L5ZWeyZpuK8Ta8VrHNkVbJoAAAAAA==";

// Privileged private key (must always sign in miniscript vault)
const PRIVILEGED_PRIVATE_KEY =
  "339e2240a2a2c9c5f02ac1862a25dfd943a08ccebde878b7832b5b168cd5690a";

const signPsbt = () => {
  try {
    console.log("=== MINISCRIPT VAULT TIMELOCK SIGNING ===");
    const psbt = Psbt.fromBase64(PSBT_B64, { network: NETWORK });
    const privateKeyBuff = Buffer.from(PRIVILEGED_PRIVATE_KEY, "hex");
    const keyPair = ECPair.fromPrivateKey(privateKeyBuff, {
      network: NETWORK,
      compressed: true,
    });

    console.log("Network:", NETWORK.name);
    console.log("Input count:", psbt.inputCount);
    console.log("Using timelock spending path (privileged key + CSV timeout)");

    // Show witness script from PSBT
    if (psbt.data.inputs[0]?.witnessScript) {
      console.log(
        "Witness script hex:",
        psbt.data.inputs[0].witnessScript.toString("hex")
      );
    }

    // Sign all inputs with the privileged key
    // Adapter so liquidjs-lib gets Buffer versions
    function toBufferSigner(kp: any) {
      const patched = Object.assign({}, kp);
      patched.sign = function (...args: any[]) {
        // Preserve sighashType if provided
        const result = kp.sign.apply(kp, args);
        return Buffer.from(result);
      };
      patched.publicKey = Buffer.from(kp.publicKey);
      return patched as any;
    }

    const signer = toBufferSigner(keyPair);

    for (let i = 0; i < psbt.inputCount; i++) {
      psbt.signInput(i, signer);
    }

    // liquidjs-lib (v4) sometimes stores the signatures as Uint8Array.
    // Convert them to Buffer so subsequent operations don't throw.
    psbt.data.inputs.forEach((inp) => {
      if (inp.partialSig) {
        inp.partialSig = inp.partialSig.map((p) => ({
          pubkey: p.pubkey,
          signature: Buffer.isBuffer(p.signature)
            ? p.signature
            : Buffer.from(p.signature),
        }));
      }
    });

    const signedPsbtBase64 = psbt.toBase64();
    console.log("\n=== SIGNED PSBT (Base64) ===");
    console.log(signedPsbtBase64);

    console.log("\nFinalizing with miniscript timelock path...");

    // Custom finalize for miniscript timelock path
    const witnessScript = psbt.data.inputs[0].witnessScript!;

    psbt.finalizeInput(0, (_idx, input) => {
      const sig = input.partialSig?.[0]?.signature;
      if (!sig) throw new Error("Missing privileged signature");

      console.log("Signature found, length:", sig.length);

      // For miniscript and_v(v:pk(A),or_d(pk(B),older(5))) timelock path:
      // Witness stack: [<empty>, <sig_A>, <witnessScript>]
      // - Empty element indicates we're NOT using pk(B) in or_d
      // - sig_A satisfies the v:pk(A) which is required by and_v
      // - The older(5) condition is satisfied by the CSV sequence number
      const stack = [Buffer.alloc(0), sig, witnessScript];

      console.log("Building witness stack for miniscript timelock path");
      console.log("Stack elements:", stack.length);

      // Simple serializer (CompactSize ints, works while items < 253 bytes)
      const parts: Buffer[] = [Buffer.from([stack.length])];
      stack.forEach((item) => {
        parts.push(Buffer.from([item.length]));
        parts.push(item);
      });
      return {
        finalScriptWitness: Buffer.concat(parts),
        finalScriptSig: undefined,
      };
    });

    const finalizedTx = psbt.extractTransaction();
    console.log("\n=== FINALIZED MINISCRIPT TIMELOCK TRANSACTION ===");
    console.log("Policy: and(pk(A),or(pk(B),older(5)))");
    console.log("Spending path: Privileged key alone after 5 blocks");
    console.log("Transaction ID:", finalizedTx.getId());
    console.log("Transaction Hex:", finalizedTx.toHex());
  } catch (error) {
    throw `Signing failed: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
  }
};

signPsbt();
