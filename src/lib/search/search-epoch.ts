/** Monotonic ids so an older search response cannot overwrite a newer one. */

let tasksSearchEpoch = 0;
let servicesSearchEpoch = 0;

export function beginTasksSearch(): number {
	tasksSearchEpoch += 1;
	return tasksSearchEpoch;
}

export function isTasksSearchCurrent(epoch: number | undefined): boolean {
	return epoch === undefined || epoch === tasksSearchEpoch;
}

export function currentTasksSearchEpoch(): number {
	return tasksSearchEpoch;
}

export function beginServicesSearch(): number {
	servicesSearchEpoch += 1;
	return servicesSearchEpoch;
}

export function isServicesSearchCurrent(epoch: number | undefined): boolean {
	return epoch === undefined || epoch === servicesSearchEpoch;
}

export function currentServicesSearchEpoch(): number {
	return servicesSearchEpoch;
}
