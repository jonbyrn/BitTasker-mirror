export type RevokeAllDevices = {
    readonly "input": RevokeAllDevices$input;
    readonly "result": RevokeAllDevices$result;
};

export type RevokeAllDevices$result = {
    readonly revokeAllDevices: {
        readonly success: boolean;
        readonly message: string;
    };
};

export type RevokeAllDevices$input = null;

export type RevokeAllDevices$optimistic = {
    readonly revokeAllDevices?: {
        readonly success?: boolean;
        readonly message?: string;
    };
};

export type RevokeAllDevices$artifact = {
    "name": "RevokeAllDevices";
    "kind": "HoudiniMutation";
    "hash": "b926c6415075fb7c08a572e4d4d6fc49305063f8f17e9f2e470c0103d3f3a3c4";
    "raw": `mutation RevokeAllDevices {
  revokeAllDevices {
    success
    message
  }
}
`;
    "rootType": "Mutation";
    "stripVariables": [];
    "selection": {
        "fields": {
            "revokeAllDevices": {
                "type": "NotificationResponse";
                "keyRaw": "revokeAllDevices";
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
};