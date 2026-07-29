import { describe, expect, it } from 'vitest';
import type { Service } from '$lib/types/service.d';
import { ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
import {
	buildServiceContractLocationSnapshot,
	validateServiceLocation
} from '$lib/utils/service-contract/location';

type ServiceLocationInput = Pick<Service, 'serviceLocationTypes' | 'locationDetails'>;

describe('buildServiceContractLocationSnapshot', () => {
	it('returns undefined when serviceLocationTypes is empty', () => {
		const service: ServiceLocationInput = {
			serviceLocationTypes: [],
			locationDetails: {}
		};
		expect(buildServiceContractLocationSnapshot(service)).toBeUndefined();
	});

	it('returns snapshot even when coordinates are null (relies on validateServiceLocation for validation)', () => {
		const service: ServiceLocationInput = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					useGlobalLocation: false,
					serviceLocation: {
						latitude: null,
						longitude: null,
						displayName: 'Location',
						zipCode: '',
						locationLoaded: true
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
				displayName: 'Location',
				zipCode: '',
				locationLoaded: true
			}
		});
	});

	it('returns taskee location snapshot when type is TASKEE_LOCATION', () => {
		const service: ServiceLocationInput = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					useGlobalLocation: false,
					serviceLocation: {
						latitude: 40.7128,
						longitude: -74.006,
						displayName: '123 Main St',
						zipCode: '',
						locationLoaded: true
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
		const service: ServiceLocationInput = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKER_LOCATION],
			locationDetails: {
				taskerLocation: {
					serviceLocation: {
						latitude: 34.0522,
						longitude: -118.2437,
						displayName: '456 Studio Ave',
						zipCode: '',
						locationLoaded: true
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
		const service: ServiceLocationInput = {
			serviceLocationTypes: [
				ServiceLocationTypeEnum.TASKEE_LOCATION,
				ServiceLocationTypeEnum.TASKER_LOCATION
			],
			locationDetails: {
				taskeeLocation: {
					useGlobalLocation: false,
					serviceLocation: {
						latitude: 40.7128,
						longitude: -74.006,
						displayName: '',
						zipCode: '',
						locationLoaded: true
					}
				}
			}
		};
		const result = buildServiceContractLocationSnapshot(service);
		expect(result?.mode).toBe('taskee_location');
	});

	it('returns tasker location snapshot when type is TASKER_LOCATION', () => {
		const service: ServiceLocationInput = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKER_LOCATION],
			locationDetails: {
				taskerLocation: {
					serviceLocation: {
						latitude: 34.0522,
						longitude: -118.2437,
						displayName: '',
						zipCode: '',
						locationLoaded: true
					}
				}
			}
		};
		const result = buildServiceContractLocationSnapshot(service);
		expect(result?.mode).toBe('tasker_location');
	});
});

describe('validateServiceLocation', () => {
	it('returns invalid when serviceLocationTypes is empty', () => {
		const service: ServiceLocationInput = {
			serviceLocationTypes: [],
			locationDetails: {}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('MISSING_LOCATION_TYPE');
	});

	it('returns valid for TASKEE_LOCATION with valid coordinates and radius', () => {
		const service: ServiceLocationInput = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					useGlobalLocation: false,
					serviceLocation: {
						latitude: 40.7128,
						longitude: -74.006,
						displayName: '',
						zipCode: '',
						locationLoaded: true
					},
					serviceRadius: 10
				}
			}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(true);
	});

	it('returns invalid for TASKEE_LOCATION when coordinates are missing', () => {
		const service: ServiceLocationInput = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					useGlobalLocation: false,
					serviceLocation: {
						latitude: null,
						longitude: null,
						displayName: '',
						zipCode: '',
						locationLoaded: true
					}
				}
			}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('MISSING_COORDINATES');
	});

	it('returns invalid for TASKEE_LOCATION when only one coordinate is present', () => {
		const service: ServiceLocationInput = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					useGlobalLocation: false,
					serviceLocation: {
						latitude: 40.7128,
						longitude: null,
						displayName: '',
						zipCode: '',
						locationLoaded: true
					}
				}
			}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('MISSING_COORDINATES');
	});

	it('returns invalid for TASKEE_LOCATION when radius is out of range', () => {
		const service: ServiceLocationInput = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					useGlobalLocation: false,
					serviceLocation: {
						latitude: 40.7128,
						longitude: -74.006,
						displayName: '',
						zipCode: '',
						locationLoaded: true
					},
					serviceRadius: 0
				}
			}
		};
		let result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('INVALID_RADIUS');

		service.locationDetails = {
			taskeeLocation: {
				...service.locationDetails!.taskeeLocation!,
				serviceRadius: 101
			}
		};
		result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('INVALID_RADIUS');
	});

	it('allows TASKEE_LOCATION without explicit radius (uses default)', () => {
		const service: ServiceLocationInput = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					useGlobalLocation: false,
					serviceLocation: {
						latitude: 40.7128,
						longitude: -74.006,
						displayName: '',
						zipCode: '',
						locationLoaded: true
					}
				}
			}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(true);
	});

	it('returns valid for TASKER_LOCATION with valid coordinates', () => {
		const service: ServiceLocationInput = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKER_LOCATION],
			locationDetails: {
				taskerLocation: {
					serviceLocation: {
						latitude: 34.0522,
						longitude: -118.2437,
						displayName: '',
						zipCode: '',
						locationLoaded: true
					}
				}
			}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(true);
	});

	it('returns invalid for TASKER_LOCATION when coordinates are missing', () => {
		const service: ServiceLocationInput = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKER_LOCATION],
			locationDetails: {
				taskerLocation: {
					serviceLocation: {
						latitude: null,
						longitude: null,
						displayName: '',
						zipCode: '',
						locationLoaded: true
					}
				}
			}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('MISSING_COORDINATES');
	});

	it('returns valid for REMOTE location type without coordinates', () => {
		const service: ServiceLocationInput = {
			serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
			locationDetails: {}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(true);
	});

	it('handles undefined locationDetails gracefully', () => {
		const service: ServiceLocationInput = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: undefined as ServiceLocationInput['locationDetails']
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('MISSING_COORDINATES');
	});

	it('handles undefined taskeeLocation gracefully', () => {
		const service: ServiceLocationInput = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('MISSING_COORDINATES');
	});

	it('handles undefined taskerLocation gracefully', () => {
		const service: ServiceLocationInput = {
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKER_LOCATION],
			locationDetails: {}
		};
		const result = validateServiceLocation(service);
		expect(result.valid).toBe(false);
		expect(result.errorCode).toBe('MISSING_COORDINATES');
	});
});
