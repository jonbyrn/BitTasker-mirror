export type MyDevices = {
    readonly "input": MyDevices$input;
    readonly "result": MyDevices$result | undefined;
};

export type MyDevices$result = {
    readonly myDevices: ({
        readonly id: string;
        readonly deviceId: string;
        readonly deviceName: string | null;
        readonly platform: string | null;
        readonly isActive: boolean;
        readonly fcmToken: string | null;
        readonly appVersion: string | null;
        readonly lastUsedAt: string | null;
    })[];
};

export type MyDevices$input = null;

export type MyDevices$artifact = {
    "name": "MyDevices";
    "kind": "HoudiniQuery";
    "hash": "fecfc84dd146641ad6babf62acac700d64eed5baa52c19865af622e7e07807c8";
    "raw": `query MyDevices {
  myDevices {
    id
    deviceId
    deviceName
    platform
    isActive
    fcmToken
    appVersion
    lastUsedAt
  }
}
`;
    "rootType": "Query";
    "stripVariables": [];
    "selection": {
        "fields": {
            "myDevices": {
                "type": "UserDevice";
                "keyRaw": "myDevices";
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
                        "deviceName": {
                            "type": "String";
                            "keyRaw": "deviceName";
                            "nullable": true;
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
                        "lastUsedAt": {
                            "type": "DateTime";
                            "keyRaw": "lastUsedAt";
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
    "policy": "CacheOrNetwork";
    "partial": false;
};