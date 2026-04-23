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
