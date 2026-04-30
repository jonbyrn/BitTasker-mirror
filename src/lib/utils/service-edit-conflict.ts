export const SERVICE_EDIT_CONFLICT_CODE = 'service_edit_conflict' as const;

export interface ServiceEditConflictErrorOptions {
	dTag: string;
	expectedServiceEventId: string;
	latestServiceEventId: string;
}

export class ServiceEditConflictError extends Error {
	readonly code = SERVICE_EDIT_CONFLICT_CODE;
	readonly dTag: string;
	readonly expectedServiceEventId: string;
	readonly latestServiceEventId: string;

	constructor(options: ServiceEditConflictErrorOptions) {
		super(
			`This service was updated elsewhere. Refresh the editor to load the latest version before publishing again. (${SERVICE_EDIT_CONFLICT_CODE})`
		);
		this.name = 'ServiceEditConflictError';
		this.dTag = options.dTag;
		this.expectedServiceEventId = options.expectedServiceEventId;
		this.latestServiceEventId = options.latestServiceEventId;
	}
}

export function createServiceEditConflictError(
	options: ServiceEditConflictErrorOptions
): ServiceEditConflictError {
	return new ServiceEditConflictError(options);
}

export function isServiceEditConflictError(error: unknown): error is ServiceEditConflictError {
	return (
		error instanceof ServiceEditConflictError ||
		(typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error as { code?: unknown }).code === SERVICE_EDIT_CONFLICT_CODE)
	);
}

export function getServiceEditConflictMessage(): string {
	return `This service was updated elsewhere. Refresh the editor to load the latest version before publishing again. (${SERVICE_EDIT_CONFLICT_CODE})`;
}
