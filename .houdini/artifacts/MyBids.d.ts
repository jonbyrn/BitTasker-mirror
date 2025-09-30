import { BidStatus } from "$houdini/graphql/enums";
import type { ValueOf } from "$houdini/runtime/lib/types";

export type MyBids = {
    readonly "input": MyBids$input;
    readonly "result": MyBids$result | undefined;
};

export type MyBids$result = {
    readonly bids: {
        readonly received: {
            readonly data: ({
                readonly id: string;
                readonly userProfile: {
                    readonly user: {
                        readonly name: string | null;
                    } | null;
                } | null;
                readonly amount: number;
                readonly currency: string | null;
                readonly status: ValueOf<typeof BidStatus>;
                readonly description: string | null;
            })[];
        };
        readonly submitted: {
            readonly data: ({
                readonly id: string;
                readonly userProfile: {
                    readonly user: {
                        readonly name: string | null;
                    } | null;
                } | null;
                readonly amount: number;
                readonly currency: string | null;
                readonly status: ValueOf<typeof BidStatus>;
                readonly description: string | null;
            })[];
        };
    };
};

export type MyBids$input = null;

export type MyBids$artifact = {
    "name": "MyBids";
    "kind": "HoudiniQuery";
    "hash": "eb94119e2b4e580b366c8a6bb66c80180057a477380a6716bb37f06223a38ea1";
    "raw": `query MyBids {
  bids {
    received {
      data {
        id
        userProfile {
          user {
            name
            id
          }
          id
        }
        amount
        currency
        status
        description
      }
    }
    submitted {
      data {
        id
        userProfile {
          user {
            name
            id
          }
          id
        }
        amount
        currency
        status
        description
      }
    }
  }
}
`;
    "rootType": "Query";
    "stripVariables": [];
    "selection": {
        "fields": {
            "bids": {
                "type": "UserBidsResponse";
                "keyRaw": "bids";
                "selection": {
                    "fields": {
                        "received": {
                            "type": "BidsWithPaginationDto";
                            "keyRaw": "received";
                            "selection": {
                                "fields": {
                                    "data": {
                                        "type": "Bid";
                                        "keyRaw": "data";
                                        "selection": {
                                            "fields": {
                                                "id": {
                                                    "type": "ID";
                                                    "keyRaw": "id";
                                                    "visible": true;
                                                };
                                                "userProfile": {
                                                    "type": "UserProfileOutput";
                                                    "keyRaw": "userProfile";
                                                    "nullable": true;
                                                    "selection": {
                                                        "fields": {
                                                            "user": {
                                                                "type": "User";
                                                                "keyRaw": "user";
                                                                "nullable": true;
                                                                "selection": {
                                                                    "fields": {
                                                                        "name": {
                                                                            "type": "String";
                                                                            "keyRaw": "name";
                                                                            "nullable": true;
                                                                            "visible": true;
                                                                        };
                                                                        "id": {
                                                                            "type": "ID";
                                                                            "keyRaw": "id";
                                                                            "visible": true;
                                                                        };
                                                                    };
                                                                };
                                                                "visible": true;
                                                            };
                                                            "id": {
                                                                "type": "ID";
                                                                "keyRaw": "id";
                                                                "visible": true;
                                                            };
                                                        };
                                                    };
                                                    "visible": true;
                                                };
                                                "amount": {
                                                    "type": "Float";
                                                    "keyRaw": "amount";
                                                    "visible": true;
                                                };
                                                "currency": {
                                                    "type": "String";
                                                    "keyRaw": "currency";
                                                    "nullable": true;
                                                    "visible": true;
                                                };
                                                "status": {
                                                    "type": "BidStatus";
                                                    "keyRaw": "status";
                                                    "visible": true;
                                                };
                                                "description": {
                                                    "type": "String";
                                                    "keyRaw": "description";
                                                    "nullable": true;
                                                    "visible": true;
                                                };
                                            };
                                        };
                                        "visible": true;
                                    };
                                };
                            };
                            "visible": true;
                        };
                        "submitted": {
                            "type": "BidsWithPaginationDto";
                            "keyRaw": "submitted";
                            "selection": {
                                "fields": {
                                    "data": {
                                        "type": "Bid";
                                        "keyRaw": "data";
                                        "selection": {
                                            "fields": {
                                                "id": {
                                                    "type": "ID";
                                                    "keyRaw": "id";
                                                    "visible": true;
                                                };
                                                "userProfile": {
                                                    "type": "UserProfileOutput";
                                                    "keyRaw": "userProfile";
                                                    "nullable": true;
                                                    "selection": {
                                                        "fields": {
                                                            "user": {
                                                                "type": "User";
                                                                "keyRaw": "user";
                                                                "nullable": true;
                                                                "selection": {
                                                                    "fields": {
                                                                        "name": {
                                                                            "type": "String";
                                                                            "keyRaw": "name";
                                                                            "nullable": true;
                                                                            "visible": true;
                                                                        };
                                                                        "id": {
                                                                            "type": "ID";
                                                                            "keyRaw": "id";
                                                                            "visible": true;
                                                                        };
                                                                    };
                                                                };
                                                                "visible": true;
                                                            };
                                                            "id": {
                                                                "type": "ID";
                                                                "keyRaw": "id";
                                                                "visible": true;
                                                            };
                                                        };
                                                    };
                                                    "visible": true;
                                                };
                                                "amount": {
                                                    "type": "Float";
                                                    "keyRaw": "amount";
                                                    "visible": true;
                                                };
                                                "currency": {
                                                    "type": "String";
                                                    "keyRaw": "currency";
                                                    "nullable": true;
                                                    "visible": true;
                                                };
                                                "status": {
                                                    "type": "BidStatus";
                                                    "keyRaw": "status";
                                                    "visible": true;
                                                };
                                                "description": {
                                                    "type": "String";
                                                    "keyRaw": "description";
                                                    "nullable": true;
                                                    "visible": true;
                                                };
                                            };
                                        };
                                        "visible": true;
                                    };
                                };
                            };
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