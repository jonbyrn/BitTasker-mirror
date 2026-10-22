import { categoryById } from '$lib/search/taxonomy.js';
import { TASK_CATEGORIES, type Category } from '$lib/utils/constants/categories';
import { BudgetTypeEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
import type { Budget } from '$lib/types/task';
import type { QvacDraft } from '$lib/qvac/client';

export interface CategoryPatch {
	searchCategory: string;
	searchSubcategory: string;
	categories: Category[];
	mode: 'local' | 'remote';
}

const blankLocation = {
	displayName: '',
	longitude: null,
	latitude: null,
	zipCode: '',
	locationLoaded: false
};

/** Map a catalog id onto the fields the create-task and create-service forms store. */
export function categoryPatch(categoryId: string): CategoryPatch | null {
	const category = categoryById(categoryId);
	if (!category || category.id === 'temp-staff') return null;
	const legacyId = category.legacyCategoryIds[0] || category.hintLegacyIds?.[0];
	const legacy = TASK_CATEGORIES.find((item) => item.id === legacyId) ?? null;
	return {
		searchCategory: category.id,
		searchSubcategory: '',
		categories: legacy ? [legacy] : [],
		mode: category.mode
	};
}

/** Fill the task draft from a local-model reply. The price is the middle of the suggested range. */
export function taskPatchFromDraft(draft: QvacDraft, budget: Budget) {
	const category = draft.categoryId ? categoryPatch(draft.categoryId) : null;
	const amount = Math.round((draft.priceLow + draft.priceHigh) / 2);
	return {
		title: draft.title,
		description: draft.description,
		...(category
			? {
					searchCategory: category.searchCategory,
					searchSubcategory: '',
					categories: category.categories,
					taskType: category.mode === 'remote' ? TaskTypeEnum.REMOTE : TaskTypeEnum.IN_PERSON,
					...(category.mode === 'remote'
						? { pickupLocation: blankLocation, dropOffLocation: blankLocation }
						: {})
				}
			: {}),
		budget: {
			...budget,
			amount,
			type: draft.priceUnit === 'hour' ? BudgetTypeEnum.HOURLY : BudgetTypeEnum.FIXED
		}
	};
}
