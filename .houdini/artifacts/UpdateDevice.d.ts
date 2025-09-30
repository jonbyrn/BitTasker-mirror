export type UpdateDevice = {
    readonly "input": UpdateDevice$input;
    readonly "result": UpdateDevice$result;
};

export type UpdateDevice$result = {
    readonly updateDevice: {
        readonly id: string;
        readonly deviceId: string;
        readonly platform: string | null;
        readonly isActive: boolean;
        readonly fcmToken: string | null;
        readonly appVersion: string | null;
        readonly lastTokenRefresh: string | null;
    };
};

type UpdateDeviceInput = {
    appVersion?: string | null | undefined;
    deviceName?: string | null | undefined;
    fcmToken?: string | null | undefined;
    isActive?: boolean | null | undefined;
};

export type UpdateDevice$input = {
    deviceId: string;
    input: UpdateDeviceInput;
};

export type UpdateDevice$optimistic = {
    readonly updateDevice?: {
        readonly id?: string;
        readonly deviceId?: string;
        readonly platform?: string | null;
        readonly isActive?: boolean;
        readonly fcmToken?: string | null;
        readonly appVersion?: string | null;
        readonly lastTokenRefresh?: string | null;
    };
};

export type UpdateDevice$artifact = {
    "name": "UpdateDevice";
    "kind": "HoudiniMutation";
    "hash": "0ca4abe6210803d4524e460bb7755bedc3bde554880b6574377ee28b67912723";
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
`;
    "rootType": "Mutation";
    "stripVariables": [];
    "selection": {
        "fields": {
            "updateDevice": {
                "type": "UserDevice";
                "keyRaw": "updateDevice(deviceId: $deviceId, input: $input)";
                "selection": {
                    "fields": {
                        "id": {
                            "type": "ID";
                            "keyRaw": "id";
                            "visible": true;
                        };
                        "deviceId": {
                            "type": "String";
                            "keyRaw": "deviceId";
                            "visible": true;
                        };
                        "platform": {
                            "type": "String";
                            "keyRaw": "platform";
                            "nullable": true;
                            "visible": true;
                        };
                        "isActive": {
                            "type": "Boolean";
                            "keyRaw": "isActive";
                            "visible": true;
                        };
                        "fcmToken": {
                            "type": "String";
                            "keyRaw": "fcmToken";
                            "nullable": true;
                            "visible": true;
                        };
                        "appVersion": {
                            "type": "String";
                            "keyRaw": "appVersion";
                            "nullable": true;
                            "visible": true;
                        };
                        "lastTokenRefresh": {
                            "type": "DateTime";
                            "keyRaw": "lastTokenRefresh";
                            "nullable": true;
                            "visible": true;
                        };
                    };
                };
                "visible": true;
            };
        };
    };
    "pluginData": {
        "houdini-svelte": {};
    };
    "input": {
        "fields": {
            "deviceId": "String";
            "input": "UpdateDeviceInput";
        };
        "types": {
            "UpdateDeviceInput": {
                "appVersion": "String";
                "deviceName": "String";
                "fcmToken": "String";
                "isActive": "Boolean";
            };
        };
        "defaults": {};
        "runtimeScalars": {};
    };
};