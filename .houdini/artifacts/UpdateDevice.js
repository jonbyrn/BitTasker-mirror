export default {
    "name": "UpdateDevice",
    "kind": "HoudiniMutation",
    "hash": "0ca4abe6210803d4524e460bb7755bedc3bde554880b6574377ee28b67912723",

    "raw": `mutation UpdateDevice($deviceId: String!, $input: UpdateDeviceInput!) {
  updateDevice(deviceId: $deviceId, input: $input) {
    id
    deviceId
    platform
    isActive
    fcmToken
    appVersion
    lastTokenRefresh
  }
}
`,

    "rootType": "Mutation",
    "stripVariables": [],

    "selection": {
        "fields": {
            "updateDevice": {
                "type": "UserDevice",
                "keyRaw": "updateDevice(deviceId: $deviceId, input: $input)",

                "selection": {
                    "fields": {
                        "id": {
                            "type": "ID",
                            "keyRaw": "id",
                            "visible": true
                        },

                        "deviceId": {
                            "type": "String",
                            "keyRaw": "deviceId",
                            "visible": true
                        },

                        "platform": {
                            "type": "String",
                            "keyRaw": "platform",
                            "nullable": true,
                            "visible": true
                        },

                        "isActive": {
                            "type": "Boolean",
                            "keyRaw": "isActive",
                            "visible": true
                        },

                        "fcmToken": {
                            "type": "String",
                            "keyRaw": "fcmToken",
                            "nullable": true,
                            "visible": true
                        },

                        "appVersion": {
                            "type": "String",
                            "keyRaw": "appVersion",
                            "nullable": true,
                            "visible": true
                        },

                        "lastTokenRefresh": {
                            "type": "DateTime",
                            "keyRaw": "lastTokenRefresh",
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
            "deviceId": "String",
            "input": "UpdateDeviceInput"
        },

        "types": {
            "UpdateDeviceInput": {
                "appVersion": "String",
                "deviceName": "String",
                "fcmToken": "String",
                "isActive": "Boolean"
            }
        },

        "defaults": {},
        "runtimeScalars": {}
    }
};

"HoudiniHash=fcb926bffd373a25b7d8a63a14e3602cb9f725a79514902046939f2703ddafdf";