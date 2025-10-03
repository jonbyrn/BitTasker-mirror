<script lang="ts">
  import { taskTranslationService } from '$lib/services/task-translation.service';
  import { currentUserLanguage } from '$lib/stores/translation.store';
  import type { Task, TaskTranslation } from '$lib/types/task';
  
  let { 
    task, 
    showToggle = true,
    showTitle = true,
    showDescription = true,
    titleClass = "text-lg font-semibold",
    descriptionClass = "text-sm text-base-content/80"
  } = $props<{ 
    task: Task; 
    showToggle?: boolean;
    showTitle?: boolean;
    showDescription?: boolean;
    titleClass?: string;
    descriptionClass?: string;
  }>();
  
  let translatedTask = $state<TaskTranslation | null>(null);
  let isTranslating = $state(false);
  let showOriginal = $state(false);
  let translationError = $state(false);

  $effect(() => {
    const userLang = $currentUserLanguage;
    if (userLang && task) {
      translateTask(userLang);
    }
  });

  async function translateTask(targetLanguage: string) {
    if (!task) return;
    
    isTranslating = true;
    translationError = false;
    
    try {
      translatedTask = await taskTranslationService.translateTask(task, targetLanguage);
      if (!translatedTask) {
        translationError = true;
      }
    } catch (error) {
      console.error('Translation failed:', error);
      translationError = true;
    } finally {
      isTranslating = false;
    }
  }

  function toggleTranslation() {
    showOriginal = !showOriginal;
  }
</script>

<div class="translatable-task">
  {#if isTranslating}
    <div class="animate-pulse">
      {#if showTitle}
        <div class="h-6 bg-gray-200 rounded mb-2"></div>
      {/if}
      {#if showDescription}
        <div class="h-4 bg-gray-200 rounded w-3/4"></div>
      {/if}
    </div>
  {:else if translatedTask && !showOriginal}
    <!-- Translated content -->
    {#if showTitle}
      <span class="text-sm md:text-lg font-semibold">{translatedTask.translatedTitle}</span>
    {/if}
    {#if showDescription}
      <p class={descriptionClass}>{translatedTask.translatedDescription}</p>
    {/if}
    
    {#if showToggle}
      <button 
        class="text-xs text-blue-500 hover:text-blue-700 transition-colors" 
        onclick={toggleTranslation}
      >
        {translatedTask.targetLanguage === 'es' ? 'Ver original' : 'View original'}
      </button>
    {/if}
  {:else}
    <!-- Original content -->
    {#if showTitle}
      <span class="text-sm md:text-lg font-semibold" > {task.title}</span> 
    {/if}
    {#if showDescription}
      <p class={descriptionClass}>{task.description}</p>
    {/if}
    
    {#if translatedTask && showToggle}
      <button 
        class="text-xs text-blue-500 hover:text-blue-700 transition-colors" 
        onclick={toggleTranslation}
      >
        {translatedTask.targetLanguage === 'es' ? 'Traducir' : 'Translate'}
      </button>
    {/if}
  {/if}
</div>