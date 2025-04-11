<!-- 
  Task Discovery Page
  Route for the enhanced task discovery feature that integrates
  filtering, recommendations, and saved searches 
-->
<script lang="ts">
  import TaskDiscovery from '$lib/components/task/TaskDiscovery.svelte';
</script>

<svelte:head>
  <title>Discover Tasks | BitTasker</title>
  <meta name="description" content="Find tasks that match your skills, preferences, and availability on BitTasker" />
</svelte:head>

<TaskDiscovery />
