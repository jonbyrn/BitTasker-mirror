import { BudgetType } from "$houdini/graphql/enums";
import { TaskType } from "$houdini/graphql/enums";
import { TaskStatus } from "$houdini/graphql/enums";
import type { ValueOf } from "$houdini/runtime/lib/types";

export type Tasks = {
    readonly "input": Tasks$input;
    readonly "result": Tasks$result | undefined;
};

export type Tasks$result = {
    readonly myTasks: ({
        readonly id: string;
        readonly title: string;
        readonly description: string;
        readonly userProfileId: number;
        readonly status: ValueOf<typeof TaskStatus>;
        readonly taskType: ValueOf<typeof TaskType>;
        readonly pickupLocation: {
            readonly zipCode: string | null;
        } | null;
        readonly budget: number | null;
        readonly budgetType: ValueOf<typeof BudgetType>;
        readonly deadlineDate: string | null;
        readonly dateRange: {
            readonly start: string | null;
            readonly end: string | null;
        } | null;
        readonly bids: ({
            readonly id: string;
        })[] | null;
    })[];
};

export type Tasks$input = null;

export type Tasks$artifact = {
    "name": "Tasks";
    "kind": "HoudiniQuery";
    "hash": "7fcc6dd1fc846467dd2509a40b356137817165c9aac71a6bd990820649228ef3";
    "raw": `query Tasks {
  myTasks {
    id
    title
    description
    userProfileId
    status
    taskType
    pickupLocation {
      zipCode
    }
    budget
    budgetType
    deadlineDate
    dateRange {
      start
      end
    }
    bids {
      id
    }
  }
}
`;
    "rootType": "Query";
    "stripVariables": [];
    "selection": {
        "fields": {
            "myTasks": {
                "type": "Task";
                "keyRaw": "myTasks";
                "selection": {
                    "fields": {
                        "id": {
                            "type": "ID";
                            "keyRaw": "id";
                            "visible": true;
                        };
                        "title": {
                            "type": "String";
                            "keyRaw": "title";
                            "visible": true;
                        };
                        "description": {
                            "type": "String";
                            "keyRaw": "description";
                            "visible": true;
                        };
                        "userProfileId": {
                            "type": "Int";
                            "keyRaw": "userProfileId";
                            "visible": true;
                        };
                        "status": {
                            "type": "TaskStatus";
                            "keyRaw": "status";
                            "visible": true;
                        };
                        "taskType": {
                            "type": "TaskType";
                            "keyRaw": "taskType";
                            "visible": true;
                        };
                        "pickupLocation": {
                            "type": "LocationOutput";
                            "keyRaw": "pickupLocation";
                            "nullable": true;
                            "selection": {
                                "fields": {
                                    "zipCode": {
                                        "type": "String";
                                        "keyRaw": "zipCode";
                                        "nullable": true;
                                        "visible": true;
                                    };
                                };
                            };
                            "visible": true;
                        };
                        "budget": {
                            "type": "Float";
                            "keyRaw": "budget";
                            "nullable": true;
                            "visible": true;
                        };
                        "budgetType": {
                            "type": "BudgetType";
                            "keyRaw": "budgetType";
                            "visible": true;
                        };
                        "deadlineDate": {
                            "type": "String";
                            "keyRaw": "deadlineDate";
                            "nullable": true;
                            "visible": true;
                        };
                        "dateRange": {
                            "type": "DateRangeOutput";
                            "keyRaw": "dateRange";
                            "nullable": true;
                            "selection": {
                                "fields": {
                                    "start": {
                                        "type": "String";
                                        "keyRaw": "start";
                                        "nullable": true;
                                        "visible": true;
                                    };
                                    "end": {
                                        "type": "String";
                                        "keyRaw": "end";
                                        "nullable": true;
                                        "visible": true;
                                    };
                                };
                            };
                            "visible": true;
                        };
                        "bids": {
                            "type": "Bid";
                            "keyRaw": "bids";
                            "nullable": true;
                            "selection": {
                                "fields": {
                                    "id": {
                                        "type": "ID";
                                        "keyRaw": "id";
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