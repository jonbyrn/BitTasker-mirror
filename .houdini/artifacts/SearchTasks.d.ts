import type { BudgetType } from "$houdini/graphql/enums";
import { TaskType } from "$houdini/graphql/enums";
import { TaskStatus } from "$houdini/graphql/enums";
import type { ValueOf } from "$houdini/runtime/lib/types";

export type SearchTasks = {
    readonly "input": SearchTasks$input;
    readonly "result": SearchTasks$result | undefined;
};

export type SearchTasks$result = {
    readonly tasks: {
        readonly items: ({
            readonly id: string;
            readonly title: string;
            readonly description: string;
            readonly budget: number | null;
            readonly status: ValueOf<typeof TaskStatus>;
            readonly createdAt: string;
            readonly deadlineDate: string | null;
            readonly taskType: ValueOf<typeof TaskType>;
            readonly dateRange: {
                readonly start: string | null;
                readonly end: string | null;
            } | null;
            readonly skillIds: (number)[] | null;
            readonly pickupLocation: {
                readonly displayName: string | null;
                readonly zipCode: string | null;
            } | null;
            readonly userProfile: {
                readonly id: string;
                readonly user: {
                    readonly id: string;
                    readonly username: string | null;
                } | null;
            };
            readonly bids: ({
                readonly id: string;
            })[] | null;
        })[];
        readonly meta: {
            readonly currentPage: number;
            readonly itemCount: number;
            readonly itemsPerPage: number;
            readonly totalItems: number;
            readonly totalPages: number;
            readonly hasNextPage: boolean;
            readonly hasPreviousPage: boolean;
        };
    };
};

type DateRangeInput = {
    end?: string | null | undefined;
    start?: string | null | undefined;
};

type SearchTasksDto = {
    budgetType?: (ValueOf<typeof BudgetType>)[] | null | undefined;
    categoryId?: number | null | undefined;
    categoryIds?: (number)[] | null | undefined;
    deadlineAfter?: string | null | undefined;
    deadlineBefore?: string | null | undefined;
    deadlineDateRange?: DateRangeInput | null | undefined;
    includeDeleted?: boolean | null | undefined;
    latitude?: number | null | undefined;
    limit?: number | null | undefined;
    location?: string | null | undefined;
    longitude?: number | null | undefined;
    maxBudget?: number | null | undefined;
    minBudget?: number | null | undefined;
    onlyBoostedTasks?: boolean | null | undefined;
    page?: number | null | undefined;
    radius?: number | null | undefined;
    search?: string | null | undefined;
    searchTerm?: string | null | undefined;
    skillIds?: (number)[] | null | undefined;
    sortBy?: string | null | undefined;
    sortOrder?: string | null | undefined;
    status?: (ValueOf<typeof TaskStatus>)[] | null | undefined;
    taskType?: (ValueOf<typeof TaskType>)[] | null | undefined;
};

export type SearchTasks$input = {
    input: SearchTasksDto;
};

