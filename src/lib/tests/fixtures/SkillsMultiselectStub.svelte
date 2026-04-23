<script lang="ts">
	const { selectedSkills = [] } = $props<{
		selectedSkills?: string[];
	}>();
</script>

<div data-testid="skills-multiselect">{selectedSkills.length}</div>
