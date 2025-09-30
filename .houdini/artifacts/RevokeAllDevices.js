export default {
    "name": "RevokeAllDevices",
    "kind": "HoudiniMutation",
    "hash": "b926c6415075fb7c08a572e4d4d6fc49305063f8f17e9f2e470c0103d3f3a3c4",

    "raw": `mutation RevokeAllDevices {
  revokeAllDevices {
    success
    message
  }
}
`,

    "rootType": "Mutation",
    "stripVariables": [],

    "selection": {
        "fields": {
            "revokeAllDevices": {
                "type": "NotificationResponse",
                "keyRaw": "revokeAllDevices",

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
    }
};

"HoudiniHash=902a08e487a5543adbd81cdafceaea1698ba286628659a1ca7c765d2c3c4671c";