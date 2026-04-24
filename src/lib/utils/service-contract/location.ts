import type {
	ServiceContractAgreementSnapshot,
	ServiceContractLocationSnapshot
} from '$lib/types/contract';
import type { Service } from '$lib/types/service.d';
import type { Location } from '$lib/types/task.d';
import { ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
import { formatLocationAddress, generateGoogleMapsLink } from '$lib/utils/location/maps';

export interface ServiceContractLocationPresentation {
	label: string;
	mapLink: string | null;
	mode: ServiceContractLocationSnapshot['mode'];
}

function buildMapSearchLink(label: string): string {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
}

function normalizeLocationLabel(location?: Location, fallbackLabel?: string): string | null {
	const fallback = fallbackLabel?.trim();
	if (location) {
		const formatted = formatLocationAddress(location).trim();
		if (formatted.length > 0) {
			return formatted;
		}
	}

	return fallback && fallback.length > 0 ? fallback : null;
}

function buildPresentation(
	snapshot: ServiceContractLocationSnapshot | null | undefined
): ServiceContractLocationPresentation | null {
	if (!snapshot) {
		return null;
	}

	const label = normalizeLocationLabel(snapshot.location, snapshot.label);
	if (!label) {
		return null;
	}

	return {
		label,
		mapLink: snapshot.location
			? generateGoogleMapsLink(snapshot.location, { label })
			: buildMapSearchLink(label),
		mode: snapshot.mode
	};
}

export function buildServiceContractLocationSnapshot(
	service: Pick<Service, 'serviceLocationTypes' | 'locationDetails'>
): ServiceContractLocationSnapshot | undefined {
	const locationTypes = service.serviceLocationTypes ?? [];
	const locationDetails = service.locationDetails;

	if (locationTypes.includes(ServiceLocationTypeEnum.TASKEE_LOCATION)) {
		const location = locationDetails?.taskeeLocation?.serviceLocation;
		const label = normalizeLocationLabel(
			location,
			locationDetails?.taskeeLocation?.locationDisplayName
		);
		if (label) {
			return {
				mode: 'taskee_location',
				label,
				location: location ?? undefined
			};
		}
	}

	if (locationTypes.includes(ServiceLocationTypeEnum.TASKER_LOCATION)) {
		const location = locationDetails?.taskerLocation?.serviceLocation;
		const label = normalizeLocationLabel(location);
		if (label) {
			return {
				mode: 'tasker_location',
				label,
				location
			};
		}
	}

	return undefined;
}

export function getServiceContractLocationPresentationFromAgreementSnapshot(
	agreementSnapshot: ServiceContractAgreementSnapshot | null | undefined
): ServiceContractLocationPresentation | null {
	return buildPresentation(agreementSnapshot?.serviceLocation);
}

export function getServiceContractLocationPresentationFromService(
	service: Service | null | undefined
): ServiceContractLocationPresentation | null {
	if (!service) {
		return null;
	}

	return buildPresentation(buildServiceContractLocationSnapshot(service));
}

export interface ServiceLocationValidationResult {
	valid: boolean;
	errorCode?:
		| 'MISSING_LOCATION_TYPE'
		| 'MISSING_COORDINATES'
		| 'INVALID_RADIUS'
		| 'LOCATION_TYPE_MISMATCH';
	errorMessage?: string;
}

export function validateServiceLocation(
	service: Pick<Service, 'serviceLocationTypes' | 'locationDetails'>
): ServiceLocationValidationResult {
	const locationTypes = service.serviceLocationTypes ?? [];

	if (locationTypes.length === 0) {
		return {
			valid: false,
			errorCode: 'MISSING_LOCATION_TYPE',
			errorMessage: 'Service must have at least one location type'
		};
	}

	const primaryLocationType = locationTypes[0];

	if (primaryLocationType === ServiceLocationTypeEnum.TASKEE_LOCATION) {
		const taskeeLoc = service.locationDetails?.taskeeLocation;
		if (!taskeeLoc?.serviceLocation?.latitude || !taskeeLoc?.serviceLocation?.longitude) {
			return {
				valid: false,
				errorCode: 'MISSING_COORDINATES',
				errorMessage: 'Taskee location requires valid coordinates'
			};
		}
		if (
			taskeeLoc.serviceRadius != null &&
			(taskeeLoc.serviceRadius < 1 || taskeeLoc.serviceRadius > 100)
		) {
			return {
				valid: false,
				errorCode: 'INVALID_RADIUS',
				errorMessage: 'Service radius must be between 1 and 100 km'
			};
		}
	}

	if (primaryLocationType === ServiceLocationTypeEnum.TASKER_LOCATION) {
		const taskerLoc = service.locationDetails?.taskerLocation;
		if (!taskerLoc?.serviceLocation?.latitude || !taskerLoc?.serviceLocation?.longitude) {
			return {
				valid: false,
				errorCode: 'MISSING_COORDINATES',
				errorMessage: 'Tasker location requires valid coordinates'
			};
		}
	}

	return { valid: true };
}