export type SearchTasks$artifact = {
    "name": "SearchTasks";
    "kind": "HoudiniQuery";
    "hash": "14607cfb6de52af755fc48db52b15e80ab34245aae9cdce2b655003cb8d0eb72";
    "raw": `query SearchTasks($input: SearchTasksDto!) {
  tasks(input: $input) {
    items {
      id
      title
      description
      budget
      status
      createdAt
      deadlineDate
      taskType
      dateRange {
        start
        end
      }
      skillIds
      pickupLocation {
        displayName
        zipCode
      }
      userProfile {
        id
        user {
          id
          username
        }
      }
      bids {
        id
      }
    }
    meta {
      currentPage
      itemCount
      itemsPerPage
      totalItems
      totalPages
      hasNextPage
      hasPreviousPage
    }
  }
}
`;
    "rootType": "Query";
    "stripVariables": [];
    "selection": {
        "fields": {
            "tasks": {
                "type": "PaginatedTasksResponse";
                "keyRaw": "tasks(input: $input)";
                "selection": {
                    "fields": {
                        "items": {
                            "type": "Task";
                            "keyRaw": "items";
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
                                    "budget": {
                                        "type": "Float";
                                        "keyRaw": "budget";
                                        "nullable": true;
                                        "visible": true;
                                    };
                                    "status": {
                                        "type": "TaskStatus";
                                        "keyRaw": "status";
                                        "visible": true;
                                    };
                                    "createdAt": {
                                        "type": "String";
                                        "keyRaw": "createdAt";
                                        "visible": true;
                                    };
                                    "deadlineDate": {
                                        "type": "String";
                                        "keyRaw": "deadlineDate";
                                        "nullable": true;
                                        "visible": true;
                                    };
                                    "taskType": {
                                        "type": "TaskType";
                                        "keyRaw": "taskType";
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
                                    "skillIds": {
                                        "type": "Int";
                                        "keyRaw": "skillIds";
                                        "nullable": true;
                                        "visible": true;
                                    };
                                    "pickupLocation": {
                                        "type": "LocationOutput";
                                        "keyRaw": "pickupLocation";
                                        "nullable": true;
                                        "selection": {
                                            "fields": {
                                                "displayName": {
                                                    "type": "String";
                                                    "keyRaw": "displayName";
                                                    "nullable": true;
                                                    "visible": true;
                                                };
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
                                    "userProfile": {
                                        "type": "UserProfileOutput";
                                        "keyRaw": "userProfile";
                                        "selection": {
                                            "fields": {
                                                "id": {
                                                    "type": "ID";
                                                    "keyRaw": "id";
                                                    "visible": true;
                                                };
                                                "user": {
                                                    "type": "User";
                                                    "keyRaw": "user";
                                                    "nullable": true;
                                                    "selection": {
                                                        "fields": {
                                                            "id": {
                                                                "type": "ID";
                                                                "keyRaw": "id";
                                                                "visible": true;
                                                            };
                                                            "username": {
                                                                "type": "String";
                                                                "keyRaw": "username";
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
                        "meta": {
                            "type": "PaginationMeta";
                            "keyRaw": "meta";
                            "selection": {
                                "fields": {
                                    "currentPage": {
                                        "type": "Int";
                                        "keyRaw": "currentPage";
                                        "visible": true;
                                    };
                                    "itemCount": {
                                        "type": "Int";
                                        "keyRaw": "itemCount";
                                        "visible": true;
                                    };
                                    "itemsPerPage": {
                                        "type": "Int";
                                        "keyRaw": "itemsPerPage";
                                        "visible": true;
                                    };
                                    "totalItems": {
                                        "type": "Int";
                                        "keyRaw": "totalItems";
                                        "visible": true;
                                    };
                                    "totalPages": {
                                        "type": "Int";
                                        "keyRaw": "totalPages";
                                        "visible": true;
                                    };
                                    "hasNextPage": {
                                        "type": "Boolean";
                                        "keyRaw": "hasNextPage";
                                        "visible": true;
                                    };
                                    "hasPreviousPage": {
                                        "type": "Boolean";
                                        "keyRaw": "hasPreviousPage";
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
    "input": {
        "fields": {
            "input": "SearchTasksDto";
        };
        "types": {
            "DateRangeInput": {
                "end": "String";
                "start": "String";
            };
            "SearchTasksDto": {
                "budgetType": "BudgetType";
                "categoryId": "Int";
                "categoryIds": "Int";
                "deadlineAfter": "String";
                "deadlineBefore": "String";
                "deadlineDateRange": "DateRangeInput";
                "includeDeleted": "Boolean";
                "latitude": "Float";
                "limit": "Int";
                "location": "String";
                "longitude": "Float";
                "maxBudget": "Float";
                "minBudget": "Float";
                "onlyBoostedTasks": "Boolean";
                "page": "Int";
                "radius": "Float";
                "search": "String";
                "searchTerm": "String";
                "skillIds": "Int";
                "sortBy": "String";
                "sortOrder": "String";
                "status": "TaskStatus";
                "taskType": "TaskType";
            };
        };
        "defaults": {};
        "runtimeScalars": {};
    };
    "policy": "CacheOrNetwork";
    "partial": false;
};