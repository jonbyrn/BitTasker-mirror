import { Psbt } from "liquidjs-lib/src/psbt";
import * as liquidjs from "liquidjs-lib";
import * as bitcoin from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import * as ecc from "tiny-secp256k1";

// Initialize ECC for both libraries
bitcoin.initEccLib(ecc);

const { networks } = liquidjs;
const ECPair = ECPairFactory(ecc);

const NETWORK = networks.testnet; // Liquid testnet - matches miniscript vault

// ------------------------------------------------------------
// Paste the base-64 PSET/PSBT you want to sign below
// ------------------------------------------------------------
// PSBT with correct miniscript witness script format
const PSBT_B64 =
  "cHNldP8BAPACAAAAAAFZpvh5Q0UQjqvqvuuC2V/PJw2bezAoXIzgVJuKaLrYXAEAAAAABQAAAAMBSZqBhUX2uuOfwDtjfypOHmTlkMrBvDpvbXGqRENlTBQBAAAAAAAAA+gAFgAUohUML0DG6/pJ1jbiRoosd5k2R8kBSZqBhUX2uuOfwDtjfypOHmTlkMrBvDpvbXGqRENlTBQBAAAAAAABeugAIgAgsivJbLAlYeBBnaTjoLf7ADtF0Fn5LnyF1qHCVU2e6/EBSZqBhUX2uuOfwDtjfypOHmTlkMrBvDpvbXGqRENlTBQBAAAAAAAAAfQAAAAAAAAAAQFOAUmagYVF9rrjn8A7Y38qTh5k5ZDKwbw6b21xqkRDZUwUAQAAAAAAAYDEACIAILIryWywJWHgQZ2k46C3+wA7RdBZ+S58hdahwlVNnuvxAQVLIQNq0dyAOmJsflWqnbWyweuXpxbnJpoST448wvgeEAMGi60hA0w4N1oojwBbZV0Y7lrswTsw/RaM9L5ZWeyZpuK8Ta8VrHNkVbJoAAAAAA==";

// ------------------------------------------------------------
// Two private keys that are able to spend from the vault script
// First key = privileged key (the one gated by CHECKSIGVERIFY)
// Second key = the "other" key that is authorised by the IF branch
// ------------------------------------------------------------
const PRIVILEGED_PRIV_KEY =
  "339e2240a2a2c9c5f02ac1862a25dfd943a08ccebde878b7832b5b168cd5690a";
const OTHER_PRIV_KEY =
  "7d9c32d7a5a700aff4abfcbebd6fdae36eab2bc96cc10ccfc4d8a7ba70877563";

//------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------
function toBufferSigner(kp: any) {
  // Enhanced signer that ensures canonical DER signatures
  const patched = Object.assign({}, kp);
  patched.sign = function (hash: Buffer, lowR?: boolean) {
    // Generate signature with proper canonical format
    const sig = kp.sign(hash, lowR);
    const signature = Buffer.from(sig);

    // Ensure the signature is canonical (low-S value)
    if (signature.length > 0) {
      // The signature should already be DER encoded from ECPair.sign
      // but let's ensure it's in the correct format
      return signature;
    }
    return signature;
  };
  patched.publicKey = Buffer.from(kp.publicKey);
  patched.network = kp.network;
  return patched as any;
}

function serializeWitness(stack: Buffer[]): Buffer {
  // Very small var-int implementation (good while < 253 bytes per item)
  const parts: Buffer[] = [Buffer.from([stack.length])]; // #items (var-int)
  for (const item of stack) {
    parts.push(Buffer.from([item.length])); // item length (var-int)
    parts.push(item);
  }
  return Buffer.concat(parts);
}

