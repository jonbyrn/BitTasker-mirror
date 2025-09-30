export type UpdateDeviceActivity = {
    readonly "input": UpdateDeviceActivity$input;
    readonly "result": UpdateDeviceActivity$result;
};

export type UpdateDeviceActivity$result = {
    readonly updateDeviceActivity: {
        readonly success: boolean;
        readonly message: string;
    };
};

export type UpdateDeviceActivity$input = {
    deviceId: string;
};

export type UpdateDeviceActivity$optimistic = {
    readonly updateDeviceActivity?: {
        readonly success?: boolean;
        readonly message?: string;
    };
};

export type UpdateDeviceActivity$artifact = {
    "name": "UpdateDeviceActivity";
    "kind": "HoudiniMutation";
    "hash": "72dfb9eab6e29d27b224990be22b12d3ef01b1b7bcdf38bf7bc5b8c0ae029dea";
    "raw": `mutation UpdateDeviceActivity($deviceId: String!) {
  updateDeviceActivity(deviceId: $deviceId) {
    success
    message
  }
}
`;
    "rootType": "Mutation";
    "stripVariables": [];
    "selection": {
        "fields": {
            "updateDeviceActivity": {
                "type": "NotificationResponse";
                "keyRaw": "updateDeviceActivity(deviceId: $deviceId)";
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