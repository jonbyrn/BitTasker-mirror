export default {
    "name": "RevokeDevice",
    "kind": "HoudiniMutation",
    "hash": "2fb4703d0fd243bf64633336f850275beac05ae0fc8d317849998fdb670c709f",

    "raw": `mutation RevokeDevice($deviceId: String!) {
  revokeDevice(deviceId: $deviceId) {
    success
    message
  }
}
`,

    "rootType": "Mutation",
    "stripVariables": [],

    "selection": {
        "fields": {
            "revokeDevice": {
                "type": "NotificationResponse",
                "keyRaw": "revokeDevice(deviceId: $deviceId)",

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
    },

    "input": {
        "fields": {
            "deviceId": "String"
        },

        "types": {},
        "defaults": {},
        "runtimeScalars": {}
    }
};

"HoudiniHash=cbfb675486c8b2c6154c1e1f0a245a8bd856a6aef74426c4aed668ce52e2328f";