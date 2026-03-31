<script lang="ts">
	const { selectedCategories = [], externalCategoryIds = [] } = $props<{
		selectedCategories?: string[];
		externalCategoryIds?: string[];
	}>();
</script>

<div data-testid="category-multiselect">
	{selectedCategories.length || externalCategoryIds.length}
</div>