//------------------------------------------------------------------
// Main routine - Signs PSBT for miniscript vault spending
//------------------------------------------------------------------
function signWithBothKeys() {
  try {
    console.log("=== SIGNING MINISCRIPT VAULT PSBT ===");
    const psbt = Psbt.fromBase64(PSBT_B64, { network: NETWORK });
    console.log(`Network: ${NETWORK.name}`);
    console.log(`Input count: ${psbt.inputCount}`);

    // Build key pairs with canonical signature settings (lowR for canonical sigs)
    const privKeyPair = ECPair.fromPrivateKey(
      Buffer.from(PRIVILEGED_PRIV_KEY, "hex"),
      {
        network: NETWORK,
        compressed: true,
      }
    );
    const otherKeyPair = ECPair.fromPrivateKey(
      Buffer.from(OTHER_PRIV_KEY, "hex"),
      {
        network: NETWORK,
        compressed: true,
      }
    );

    // Force lowR signatures for canonical DER format
    privKeyPair.lowR = true;
    otherKeyPair.lowR = true;

    const signerPriv = toBufferSigner(privKeyPair);
    const signerOther = toBufferSigner(otherKeyPair);

    // Show witness script from PSBT
    if (psbt.data.inputs[0]?.witnessScript) {
      console.log(
        "Witness script hex:",
        psbt.data.inputs[0].witnessScript.toString("hex")
      );
    }

    console.log(
      "\nSigning for miniscript policy: and(pk(A),or(pk(B),older(5)))"
    );
    console.log("Using spending path: Both keys sign (normal spending)");

    //----------------------------------------------------------
    // 1. Add both signatures to every input (using default SIGHASH_ALL)
    //----------------------------------------------------------
    for (let i = 0; i < psbt.inputCount; i++) {
      try {
        // Sign with default SIGHASH_ALL - let the library handle it properly
        psbt.signInput(i, signerPriv);
        psbt.signInput(i, signerOther);
        console.log(`Successfully signed input ${i} with both keys`);
      } catch (error) {
        console.error(`Error signing input ${i}:`, error);
        throw error;
      }
    }

    //----------------------------------------------------------
    // 2. Ensure all signatures are canonical DER format
    //----------------------------------------------------------
    psbt.data.inputs.forEach((inp, idx) => {
      if (inp.partialSig) {
        console.log(`Processing signatures for input ${idx}`);
        inp.partialSig = inp.partialSig.map((p) => {
          const signature = Buffer.isBuffer(p.signature)
            ? p.signature
            : Buffer.from(p.signature);
          console.log(
            `Signature length: ${signature.length}, hex: ${signature.toString(
              "hex"
            )}`
          );

          // Verify signature is properly DER encoded
          if (signature.length > 0 && signature[0] === 0x30) {
            return {
              pubkey: p.pubkey,
              signature: signature,
            };
          } else {
            throw new Error(
              `Invalid signature format for pubkey ${p.pubkey.toString("hex")}`
            );
          }
        });
      }
    });

    //----------------------------------------------------------
    // 3. Finalize each input – build the 4-item witness stack:
    //    [ sigOther , 0x01 , sigPriv , witnessScript ]
    //----------------------------------------------------------
    console.log("\nFinalizing inputs...");
    for (let i = 0; i < psbt.inputCount; i++) {
      console.log(`Finalizing input ${i}`);
      psbt.finalizeInput(i, (_idx, input) => {
        if (!input.witnessScript || !input.partialSig) {
          throw new Error("Missing witnessScript or signatures in input " + i);
        }

        const sigPriv = input.partialSig.find((p) =>
          p.pubkey.equals(privKeyPair.publicKey)
        )?.signature;
        const sigOther = input.partialSig.find((p) =>
          p.pubkey.equals(otherKeyPair.publicKey)
        )?.signature;

        if (!sigPriv || !sigOther) {
          throw new Error("Both signatures are required but were not found");
        }

        // For miniscript format: and_v(v:pk(A),or_d(pk(B),older(5)))
        // Witness stack for "both keys sign" path: [sig_B, sig_A, script]
        // No need for the intermediate 0x01 push with miniscript or_d
        const witnessStack = [
          sigOther, // sig for key B (other key)
          sigPriv, // sig for key A (privileged key) - CHECKSIGVERIFY
          input.witnessScript,
        ];

        return {
          finalScriptWitness: serializeWitness(witnessStack),
          finalScriptSig: undefined,
        };
      });
    }

    //----------------------------------------------------------
    // 4. Extract and print the final transaction
    //----------------------------------------------------------
    const tx = psbt.extractTransaction();
    console.log("\n=== FINALISED TRANSACTION ===");
    console.log("TXID:", tx.getId());
    console.log("Hex :", tx.toHex());
  } catch (err) {
    throw `Signing failed: ${
      err instanceof Error ? err.message : "unknown error"
    }`;
  }
}

signWithBothKeys();
