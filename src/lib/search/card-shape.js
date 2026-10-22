/** @param {unknown} value */
export function numericAmount(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const amount = Number(value);
		if (Number.isFinite(amount)) return amount;
	}
	return null;
}

/**
 * Cards read `task.budget.amount`. Typesense documents store `price_usd`.
 * @param {Record<string, any> | null | undefined} record
 */
export function taskBudget(record) {
	const existing = record?.budget && typeof record.budget === 'object' ? record.budget : null;
	const amount =
		numericAmount(existing?.amount) ??
		numericAmount(record?.price_usd) ??
		numericAmount(record?.price) ??
		0;
	return {
		...(existing || {}),
		amount,
		currency: existing?.currency || record?.currency || 'USD',
		type: existing?.type || 'FIXED'
	};
}

/** @param {Record<string, any> | null | undefined} record */
export function withTaskBudget(record) {
	if (!record || typeof record !== 'object') return record;
	return { ...record, budget: taskBudget(record) };
}

/**
 * Service cards read `service.pricing`. Indexed docs only have `price_usd`.
 * @param {Record<string, any> | null | undefined} record
 */
export function servicePricing(record) {
	const existing = record?.pricing && typeof record.pricing === 'object' ? record.pricing : null;
	const fromPrice = numericAmount(record?.price_usd) ?? numericAmount(record?.price);
	if (existing) {
		const amount = numericAmount(existing.amount) ?? fromPrice ?? 0;
		return {
			...existing,
			amount,
			currency: existing.currency || record?.currency || 'USD',
			type: existing.type || 'FIXED'
		};
	}
	return {
		type: 'FIXED',
		currency: record?.currency || 'USD',
		amount: fromPrice ?? 0
	};
}

/** @param {Record<string, any> | null | undefined} record */
export function withServicePricing(record) {
	if (!record || typeof record !== 'object') return record;
	const hasPrice = numericAmount(record.price_usd) != null || numericAmount(record.price) != null;
	const hasPricing = record.pricing && typeof record.pricing === 'object';
	const next = { ...record };
	if (hasPricing || hasPrice) next.pricing = servicePricing(record);
	for (const key of ['serviceLocationTypes', 'categories', 'skills', 'portfolio']) {
		if (record[key] != null && !Array.isArray(record[key])) next[key] = [];
	}
	return next;
}

/**
 * The public count is the hits we actually return. A Typesense `found` of 555
 * must not be reported when only two documents are in the payload.
 * @param {{ type?: string } | null | undefined} query
 * @param {{ tasks?: any[]; services?: any[]; shifts?: any[]; profiles?: any[] }} grouped
 */
export function resultTotal(query, grouped) {
	const tasks = grouped.tasks || [];
	const services = grouped.services || [];
	const shifts = grouped.shifts || [];
	const profiles = grouped.profiles || [];
	if (query?.type === 'task') return tasks.length;
	if (query?.type === 'service') return services.length;
	if (query?.type === 'shift') return shifts.length;
	if (query?.type === 'profile') return profiles.length;
	return tasks.length + services.length + shifts.length + profiles.length;
}
