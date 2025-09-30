export type RevokeDevice = {
    readonly "input": RevokeDevice$input;
    readonly "result": RevokeDevice$result;
};

export type RevokeDevice$result = {
    readonly revokeDevice: {
        readonly success: boolean;
        readonly message: string;
    };
};

export type RevokeDevice$input = {
    deviceId: string;
};

export type RevokeDevice$optimistic = {
    readonly revokeDevice?: {
        readonly success?: boolean;
        readonly message?: string;
    };
};

export type RevokeDevice$artifact = {
    "name": "RevokeDevice";
    "kind": "HoudiniMutation";
    "hash": "2fb4703d0fd243bf64633336f850275beac05ae0fc8d317849998fdb670c709f";
    "raw": `mutation RevokeDevice($deviceId: String!) {
  revokeDevice(deviceId: $deviceId) {
    success
    message
  }
}
`;
    "rootType": "Mutation";
    "stripVariables": [];
    "selection": {
        "fields": {
            "revokeDevice": {
                "type": "NotificationResponse";
                "keyRaw": "revokeDevice(deviceId: $deviceId)";
                "selection": {
                    "fields": {
                        "success": {
                            "type": "Boolean";
                            "keyRaw": "success";
                            "visible": true;
                        };
                        "message": {
                            "type": "String";
                            "keyRaw": "message";
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
        };
        "types": {};
        "defaults": {};
        "runtimeScalars": {};
    };
};