import { describe, expect, it } from 'vitest';
import type { Service } from '$lib/types/service.d';
import { ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
import {
	buildServiceContractLocationSnapshot,
	validateServiceLocation
} from '$lib/utils/service-contract/location';

type _ServiceLocationInput = Pick<Service, 'serviceLocationTypes' | 'locationDetails'>;

describe('buildServiceContractLocationSnapshot', () => {
	it('returns undefined when serviceLocationTypes is empty', () => {
		const service = {
			serviceLocationTypes: [],
			locationDetails: {}
		};
		expect(buildServiceContractLocationSnapshot(service)).toBeUndefined();
	});

	it('returns snapshot even when coordinates are null (relies on validateServiceLocation for validation)', () => {
		const service = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					serviceLocation: {
						latitude: null,
						longitude: null,
						displayName: 'Location'
					}
				}
			}
		};
		const result = buildServiceContractLocationSnapshot(service);
		expect(result).toEqual({
			mode: 'taskee_location',
			label: 'Location',
			location: {
				latitude: null,
				longitude: null,
				displayName: 'Location'
			}
		});
	});

	it('returns taskee location snapshot when type is TASKEE_LOCATION', () => {
		const service = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					serviceLocation: {
						latitude: 40.7128,
						longitude: -74.006,
						displayName: '123 Main St'
					},
					locationDisplayName: 'Downtown Office',
					serviceRadius: 10
				}
			}
		};
		const result = buildServiceContractLocationSnapshot(service);
		expect(result?.mode).toBe('taskee_location');
		expect(result?.label).toBeTruthy();
		expect(result?.location?.latitude).toBe(40.7128);
	});

	it('returns tasker location snapshot when type is TASKER_LOCATION', () => {
		const service = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKER_LOCATION],
			locationDetails: {
				taskerLocation: {
					serviceLocation: {
						latitude: 34.0522,
						longitude: -118.2437,
						displayName: '456 Studio Ave'
					},
					serviceRadius: 15
				}
			}
		};
		const result = buildServiceContractLocationSnapshot(service);
		expect(result?.mode).toBe('tasker_location');
		expect(result?.label).toBeTruthy();
		expect(result?.location?.latitude).toBe(34.0522);
	});

	it('prioritizes TASKEE_LOCATION over TASKER_LOCATION when both are present', () => {
		const service = {
			serviceLocationTypes: [
				ServiceLocationTypeEnum.TASKEE_LOCATION,
				ServiceLocationTypeEnum.TASKER_LOCATION
			],
			locationDetails: {
				taskeeLocation: {
					serviceLocation: {
						latitude: 40.7128,
						longitude: -74.006
					}
				},
				taskerLocation: {
					serviceLocation: {
						latitude: 34.0522,
						longitude: -118.2437
					}
				}
			}
		};
		const result = buildServiceContractLocationSnapshot(service);
		expect(result?.mode).toBe('taskee_location');
	});
});

describe('validateServiceLocation', () => {
	it('returns invalid when serviceLocationTypes is empty', () => {
		const service = {
			serviceLocationTypes: [],
			locationDetails: {}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('MISSING_LOCATION_TYPE');
	});

	it('returns valid for TASKEE_LOCATION with valid coordinates and radius', () => {
		const service = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					serviceLocation: {
						latitude: 40.7128,
						longitude: -74.006
					},
					serviceRadius: 10
				}
			}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(true);
	});

	it('returns invalid for TASKEE_LOCATION when coordinates are missing', () => {
		const service = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					serviceLocation: {
						latitude: null,
						longitude: null
					}
				}
			}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('MISSING_COORDINATES');
	});

	it('returns invalid for TASKEE_LOCATION when only one coordinate is present', () => {
		const service = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					serviceLocation: {
						latitude: 40.7128,
						longitude: null
					}
				}
			}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('MISSING_COORDINATES');
	});

	it('returns invalid for TASKEE_LOCATION when radius is out of range', () => {
		const service = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					serviceLocation: {
						latitude: 40.7128,
						longitude: -74.006
					},
					serviceRadius: 0
				}
			}
		};
		let result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('INVALID_RADIUS');

		service.locationDetails.taskeeLocation.serviceRadius = 101;
		result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('INVALID_RADIUS');
	});

	it('allows TASKEE_LOCATION without explicit radius (uses default)', () => {
		const service = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					serviceLocation: {
						latitude: 40.7128,
						longitude: -74.006
					}
				}
			}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(true);
	});

	it('returns valid for TASKER_LOCATION with valid coordinates', () => {
		const service = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKER_LOCATION],
			locationDetails: {
				taskerLocation: {
					serviceLocation: {
						latitude: 34.0522,
						longitude: -118.2437
					}
				}
			}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(true);
	});

	it('returns invalid for TASKER_LOCATION when coordinates are missing', () => {
		const service = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKER_LOCATION],
			locationDetails: {
				taskerLocation: {
					serviceLocation: {
						latitude: null,
						longitude: null
					}
				}
			}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('MISSING_COORDINATES');
	});

	it('returns valid for REMOTE location type without coordinates', () => {
		const service = {
			serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
			locationDetails: {}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(true);
	});

	it('handles undefined locationDetails gracefully', () => {
		const service = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: undefined
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('MISSING_COORDINATES');
	});

	it('handles undefined taskeeLocation gracefully', () => {
		const service = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('MISSING_COORDINATES');
	});

	it('handles undefined taskerLocation gracefully', () => {
		const service = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKER_LOCATION],
			locationDetails: {}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('MISSING_COORDINATES');
	});
});
