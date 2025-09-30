export default {
    "name": "RegisterDevice",
    "kind": "HoudiniMutation",
    "hash": "988d3d9b5c7c14fce96f4d47a72a7b1113a9c7e494d6428d99cac133c7cdcfeb",

    "raw": `mutation RegisterDevice($input: RegisterDeviceInput!) {
  registerDevice(input: $input) {
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
            "registerDevice": {
                "type": "UserDevice",
                "keyRaw": "registerDevice(input: $input)",

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
            "input": "RegisterDeviceInput"
        },

        "types": {
            "RegisterDeviceInput": {
                "appVersion": "String",
                "deviceId": "String",
                "deviceName": "String",
                "fcmToken": "String",
                "platform": "DevicePlatform"
            }
        },

        "defaults": {},
        "runtimeScalars": {}
    }
};

"HoudiniHash=b6df1ec6fc8dc73f22f3aff8c014b546d3211818eda468c8c1af41496fa6d51f";