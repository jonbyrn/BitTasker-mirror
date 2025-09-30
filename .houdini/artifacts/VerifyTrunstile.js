export default {
    "name": "VerifyTrunstile",
    "kind": "HoudiniMutation",
    "hash": "f3f596467dae21d15075a976ec01c974adf83f65c45d1b0b79d7eeaa4854c49a",

    "raw": `mutation VerifyTrunstile($input: TurnstileVerificationInput!) {
  verifyTurnstileToken(input: $input) {
    success
    message
  }
}
`,

    "rootType": "Mutation",
    "stripVariables": [],

    "selection": {
        "fields": {
            "verifyTurnstileToken": {
                "type": "TurnstileVerificationResult",
                "keyRaw": "verifyTurnstileToken(input: $input)",

                "selection": {
                    "fields": {
                        "success": {
                            "type": "Boolean",
                            "keyRaw": "success",
                            "visible": true
                        },

                        "message": {
                            "type": "String",
                            "keyRaw": "message",
                            "nullable": true,
                            "visible": true
                        }
                    }
                },

                "visible": true
            }
        }
    },

    "pluginData": {
        "houdini-svelte": {}
    },

    "input": {
        "fields": {
            "input": "TurnstileVerificationInput"
        },

        "types": {
            "TurnstileVerificationInput": {
                "action": "String",
                "token": "String"
            }
        },

        "defaults": {},
        "runtimeScalars": {}
    }
};

"HoudiniHash=dbdb3ab34975d0810bded370502b549a6b49729dbcf535b17bd25eb2d41d5557";